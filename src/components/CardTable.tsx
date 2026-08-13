"use client";

import React, { useState } from "react";
import { CardItem, CDPCardSchema } from "@/types/card";
import { Download, RefreshCw, AlertCircle, CheckCircle, Edit3, Eye, Trash2, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { exportCardsToCSV } from "@/lib/csvExport";

interface CardTableProps {
  items: CardItem[];
  setItems: React.Dispatch<React.SetStateAction<CardItem[]>>;
  onReidentifyCard: (cardId: string) => void;
  saveCard: (item: CardItem) => Promise<boolean> | boolean;
  saveBatch: (items: CardItem[]) => Promise<number> | number;
  isSaved: (id: string) => boolean;
}

export function CardTable({
  items,
  setItems,
  onReidentifyCard,
  saveCard,
  saveBatch,
  isSaved,
}: CardTableProps) {
  const [selectedPreview, setSelectedPreview] = useState<CardItem | null>(null);
  const [saveBatchMessage, setSaveBatchMessage] = useState<string | null>(null);

  const handleUpdateField = (id: string, field: keyof CDPCardSchema, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentData: CDPCardSchema = item.data || {
          playerName: "",
          brand: "",
          setName: "",
          cardNumber: "",
          subsetParallel: "Base",
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
    setItems((prev) => prev.filter((i) => i.id !== id));
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
      {/* Header & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            Identified Cards Inventory
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-mono font-semibold text-cyan-400">
              {identifiedCount} / {items.length} Ready
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any cell to edit metadata. Formatted for Card Dealer Pro (CDP) and Shopify CSV import.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {saveBatchMessage && (
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg animate-fade-in">
              ✓ {saveBatchMessage}
            </span>
          )}

          {/* Save All to Collection Button */}
          <button
            onClick={handleSaveBatchAll}
            disabled={identifiedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 transition active:scale-95"
          >
            <BookmarkPlus className="h-4 w-4" /> Save All to Collection
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
            {items.map((item) => {
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
                      onClick={() => setSelectedPreview(item)}
                      className="cursor-pointer flex items-center justify-center -space-x-2 hover:scale-105 transition"
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

                  {/* Prefix ID */}
                  <td className="p-2 font-mono font-semibold text-slate-300 text-[11px]">
                    {item.prefix}
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
            })}
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
