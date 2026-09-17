"use client";

import React from "react";
import { SavedCollectionItem } from "@/types/card";
import { GainerFallerItem } from "@/types/portfolio";
import { generateCdpTitle } from "@/lib/titleGenerator";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ExternalLink,
  Tag,
  Award,
  Layers,
} from "lucide-react";

interface GainersFallersWidgetProps {
  gainers: GainerFallerItem[];
  fallers: GainerFallerItem[];
  hasPriceHistory: boolean;
  onInspectCard?: (card: SavedCollectionItem) => void;
  onSimulatePriceUpdate?: () => void;
}

export function GainersFallersWidget({
  gainers,
  fallers,
  hasPriceHistory,
  onInspectCard,
  onSimulatePriceUpdate,
}: GainersFallersWidgetProps) {
  const renderCardRow = (item: GainerFallerItem, isGainer: boolean) => {
    const card = item.card;
    const title = generateCdpTitle(card.data);
    const imgUrl = card.frontPreview;

    return (
      <div
        key={card.id}
        onClick={() => onInspectCard?.(card)}
        className="group flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90 transition-all cursor-pointer shadow-sm hover:shadow-md"
      >
        {/* Left: Thumbnail & Card Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={title}
                className="h-full w-full object-cover object-center group-hover:scale-110 transition-transform duration-300"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-600">
                <Tag className="h-4 w-4" />
              </div>
            )}
            {card.data.isRookie && (
              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded-full text-[7px] font-black bg-amber-500 text-slate-950">
                RC
              </span>
            )}
          </div>

          <div className="min-w-0 space-y-0.5">
            <h5 className="text-xs font-black text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
              {card.data.playerName || "Sports Card"}
            </h5>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {card.data.year || ""} {card.data.brand || ""} {card.data.setName || ""}{" "}
              {card.data.cardNumber ? `#${card.data.cardNumber}` : ""}
            </p>
            {card.data.subsetParallel && (
              <span className="inline-block px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {card.data.subsetParallel}
              </span>
            )}
          </div>
        </div>

        {/* Right: Valuations & Delta Badge */}
        <div className="text-right shrink-0 space-y-1">
          <div className="text-sm font-black font-mono text-white">
            ${item.currentValue.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 line-through">
            was ${item.previousValue.toFixed(2)}
          </div>
          <div
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-mono font-black border ${
              isGainer
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "bg-rose-500/15 border-rose-500/40 text-rose-400"
            }`}
          >
            {isGainer ? (
              <ArrowUpRight className="h-3 w-3 shrink-0" />
            ) : (
              <ArrowDownRight className="h-3 w-3 shrink-0" />
            )}
            <span>
              {isGainer ? "+" : ""}${Math.abs(item.deltaDollar).toFixed(2)}
            </span>
            <span className="opacity-80">
              ({isGainer ? "+" : ""}{item.deltaPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* COLUMN 1: TOP GAINERS */}
      <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                Top Gainers <span className="text-xs">🚀</span>
              </h4>
              <p className="text-[10px] font-mono text-slate-400">
                Largest price increases since last refresh
              </p>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {gainers.length} Climbing
          </span>
        </div>

        <div className="space-y-2.5">
          {gainers.length > 0 ? (
            gainers.map((g) => renderCardRow(g, true))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center space-y-2">
              <p className="text-xs text-slate-400 font-medium">
                No cards have registered a price increase yet.
              </p>
              {onSimulatePriceUpdate && (
                <button
                  onClick={onSimulatePriceUpdate}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono font-bold border border-emerald-500/30 transition"
                >
                  Simulate Market Gainers 🚀
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 2: TOP FALLERS */}
      <div className="rounded-3xl border border-rose-500/30 bg-slate-900/80 p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                Top Fallers <span className="text-xs">📉</span>
              </h4>
              <p className="text-[10px] font-mono text-slate-400">
                Cards with market price pullbacks
              </p>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {fallers.length} Dipping
          </span>
        </div>

        <div className="space-y-2.5">
          {fallers.length > 0 ? (
            fallers.map((f) => renderCardRow(f, false))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center space-y-2">
              <p className="text-xs text-slate-400 font-medium">
                No cards currently show a price drop.
              </p>
              {onSimulatePriceUpdate && (
                <button
                  onClick={onSimulatePriceUpdate}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-mono font-bold border border-rose-500/30 transition"
                >
                  Simulate Market Dips 📉
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
