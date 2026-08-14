"use client";

import React, { useState, useMemo } from "react";
import { SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { exportSavedCollectionToCSV } from "@/lib/csvExport";
import { generateCdpTitle } from "@/lib/titleGenerator";
import {
  Search,
  Download,
  Trash2,
  Sparkles,
  Award,
  Layers,
  Calendar,
  Grid,
  List,
  Tag,
  Eye,
  X,
  Star,
  CheckCircle,
  Filter,
  DollarSign,
  Zap,
  RefreshCw,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";

interface CollectionTabProps {
  savedCards: SavedCollectionItem[];
  removeCard: (id: string) => void;
  clearCollection: () => void;
  onInspectCard?: (card: SavedCollectionItem) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema }[]) => void;
}

export function CollectionTab({
  savedCards,
  removeCard,
  clearCollection,
  onInspectCard,
  updateSavedCardDataBatch,
}: CollectionTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSport, setSelectedSport] = useState("all");
  const [filterRookie, setFilterRookie] = useState(false);
  const [filterAuto, setFilterAuto] = useState(false);
  const [filterMem, setFilterMem] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Multi-select Checkbox State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Comps Execution State
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkCancelRequested, setBulkCancelRequested] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    pricedCount: number;
  } | null>(null);
  const [bulkSummaryMessage, setBulkSummaryMessage] = useState<string | null>(null);

  // Statistics calculation including Total Portfolio Worth
  const stats = useMemo(() => {
    const total = savedCards.length;
    const rookies = savedCards.filter((c) => c.data.isRookie).length;
    const autos = savedCards.filter((c) => c.data.isAutographed).length;
    const mems = savedCards.filter((c) => c.data.isMemorabilia).length;

    const valuedCards = savedCards.filter(
      (c) => c.data.estimatedValue !== undefined && c.data.estimatedValue > 0
    );
    const portfolioValue = valuedCards.reduce((sum, c) => sum + (c.data.estimatedValue || 0), 0);

    const unpricedCount = total - valuedCards.length;

    return { total, rookies, autos, mems, portfolioValue, valuedCount: valuedCards.length, unpricedCount };
  }, [savedCards]);

  // Unique sports list for filter dropdown
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    savedCards.forEach((c) => {
      if (c.data.sport) set.add(c.data.sport);
    });
    return Array.from(set).sort();
  }, [savedCards]);

  // Filtered collection list
  const filteredCards = useMemo(() => {
    return savedCards.filter((item) => {
      const card = item.data;
      const term = searchTerm.toLowerCase();

      const matchesSearch =
        !searchTerm ||
        card.playerName.toLowerCase().includes(term) ||
        card.brand.toLowerCase().includes(term) ||
        card.setName.toLowerCase().includes(term) ||
        card.team.toLowerCase().includes(term) ||
        card.cardNumber.toLowerCase().includes(term) ||
        item.prefix.toLowerCase().includes(term);

      const matchesSport = selectedSport === "all" || card.sport.toLowerCase() === selectedSport.toLowerCase();
      const matchesRookie = !filterRookie || card.isRookie;
      const matchesAuto = !filterAuto || card.isAutographed;
      const matchesMem = !filterMem || card.isMemorabilia;

      return matchesSearch && matchesSport && matchesRookie && matchesAuto && matchesMem;
    });
  }, [savedCards, searchTerm, selectedSport, filterRookie, filterAuto, filterMem]);

  // Selection Handlers
  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = useMemo(() => {
    if (filteredCards.length === 0) return false;
    return filteredCards.every((c) => selectedIds.has(c.id));
  }, [filteredCards, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCards.map((c) => c.id)));
    }
  };

  const selectUnpricedOnly = () => {
    const unpriced = savedCards.filter(
      (c) => c.data.estimatedValue === undefined || c.data.estimatedValue === 0
    );
    setSelectedIds(new Set(unpriced.map((c) => c.id)));
  };

  const handleExportCSV = () => {
    exportSavedCollectionToCSV(filteredCards, `my_card_collection_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Rate-limited Bulk Comps Execution Engine
  const handleRunBulkComps = async () => {
    if (selectedIds.size === 0 || isBulkRunning) return;

    const cardsToValuate = savedCards.filter((c) => selectedIds.has(c.id));
    if (cardsToValuate.length === 0) return;

    setIsBulkRunning(true);
    setBulkCancelRequested(false);
    setBulkSummaryMessage(null);

    const total = cardsToValuate.length;
    let pricedSuccessfully = 0;
    const pendingUpdates: { id: string; data: CDPCardSchema }[] = [];

    for (let i = 0; i < total; i++) {
      if (bulkCancelRequested) break;

      const item = cardsToValuate[i];
      const cardTitle = generateCdpTitle(item.data);

      setBulkProgress({
        current: i + 1,
        total,
        currentTitle: cardTitle,
        pricedCount: pricedSuccessfully,
      });

      try {
        const res = await fetch("/api/comps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: cardTitle }),
        });

        if (res.ok) {
          const compsData = await res.json();
          const estVal = compsData.estimatedMarketValue || compsData.medianPrice || 0;

          if (estVal > 0) {
            const updatedData: CDPCardSchema = {
              ...item.data,
              estimatedValue: estVal,
              valueLastUpdated: new Date().toISOString(),
            };
            pendingUpdates.push({ id: item.id, data: updatedData });
            pricedSuccessfully++;
          }
        }
      } catch (err) {
        console.error(`Failed to fetch comps for ${cardTitle}:`, err);
      }

      // 250ms throttle pause between requests to respect eBay rate limits
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (pendingUpdates.length > 0 && updateSavedCardDataBatch) {
      updateSavedCardDataBatch(pendingUpdates);
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    setBulkSummaryMessage(
      `Completed valuation! Applied market values to ${pricedSuccessfully} of ${total} selected card${total > 1 ? "s" : ""}.`
    );
    setTimeout(() => setBulkSummaryMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Analytics Counter Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Total Portfolio Value Card */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 backdrop-blur-xl flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider font-mono">Portfolio Worth</p>
            <p className="text-xl font-black text-white font-mono">${stats.portfolioValue.toFixed(2)}</p>
            <p className="text-[10px] text-emerald-400/80 font-mono">{stats.valuedCount} / {stats.total} Priced</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Cards</p>
            <p className="text-xl font-black text-white font-mono">{stats.total}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Rookie Cards</p>
            <p className="text-xl font-black text-white font-mono">{stats.rookies}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Autographs</p>
            <p className="text-xl font-black text-white font-mono">{stats.autos}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Memorabilia</p>
            <p className="text-xl font-black text-white font-mono">{stats.mems}</p>
          </div>
        </div>
      </div>

      {/* Bulk Comps Progress Banner */}
      {isBulkRunning && bulkProgress && (
        <div className="rounded-2xl border border-cyan-500/40 bg-slate-900/90 p-4 backdrop-blur-xl space-y-3 animate-fade-in shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin" />
              <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                eBay Comps Auto-Valuation in Progress ({bulkProgress.current} / {bulkProgress.total})
              </span>
            </div>
            <button
              onClick={() => setBulkCancelRequested(true)}
              className="text-xs font-mono font-bold text-rose-400 hover:text-rose-300 underline"
            >
              Cancel Batch
            </button>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full transition-all duration-300"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-300">
            <span className="truncate max-w-md text-slate-400">
              Querying eBay: <strong className="text-white">{bulkProgress.currentTitle}</strong>
            </span>
            <span className="text-emerald-400 font-bold">
              ✓ {bulkProgress.pricedCount} Cards Priced
            </span>
          </div>
        </div>
      )}

      {/* Summary Toast Notification */}
      {bulkSummaryMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-mono font-bold text-emerald-300 flex items-center justify-between animate-fade-in">
          <span>✓ {bulkSummaryMessage}</span>
          <button onClick={() => setBulkSummaryMessage(null)} className="text-emerald-400 hover:text-white">
            Dismiss ✕
          </button>
        </div>
      )}

      {/* Toolbar & Filter Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by player, set, team, brand, or number..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs font-mono text-slate-100 focus:outline-none"
            />
          </div>

          {/* Action Controls & Bulk Runner Button */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* BULK COMPS RUNNER BUTTON */}
            {selectedIds.size > 0 && (
              <button
                onClick={handleRunBulkComps}
                disabled={isBulkRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition active:scale-95 animate-pulse"
              >
                <Zap className="h-4 w-4 fill-amber-300 text-amber-300" /> Run Comps on Selected ({selectedIds.size})
              </button>
            )}

            {/* Select Unpriced Shortcut */}
            {stats.unpricedCount > 0 && (
              <button
                onClick={selectUnpricedOnly}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 transition"
              >
                <CheckSquare className="h-3.5 w-3.5" /> Select Unpriced ({stats.unpricedCount})
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md text-xs transition ${
                  viewMode === "grid" ? "bg-slate-800 text-cyan-400" : "text-slate-400 hover:text-slate-200"
                }`}
                title="Grid View"
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md text-xs transition ${
                  viewMode === "table" ? "bg-slate-800 text-cyan-400" : "text-slate-400 hover:text-slate-200"
                }`}
                title="Table View"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Export Collection CSV Button */}
            <button
              onClick={handleExportCSV}
              disabled={filteredCards.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/20"
            >
              <Download className="h-4 w-4" /> Export CSV ({filteredCards.length})
            </button>

            {/* Clear Collection */}
            {savedCards.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to clear your entire saved collection?")) {
                    clearCollection();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300 transition"
              >
                <Trash2 className="h-4 w-4" /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-3 flex-wrap border-t border-slate-800/80 pt-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Filters:
          </div>

          {/* Sport Selector */}
          <select
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Sports ({availableSports.length})</option>
            {availableSports.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>

          {/* Quick Toggle Filter Badges */}
          <button
            onClick={() => setFilterRookie((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition ${
              filterRookie
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
            }`}
          >
            ⭐ Rookie Only
          </button>

          <button
            onClick={() => setFilterAuto((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition ${
              filterAuto
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
            }`}
          >
            ✍️ Autograph Only
          </button>

          <button
            onClick={() => setFilterMem((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition ${
              filterMem
                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
            }`}
          >
            🏷️ Memorabilia Only
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2 ml-auto font-mono"
            >
              Deselect All ({selectedIds.size})
            </button>
          )}

          {(searchTerm || selectedSport !== "all" || filterRookie || filterAuto || filterMem) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedSport("all");
                setFilterRookie(false);
                setFilterAuto(false);
                setFilterMem(false);
              }}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Collection Content View */}
      {filteredCards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
            <Layers className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-200">
              {savedCards.length === 0 ? "Your Online Collection is Empty" : "No Cards Match Your Filters"}
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {savedCards.length === 0
                ? "Identify sports trading cards in the Batch Scanner tab and click 'Save to Collection' to build your persistent online portfolio."
                : "Try resetting your search term or active attribute filters to view all saved items."}
            </p>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredCards.map((item) => {
            const card = item.data;
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden shadow-xl flex flex-col justify-between ${
                  isSelected
                    ? "border-cyan-500 bg-slate-900 ring-2 ring-cyan-500/50"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                {/* Images Preview Section */}
                <div className="relative h-48 bg-slate-950 p-2 flex items-center justify-center gap-2 overflow-hidden">
                  {item.frontPreview ? (
                    <div
                      className="relative h-full w-1/2 rounded-lg overflow-hidden border border-slate-800 cursor-pointer group-hover:border-cyan-500/50 transition"
                      onClick={() => setPreviewImage(item.frontPreview || null)}
                    >
                      <img
                        src={item.frontPreview}
                        alt="Front"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 bg-slate-950/80 text-[9px] font-mono px-1 rounded text-slate-300">
                        FRONT
                      </span>
                    </div>
                  ) : (
                    <div className="h-full w-1/2 rounded-lg border border-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-600">
                      No Front
                    </div>
                  )}

                  {item.backPreview ? (
                    <div
                      className="relative h-full w-1/2 rounded-lg overflow-hidden border border-slate-800 cursor-pointer group-hover:border-cyan-500/50 transition"
                      onClick={() => setPreviewImage(item.backPreview || null)}
                    >
                      <img
                        src={item.backPreview}
                        alt="Back"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 bg-slate-950/80 text-[9px] font-mono px-1 rounded text-slate-300">
                        BACK
                      </span>
                    </div>
                  ) : (
                    <div className="h-full w-1/2 rounded-lg border border-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-600">
                      No Back
                    </div>
                  )}

                  {/* Top Badges & Selection Checkbox */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => toggleSelectCard(item.id)}
                      className="rounded-md bg-slate-950/90 border border-slate-800 p-1 text-cyan-300 hover:bg-cyan-500 hover:text-white transition"
                    >
                      {isSelected ? <CheckSquare className="h-4 w-4 text-cyan-400" /> : <Square className="h-4 w-4 text-slate-500" />}
                    </button>
                    <span className="rounded-md bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">
                      #{card.cardNumber || item.prefix}
                    </span>
                    {card.estimatedValue !== undefined && card.estimatedValue > 0 && (
                      <span className="rounded-md bg-emerald-500/90 border border-emerald-500/50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 shadow">
                        ${card.estimatedValue.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {onInspectCard && (
                      <button
                        onClick={() => onInspectCard(item)}
                        className="h-7 w-7 rounded-lg bg-slate-950/80 border border-slate-800 text-cyan-400 hover:bg-cyan-500 hover:text-white transition flex items-center justify-center shadow-lg"
                        title="Inspect & Edit Card Details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeCard(item.id)}
                      className="h-7 w-7 rounded-lg bg-slate-950/80 border border-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition flex items-center justify-center shadow-lg"
                      title="Remove from Collection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metadata Body */}
                <div
                  onClick={() => onInspectCard && onInspectCard(item)}
                  className="p-4 space-y-3 flex-1 flex flex-col justify-between cursor-pointer hover:bg-slate-900/90 transition"
                  title="Click to inspect full CDP card details"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="text-xs font-mono font-bold text-cyan-300 line-clamp-2 leading-snug" title={generateCdpTitle(card)}>
                        {generateCdpTitle(card) || card.playerName || "Unknown Card"}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1.5">
                      <span>{card.team || "N/A"}</span>
                      <span>•</span>
                      <span className="font-mono">{card.sport || "Sports"}</span>
                    </div>

                    {card.subsetParallel && (
                      <p className="text-[11px] text-cyan-400 font-mono mt-1 line-clamp-1">
                        {card.subsetParallel}
                      </p>
                    )}
                  </div>

                  {/* Feature Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
                    {card.isRookie && (
                      <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" /> ROOKIE
                      </span>
                    )}
                    {card.isAutographed && (
                      <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                        ✍️ AUTO
                      </span>
                    )}
                    {card.isMemorabilia && (
                      <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-indigo-300">
                        🏷️ MEM
                      </span>
                    )}
                    {card.isNumbered && (
                      <span className="rounded bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-purple-300">
                        # NUMBERED
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                    <span>ID: {item.prefix}</span>
                    <span>Added: {new Date(item.dateAdded).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW WITH MULTI-SELECT CHECKBOXES */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-800 accent-cyan-500 cursor-pointer h-4 w-4"
                      title="Select All Cards"
                    />
                  </th>
                  <th className="p-3">Card / Thumb</th>
                  <th className="p-3 min-w-[220px]">CDP Title</th>
                  <th className="p-3 font-mono font-bold text-emerald-400">Value ($)</th>
                  <th className="p-3">Player Name</th>
                  <th className="p-3">Year / Brand / Set</th>
                  <th className="p-3">Card #</th>
                  <th className="p-3">Team / Sport</th>
                  <th className="p-3">Parallel / Subset</th>
                  <th className="p-3">Flags</th>
                  <th className="p-3">Date Saved</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredCards.map((item) => {
                  const card = item.data;
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition ${
                        isSelected ? "bg-cyan-500/10 font-medium" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCard(item.id)}
                          className="rounded border-slate-800 accent-cyan-500 cursor-pointer h-4 w-4"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {item.frontPreview ? (
                            <img
                              src={item.frontPreview}
                              alt="Front"
                              className="h-10 w-8 object-cover rounded border border-slate-800 cursor-pointer hover:border-cyan-400"
                              onClick={() => setPreviewImage(item.frontPreview || null)}
                            />
                          ) : (
                            <div className="h-10 w-8 rounded border border-slate-800 bg-slate-950 flex items-center justify-center text-[8px] text-slate-600">
                              N/A
                            </div>
                          )}
                          {item.backPreview && (
                            <img
                              src={item.backPreview}
                              alt="Back"
                              className="h-10 w-8 object-cover rounded border border-slate-800 cursor-pointer hover:border-cyan-400"
                              onClick={() => setPreviewImage(item.backPreview || null)}
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-cyan-300 max-w-[240px] truncate" title={generateCdpTitle(card)}>
                        {generateCdpTitle(card) || "-"}
                      </td>
                      <td className="p-3 font-mono font-black text-emerald-400">
                        {card.estimatedValue !== undefined && card.estimatedValue > 0
                          ? `$${card.estimatedValue.toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="p-3 font-bold text-white">{card.playerName}</td>
                      <td className="p-3">
                        {card.year} {card.brand} {card.setName}
                      </td>
                      <td className="p-3 font-mono text-cyan-300">{card.cardNumber}</td>
                      <td className="p-3">
                        {card.team} <span className="text-slate-500">({card.sport})</span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{card.subsetParallel || "-"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {card.isRookie && (
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1 py-0.2 text-[9px] font-mono text-emerald-300">
                              RC
                            </span>
                          )}
                          {card.isAutographed && (
                            <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1 py-0.2 text-[9px] font-mono text-amber-300">
                              AUTO
                            </span>
                          )}
                          {card.isMemorabilia && (
                            <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-1 py-0.2 text-[9px] font-mono text-indigo-300">
                              MEM
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        {new Date(item.dateAdded).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onInspectCard && (
                            <button
                              onClick={() => onInspectCard(item)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition"
                              title="Inspect & Edit Card Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => removeCard(item.id)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
                            title="Delete Card"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewImage}
              alt="Full Preview"
              className="max-h-[80vh] w-auto object-contain rounded-xl border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
