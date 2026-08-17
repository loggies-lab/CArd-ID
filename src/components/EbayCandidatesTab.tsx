"use client";

import React, { useState, useMemo } from "react";
import { SavedCollectionItem, CardItem, CDPCardSchema } from "@/types/card";
import { generateCdpTitle } from "@/lib/titleGenerator";
import { exportSavedCollectionToCSV } from "@/lib/csvExport";
import {
  Tag,
  Sparkles,
  Award,
  Download,
  Search,
  CheckSquare,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Eye,
  TrendingUp,
  PackageX,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface EbayCandidatesTabProps {
  savedCards: SavedCollectionItem[];
  scannerItems?: CardItem[];
  minEbayThreshold?: number;
  onInspectCard?: (card: SavedCollectionItem) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema }[]) => void;
  onNavigateToGrading?: () => void;
}

type SortField = "price" | "title" | "player" | "year";

export function EbayCandidatesTab({
  savedCards,
  minEbayThreshold = 4.0,
  onInspectCard,
  updateSavedCardDataBatch,
  onNavigateToGrading,
}: EbayCandidatesTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<SortField>("price");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Comps Execution State
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentTitle: string } | null>(null);

  // Split collection into eBay Singles (>= $4.00) vs Bulk Lot ($1.00 - $3.99)
  const { ebayCandidates, bulkLotCards, totalEbayValue, totalBulkValue } = useMemo(() => {
    const ebayList: SavedCollectionItem[] = [];
    const bulkList: SavedCollectionItem[] = [];
    let ebaySum = 0;
    let bulkSum = 0;

    savedCards.forEach((card) => {
      const val = card.data.estimatedValue || 0;
      if (val >= minEbayThreshold) {
        ebayList.push(card);
        ebaySum += val;
      } else {
        bulkList.push(card);
        bulkSum += val;
      }
    });

    return {
      ebayCandidates: ebayList,
      bulkLotCards: bulkList,
      totalEbayValue: ebaySum,
      totalBulkValue: bulkSum,
    };
  }, [savedCards, minEbayThreshold]);

  // Filtered & Sorted eBay Candidates list
  const filteredCandidates = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const list = ebayCandidates.filter((item) => {
      const card = item.data;
      return (
        !searchTerm ||
        card.playerName.toLowerCase().includes(term) ||
        card.brand.toLowerCase().includes(term) ||
        card.setName.toLowerCase().includes(term) ||
        card.team.toLowerCase().includes(term) ||
        card.cardNumber.toLowerCase().includes(term) ||
        item.prefix.toLowerCase().includes(term)
      );
    });

    return list.sort((a, b) => {
      let comp = 0;
      if (sortBy === "price") {
        comp = (a.data.estimatedValue || 0) - (b.data.estimatedValue || 0);
      } else if (sortBy === "player") {
        comp = (a.data.playerName || "").localeCompare(b.data.playerName || "");
      } else if (sortBy === "title") {
        comp = generateCdpTitle(a.data).localeCompare(generateCdpTitle(b.data));
      } else if (sortBy === "year") {
        comp = (a.data.year || 0) - (b.data.year || 0);
      }
      return sortOrder === "asc" ? comp : -comp;
    });
  }, [ebayCandidates, searchTerm, sortBy, sortOrder]);

  const handleCopyTitle = (card: SavedCollectionItem) => {
    const title = generateCdpTitle(card.data);
    navigator.clipboard.writeText(title);
    setCopiedId(card.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportEbayCSV = () => {
    exportSavedCollectionToCSV(filteredCandidates, `ebay_singles_candidates_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCandidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidates.map((c) => c.id)));
    }
  };

  // Run Comps for Selected Candidates
  const handleRunCompsForSelected = async () => {
    if (selectedIds.size === 0 || isBulkRunning || !updateSavedCardDataBatch) return;

    const cardsToValuate = savedCards.filter((c) => selectedIds.has(c.id));
    setIsBulkRunning(true);
    const updates: { id: string; data: CDPCardSchema }[] = [];

    for (let i = 0; i < cardsToValuate.length; i++) {
      const item = cardsToValuate[i];
      const title = generateCdpTitle(item.data);
      setBulkProgress({ current: i + 1, total: cardsToValuate.length, currentTitle: title });

      try {
        const res = await fetch("/api/comps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: title, includeGraded: true }),
        });

        if (res.ok) {
          const comps = await res.json();
          const estVal = comps.estimatedMarketValue || comps.medianPrice || 0;
          if (estVal > 0) {
            updates.push({
              id: item.id,
              data: {
                ...item.data,
                estimatedValue: estVal,
                gradingAnalysis: comps.gradingAnalysis,
                valueLastUpdated: new Date().toISOString(),
              },
            });
          }
        }
      } catch (err) {
        console.error("Bulk comps error:", err);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (updates.length > 0) {
      updateSavedCardDataBatch(updates);
    }
    setIsBulkRunning(false);
    setBulkProgress(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs font-mono font-bold text-indigo-300">
              <Tag className="h-3.5 w-3.5 text-indigo-400" /> eBay Singles Candidates (≥ ${minEbayThreshold.toFixed(2)})
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-mono font-bold text-amber-300">
              <PackageX className="h-3.5 w-3.5 text-amber-400" /> Bulk Lot Filter ($1 – ${(minEbayThreshold - 0.01).toFixed(2)})
            </span>
          </div>

          <h2 className="text-3xl font-black text-white tracking-tight">
            eBay Singles Listing & Bulk Separation Pipeline
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Separate low-value bulk cards ($1–$4) from profitable single listings. Cards valued at <strong className="text-indigo-400">≥ ${minEbayThreshold.toFixed(2)}</strong> are pre-filtered here so you can generate listing titles, run comps, and audit for PSA grading potential.
          </p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* eBay Singles Stat */}
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-5 backdrop-blur-xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              eBay Singles (≥ ${minEbayThreshold.toFixed(2)})
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <Tag className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white font-mono">{ebayCandidates.length} cards</span>
            <span className="text-xs font-bold text-indigo-300 font-mono">${totalEbayValue.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-slate-400">Profitable for individual online listing.</p>
        </div>

        {/* Bulk Lot Stat */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-5 backdrop-blur-xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Bulk Lot Box ($1 – ${(minEbayThreshold - 0.01).toFixed(2)})
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <PackageX className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-400 font-mono">{bulkLotCards.length} cards</span>
            <span className="text-xs font-bold text-amber-300 font-mono">${totalBulkValue.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-slate-400">Pulled from online queue for local bulk sales.</p>
        </div>

        {/* PSA Upgrade Candidates Stat */}
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5 backdrop-blur-xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
              Grading ROI Candidates (≥ $30)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-cyan-400 font-mono">
              {ebayCandidates.filter((c) => (c.data.estimatedValue || 0) >= 30.0).length} cards
            </span>
            {onNavigateToGrading && (
              <button
                onClick={onNavigateToGrading}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline"
              >
                View ROI 🔥 →
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400">High-value cards ready for PSA submission audit.</p>
        </div>
      </div>

      {/* Bulk Progress Bar */}
      {isBulkRunning && bulkProgress && (
        <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/90 p-4 backdrop-blur-xl space-y-3 animate-fade-in shadow-2xl">
          <div className="flex items-center justify-between text-xs font-mono text-indigo-300 font-bold">
            <span>Fetching eBay Comps & PSA ROI ({bulkProgress.current} / {bulkProgress.total})</span>
            <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            ></div>
          </div>
          <p className="text-xs font-mono text-slate-400 truncate">
            Querying: <strong className="text-white">{bulkProgress.currentTitle}</strong>
          </p>
        </div>
      )}

      {/* Filter & Actions Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search eBay candidates by player, set, team..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs font-mono text-slate-100 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <button
                onClick={handleRunCompsForSelected}
                disabled={isBulkRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
              >
                <Zap className="h-4 w-4 fill-amber-300 text-amber-300" /> Run Comps on Selected ({selectedIds.size})
              </button>
            )}

            <button
              onClick={handleExportEbayCSV}
              disabled={filteredCandidates.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/20"
            >
              <Download className="h-4 w-4" /> Export eBay Titles CSV ({filteredCandidates.length})
            </button>
          </div>
        </div>
      </div>

      {/* Candidate Table */}
      {filteredCandidates.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-3 backdrop-blur-md">
          <Tag className="h-10 w-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No eBay Singles Candidates Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            All current cards in your collection are priced under ${minEbayThreshold.toFixed(2)} (or haven't had comps run yet). Run comps in My Collection to identify your $4+ single listings!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 uppercase text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Card</th>
                <th className="px-4 py-3">Generated eBay Listing Title</th>
                <th className="px-4 py-3 text-right">Est. Raw Value</th>
                <th className="px-4 py-3 text-center">PSA 10 ROI</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredCandidates.map((card) => {
                const title = generateCdpTitle(card.data);
                const isSelected = selectedIds.has(card.id);
                const val = card.data.estimatedValue || 0;
                const psa10Val = card.data.gradingAnalysis?.psa10Value;
                const isHighRoi = (card.data.gradingAnalysis?.netProfitPSA10 || 0) >= 15.0;

                return (
                  <tr
                    key={card.id}
                    className={`hover:bg-slate-800/50 transition ${
                      isSelected ? "bg-indigo-500/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectCard(card.id)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {card.frontPreview ? (
                          <img
                            src={card.frontPreview}
                            alt="Front"
                            className="w-10 h-14 object-cover rounded-lg border border-slate-800 shrink-0 cursor-pointer hover:scale-105 transition"
                            onClick={() => onInspectCard && onInspectCard(card)}
                          />
                        ) : (
                          <div className="w-10 h-14 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-[10px] text-slate-600 shrink-0">
                            RAW
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-100 text-xs">{card.data.playerName}</div>
                          <div className="text-[11px] text-slate-400">
                            {card.data.year} {card.data.brand} #{card.data.cardNumber}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-sm">{title}</span>
                        <button
                          onClick={() => handleCopyTitle(card)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                          title="Copy eBay Listing Title"
                        >
                          {copiedId === card.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-400 text-sm">
                      ${val.toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {psa10Val ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isHighRoi
                              ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {isHighRoi && <Award className="h-3 w-3 text-amber-400" />}
                          PSA 10: ${psa10Val.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {onInspectCard && (
                        <button
                          onClick={() => onInspectCard(card)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white transition"
                        >
                          <Eye className="h-3.5 w-3.5 text-cyan-400" /> Inspect / Comps
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
