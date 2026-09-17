"use client";

import React, { useState, useMemo } from "react";
import { CardItem, CDPCardSchema, getKeyCardFlags } from "@/types/card";
import { Download, RefreshCw, AlertCircle, CheckCircle, Edit3, Eye, Trash2, BookmarkPlus, BookmarkCheck, Search, X, Zap } from "lucide-react";
import { exportCardsToCSV } from "@/lib/csvExport";
import { generateCdpTitle } from "@/lib/titleGenerator";

interface CardTableProps {
  items: CardItem[];
  setItems: React.Dispatch<React.SetStateAction<CardItem[]>>;
  onReidentifyCard: (cardId: string) => void;
  saveCard: (item: CardItem) => Promise<boolean> | boolean;
  saveBatch: (items: CardItem[]) => Promise<number> | number;
  isSaved: (id: string) => boolean;
  onInspectCard?: (card: CardItem) => void;
  onRemoveCard?: (id: string) => void;
}

export function CardTable({
  items,
  setItems,
  onReidentifyCard,
  saveCard,
  saveBatch,
  isSaved,
  onInspectCard,
  onRemoveCard,
}: CardTableProps) {
  const [selectedPreview, setSelectedPreview] = useState<CardItem | null>(null);
  const [saveBatchMessage, setSaveBatchMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase().trim();
    const tokens = term.split(/\s+/).filter(Boolean);
    const toStr = (val: any) => (val !== null && val !== undefined ? String(val).toLowerCase() : "");

    return items.filter((item) => {
      const card = item.data;
      const prefix = toStr(item.prefix);
      const title = toStr(card ? generateCdpTitle(card) : "");
      const player = toStr(card?.playerName || (card as any)?.subject || (card as any)?.player);
      const brand = toStr(card?.brand);
      const set = toStr(card?.setName);
      const num = toStr(card?.cardNumber);
      const cleanNum = num.replace(/#/g, "");
      const team = toStr(card?.team);

      const fullText = `${prefix} ${title} ${player} ${brand} ${set} ${num} ${cleanNum} #${cleanNum} ${team}`;
      return tokens.every((token) => {
        const cleanToken = token.replace(/^[#]/, "");
        return fullText.includes(token) || (cleanToken.length > 0 && fullText.includes(cleanToken));
      });
    });
  }, [items, searchTerm]);

  const batchAiStats = useMemo(() => {
    let totalCost = 0;
    let totalTokens = 0;
    let cardsWithCost = 0;

    items.forEach((item) => {
      const usage = item.aiUsage || (item.data as any)?.aiUsage;
      if (usage) {
        totalCost += usage.costUsd || 0;
        totalTokens += usage.totalTokens || 0;
        cardsWithCost++;
      }
    });

    const avgCostPerCard = cardsWithCost > 0 ? totalCost / cardsWithCost : 0;

    return {
      totalCost,
      totalTokens,
      cardsWithCost,
      avgCostPerCard,
    };
  }, [items]);

  const handleUpdateField = (id: string, field: keyof CDPCardSchema, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentData: CDPCardSchema = item.data || {
          playerName: "",
          brand: "",
          setName: "",
          cardNumber: "",
          subsetParallel: "",
          team: "",
          sport: "",
          year: new Date().getFullYear(),
          isRookie: false,
          isAutographed: false,
          isMemorabilia: false,
          isNumbered: false,
        };

        return {
          ...item,
          data: {
            ...currentData,
            [field]: value,
          },
        };
      })
    );
  };

  const handleRemove = (id: string) => {
    if (onRemoveCard) {
      onRemoveCard(id);
    } else {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleSaveBatchAll = async () => {
    const count = await saveBatch(items);
    if (count > 0) {
      setSaveBatchMessage(`Successfully saved ${count} card${count > 1 ? "s" : ""} to your collection!`);
    } else {
      setSaveBatchMessage("No new identified cards to save.");
    }
    setTimeout(() => setSaveBatchMessage(null), 3000);
  };

  const identifiedCount = items.filter((i) => i.status === "success").length;

  return (
    <div className="space-y-4">
      {/* Header & Staging Batch Approval Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-5 backdrop-blur-md shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2 flex-wrap">
              <span>📥 Batch Upload Staging Queue</span>
              <span className="rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-0.5 text-xs font-mono font-bold text-cyan-300">
                {items.length} Card{items.length === 1 ? "" : "s"} Staged
              </span>
              {batchAiStats.cardsWithCost > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-400 shadow-sm"
                  title={`${batchAiStats.cardsWithCost} cards identified with Gemini 3.5 Flash-Lite | Total Tokens: ${batchAiStats.totalTokens.toLocaleString()}`}
                >
                  <Zap className="h-3 w-3 fill-emerald-400 text-emerald-400" />
                  <span>
                    Batch Cost: ${batchAiStats.totalCost < 0.01 ? batchAiStats.totalCost.toFixed(4) : batchAiStats.totalCost.toFixed(3)}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    (avg ${batchAiStats.avgCostPerCard.toFixed(4)}/card)
                  </span>
                </span>
              )}
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Review and approve your uploads here before clicking <strong className="text-cyan-300">&quot;Add to Collection&quot;</strong>. All metadata can be edited prior to final save.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Staging Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter staged cards..."
              className="w-full pl-8 pr-7 py-2 bg-slate-950/90 border border-slate-700/80 focus:border-cyan-400 rounded-xl text-xs font-mono text-slate-100 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-2 p-0.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {saveBatchMessage && (
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl animate-fade-in">
              ✓ {saveBatchMessage}
            </span>
          )}

          {/* Add Staged Batch to Collection Button */}
          <button
            onClick={handleSaveBatchAll}
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 px-5 py-2.5 text-xs font-black text-white shadow-xl shadow-cyan-500/25 transition active:scale-95 ring-2 ring-cyan-500/30"
          >
            <BookmarkPlus className="h-4 w-4" /> 📥 Add Staged Batch to Collection
          </button>

          {/* Export CDP CSV Button */}
          <button
            onClick={() => exportCardsToCSV(items)}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition active:scale-95"
          >
            <Download className="h-4 w-4" /> Export CDP CSV
          </button>
        </div>
      </div>

      {/* Editable Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-2xl backdrop-blur-md">
        <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[1250px]">
          <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
            <tr>
              <th className="p-3 w-16 text-center">Preview</th>
              <th className="p-3 w-28">Prefix ID</th>
              <th className="p-3 min-w-[220px]">CDP Title</th>
              <th className="p-3 w-28">Est. Value</th>
              <th className="p-3 min-w-[140px]">Player Name</th>
              <th className="p-3 min-w-[120px]">Brand</th>
              <th className="p-3 min-w-[160px]">Set Name</th>
              <th className="p-3 w-24">Card #</th>
              <th className="p-3 min-w-[140px]">Subset / Parallel</th>
              <th className="p-3 min-w-[120px]">Team</th>
              <th className="p-3 w-24">Sport</th>
              <th className="p-3 w-20">Year</th>
              <th className="p-3 w-36 text-center">Flags</th>
              <th className="p-3 w-24 text-center">Status</th>
              <th className="p-3 w-28 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={15} className="p-8 text-center text-slate-400 font-mono text-xs">
                  No staged cards match &quot;{searchTerm}&quot;.
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="ml-2 text-cyan-400 hover:underline"
                  >
                    Clear filter
                  </button>
                </td>
              </tr>
            ) : (
              displayedItems.map((item) => {
              const d = item.data || {
                playerName: "",
                brand: "",
                setName: "",
                cardNumber: "",
                subsetParallel: "",
                team: "",
                sport: "",
                year: 0,
                isRookie: false,
                isAutographed: false,
                isMemorabilia: false,
                isNumbered: false,
              };

              const saved = isSaved(item.id);

              return (
                <tr key={item.id} className="hover:bg-slate-900/50 transition">
                  {/* Thumbnails */}
                  <td className="p-2 text-center">
                    <div
                      onClick={() => onInspectCard ? onInspectCard(item) : setSelectedPreview(item)}
                      className="cursor-pointer flex items-center justify-center -space-x-2 hover:scale-105 transition"
                      title="Inspect Card Details"
                    >
                      {item.frontPreview ? (
                        <img
                          src={item.frontPreview}
                          alt="Front"
                          className="h-10 w-8 object-cover rounded border border-slate-700 shadow-md"
                        />
                      ) : (
                        <div className="h-10 w-8 rounded border border-slate-800 bg-slate-900 flex items-center justify-center text-[9px] text-slate-500 font-mono">
                          NO FRONT
                        </div>
                      )}
                      {item.backPreview && (
                        <img
                          src={item.backPreview}
                          alt="Back"
                          className="h-10 w-8 object-cover rounded border border-slate-700 shadow-md"
                        />
                      )}
                    </div>
                  </td>

                  {/* Prefix ID & AI Cost */}
                  <td className="p-2 font-mono font-semibold text-slate-300 text-[11px]">
                    <div>{item.prefix}</div>
                    {(item.aiUsage || (item.data as any)?.aiUsage) && (
                      <div
                        className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-1.5 py-0.5 rounded inline-flex items-center gap-1 mt-1 shadow-sm"
                        title={`Model: ${(item.aiUsage || (item.data as any)?.aiUsage).model} | Prompt: ${(item.aiUsage || (item.data as any)?.aiUsage).promptTokens} tok | Output: ${(item.aiUsage || (item.data as any)?.aiUsage).outputTokens} tok | Total: ${(item.aiUsage || (item.data as any)?.aiUsage).totalTokens} tok`}
                      >
                        <span className="text-amber-300">⚡</span>
                        <span>
                          ${(item.aiUsage || (item.data as any)?.aiUsage).costUsd < 0.001
                            ? (item.aiUsage || (item.data as any)?.aiUsage).costUsd.toFixed(4)
                            : (item.aiUsage || (item.data as any)?.aiUsage).costUsd.toFixed(3)}
                        </span>
                        <span className="text-slate-400 text-[8px]">({(item.aiUsage || (item.data as any)?.aiUsage).totalTokens}t)</span>
                      </div>
                    )}
                  </td>

                  {/* CDP Title */}
                  <td className="p-2 font-mono font-bold text-cyan-300 text-[11px] max-w-[260px]" title={generateCdpTitle(d)}>
                    <div className="flex flex-col gap-1">
                      <span className="truncate">{generateCdpTitle(d) || "-"}</span>
                      {(() => {
                        const keyEval = getKeyCardFlags(item);
                        if (keyEval.isKeyUncomped) {
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-black">
                                ⚠️ Uncomped Key Card
                              </span>
                              {keyEval.badges.map((b) => (
                                <span
                                  key={b}
                                  className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold border ${
                                    b === "RC"
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                      : b.startsWith("Numbered")
                                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                      : b === "Autograph"
                                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  }`}
                                >
                                  [{b}]
                                </span>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>

                  {/* Est. Value */}
                  <td className="p-2 font-mono font-bold text-emerald-400 text-[11px]">
                    {d.estimatedValue !== undefined && d.estimatedValue > 0 ? `$${d.estimatedValue.toFixed(2)}` : "-"}
                  </td>

                  {/* Player Name */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.playerName}
                      onChange={(e) => handleUpdateField(item.id, "playerName", e.target.value)}
                      placeholder="Player Name"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Brand */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.brand}
                      onChange={(e) => handleUpdateField(item.id, "brand", e.target.value)}
                      placeholder="Brand"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Set Name */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.setName}
                      onChange={(e) => handleUpdateField(item.id, "setName", e.target.value)}
                      placeholder="Set Name"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Card Number */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.cardNumber}
                      onChange={(e) => handleUpdateField(item.id, "cardNumber", e.target.value.replace(/#/g, ""))}
                      placeholder="Card #"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-cyan-300 font-mono focus:outline-none"
                    />
                  </td>

                  {/* Subset / Parallel */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.subsetParallel}
                      onChange={(e) => handleUpdateField(item.id, "subsetParallel", e.target.value)}
                      placeholder="Parallel / Finish"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Team */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.team}
                      onChange={(e) => handleUpdateField(item.id, "team", e.target.value)}
                      placeholder="Team"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Sport */}
                  <td className="p-1">
                    <input
                      type="text"
                      value={d.sport}
                      onChange={(e) => handleUpdateField(item.id, "sport", e.target.value)}
                      placeholder="Sport"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
                    />
                  </td>

                  {/* Year */}
                  <td className="p-1">
                    <input
                      type="number"
                      value={d.year || ""}
                      onChange={(e) => handleUpdateField(item.id, "year", parseInt(e.target.value) || 0)}
                      placeholder="Year"
                      className="w-full bg-slate-900/60 border border-slate-800 focus:border-cyan-500 rounded px-2 py-1 text-xs text-slate-100 font-mono focus:outline-none"
                    />
                  </td>

                  {/* Flags */}
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <label title="Rookie Card" className={`cursor-pointer px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${d.isRookie ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-slate-900 text-slate-600 border-slate-800"}`}>
                        <input
                          type="checkbox"
                          checked={d.isRookie}
                          onChange={(e) => handleUpdateField(item.id, "isRookie", e.target.checked)}
                          className="hidden"
                        />
                        RC
                      </label>

                      <label title="Autographed" className={`cursor-pointer px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${d.isAutographed ? "bg-purple-500/20 text-purple-300 border-purple-500/40" : "bg-slate-900 text-slate-600 border-slate-800"}`}>
                        <input
                          type="checkbox"
                          checked={d.isAutographed}
                          onChange={(e) => handleUpdateField(item.id, "isAutographed", e.target.checked)}
                          className="hidden"
                        />
                        AUTO
                      </label>

                      <label title="Memorabilia / Relic" className={`cursor-pointer px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${d.isMemorabilia ? "bg-blue-500/20 text-blue-300 border-blue-500/40" : "bg-slate-900 text-slate-600 border-slate-800"}`}>
                        <input
                          type="checkbox"
                          checked={d.isMemorabilia}
                          onChange={(e) => handleUpdateField(item.id, "isMemorabilia", e.target.checked)}
                          className="hidden"
                        />
                        MEM
                      </label>

                      <label title="Numbered" className={`cursor-pointer px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${d.isNumbered ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-slate-900 text-slate-600 border-slate-800"}`}>
                        <input
                          type="checkbox"
                          checked={d.isNumbered}
                          onChange={(e) => handleUpdateField(item.id, "isNumbered", e.target.checked)}
                          className="hidden"
                        />
                        #
                      </label>
                    </div>
                  </td>

                  {/* Status Indicator */}
                  <td className="p-2 text-center">
                    {item.status === "processing" && (
                      <span className="inline-flex items-center gap-1 text-cyan-400 font-medium">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Scanning
                      </span>
                    )}
                    {item.status === "success" && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <CheckCircle className="h-3.5 w-3.5" /> Ready
                      </span>
                    )}
                    {item.status === "error" && (
                      <span title={item.errorMessage} className="inline-flex items-center gap-1 text-rose-400 font-medium cursor-help">
                        <AlertCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    )}
                    {item.status === "idle" && (
                      <span className="text-slate-500 font-medium">Pending</span>
                    )}
                  </td>

                  {/* Actions (Save / Reidentify / Delete) */}
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* Save to Collection Button */}
                      <button
                        onClick={() => saveCard(item)}
                        disabled={item.status !== "success" || saved}
                        title={saved ? "Already saved in collection" : "Save to Online Collection"}
                        className={`p-1.5 rounded transition ${
                          saved
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-300 border border-slate-800 disabled:opacity-30"
                        }`}
                      >
                        {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                      </button>

                      {/* Inspect Card Details Button */}
                      {onInspectCard && (
                        <button
                          onClick={() => onInspectCard(item)}
                          title="Inspect & Edit Full Card Details"
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition border border-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => onReidentifyCard(item.id)}
                        title="Re-run AI Identification"
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition border border-slate-800"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        title="Remove"
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition border border-slate-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        </table>
      </div>

      {/* Full Preview Modal */}
      {selectedPreview && (
        <div
          onClick={() => setSelectedPreview(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  {selectedPreview.data?.playerName || selectedPreview.prefix}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedPreview.data?.setName} • {selectedPreview.data?.cardNumber ? `#${selectedPreview.data.cardNumber}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelectedPreview(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold px-2 py-1 rounded bg-slate-800"
              >
                Close ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Front Image</span>
                <div className="aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                  {selectedPreview.frontPreview ? (
                    <img src={selectedPreview.frontPreview} alt="Front" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-500">No Front Image</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Back Image</span>
                <div className="aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                  {selectedPreview.backPreview ? (
                    <img src={selectedPreview.backPreview} alt="Back" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-500">No Back Image</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
