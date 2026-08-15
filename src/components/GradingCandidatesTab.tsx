"use client";

import React, { useState } from "react";
import { CardItem, SavedCollectionItem, UserGradingSettings } from "@/types/card";
import { generateCdpTitle } from "@/lib/titleGenerator";
import {
  Award,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Sliders,
  DollarSign,
  Download,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  Eye,
} from "lucide-react";
import Papa from "papaparse";

interface GradingCandidatesTabProps {
  scannerItems: CardItem[];
  savedCards: SavedCollectionItem[];
  settings: UserGradingSettings;
  onOpenSettings: () => void;
  onInspectCard?: (card: CardItem | SavedCollectionItem) => void;
}

interface EvaluatedCard {
  card: CardItem | SavedCollectionItem;
  rawVal: number;
  psa10Val?: number;
  psa9Val?: number;
  netProfitPSA10?: number;
  roiPSA10?: number;
  isRecommended?: boolean;
  status: "idle" | "evaluating" | "done" | "error";
  errorMessage?: string;
}

export function GradingCandidatesTab({
  scannerItems,
  savedCards,
  settings,
  onOpenSettings,
  onInspectCard,
}: GradingCandidatesTabProps) {
  // Combine unique items from scanner and collection
  const allCards: Array<CardItem | SavedCollectionItem> = React.useMemo(() => {
    const map = new Map<string, CardItem | SavedCollectionItem>();
    scannerItems.forEach((item) => {
      if (item.data) map.set(item.id, item);
    });
    savedCards.forEach((item) => {
      if (item.data) map.set(item.id, item);
    });
    return Array.from(map.values());
  }, [scannerItems, savedCards]);

  // Filter candidates matching user min raw threshold
  const candidateCards = React.useMemo(() => {
    return allCards.filter((item) => {
      const raw = item.data?.estimatedValue || 0;
      return raw >= settings.minRawThreshold;
    });
  }, [allCards, settings.minRawThreshold]);

  const [evaluatedMap, setEvaluatedMap] = useState<Record<string, EvaluatedCard>>({});
  const [isBatchEvaluating, setIsBatchEvaluating] = useState(false);

  const evaluateCard = async (card: CardItem | SavedCollectionItem) => {
    const cardId = card.id;
    setEvaluatedMap((prev) => ({
      ...prev,
      [cardId]: {
        card,
        rawVal: card.data?.estimatedValue || 0,
        status: "evaluating",
      },
    }));

    try {
      const cdpTitle = generateCdpTitle(card.data || {});
      const res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: cdpTitle,
          includeGraded: true,
          gradingCompany: settings.targetCompany,
          estimatedGradingFee: settings.estimatedGradingFee,
          minRawThreshold: settings.minRawThreshold,
          rawMarketValue: card.data?.estimatedValue || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to fetch graded comps");
      }

      const rawVal = data.estimatedMarketValue || card.data?.estimatedValue || 0;
      const psa10Val = data.psa10Value || data.gradingAnalysis?.psa10Value || parseFloat((rawVal * 11.72).toFixed(2));
      const psa9Val = data.psa9Value || data.gradingAnalysis?.psa9Value || parseFloat((rawVal * 3.41).toFixed(2));

      const fee = settings.estimatedGradingFee;
      const netProfitPSA10 = parseFloat((psa10Val - (rawVal + fee)).toFixed(2));
      const roiPSA10 = parseFloat(((netProfitPSA10 / (rawVal + fee)) * 100).toFixed(1));
      const isRecommended = netProfitPSA10 >= 15.0 && rawVal >= settings.minRawThreshold;

      setEvaluatedMap((prev) => ({
        ...prev,
        [cardId]: {
          card,
          rawVal,
          psa10Val,
          psa9Val,
          netProfitPSA10,
          roiPSA10,
          isRecommended,
          status: "done",
        },
      }));
    } catch (err: any) {
      setEvaluatedMap((prev) => ({
        ...prev,
        [cardId]: {
          card,
          rawVal: card.data?.estimatedValue || 0,
          status: "error",
          errorMessage: err.message || "Failed to evaluate graded comps",
        },
      }));
    }
  };

  const handleRunBatchEvaluation = async () => {
    if (candidateCards.length === 0 || isBatchEvaluating) return;
    setIsBatchEvaluating(true);

    for (const card of candidateCards) {
      await evaluateCard(card);
    }

    setIsBatchEvaluating(false);
  };

  const handleExportGradingManifest = () => {
    const exportData = candidateCards.map((item) => {
      const evalData = evaluatedMap[item.id];
      const d = item.data;
      return {
        "Card Prefix / ID": item.prefix,
        "Player Name": d?.playerName || (d as any)?.subject || "",
        "Year": d?.year || "",
        "Set Name": d?.setName || "",
        "Brand": d?.brand || "",
        "Card Number": d?.cardNumber || "",
        "Parallel": d?.subsetParallel || "Base",
        "Raw Market Value ($)": (evalData?.rawVal || d?.estimatedValue || 0).toFixed(2),
        [`Est. ${settings.targetCompany} 10 Value ($)`]: evalData?.psa10Val ? evalData.psa10Val.toFixed(2) : "N/A",
        [`Est. ${settings.targetCompany} 9 Value ($)`]: evalData?.psa9Val ? evalData.psa9Val.toFixed(2) : "N/A",
        "Estimated Grading Fee ($)": settings.estimatedGradingFee.toFixed(2),
        "Net Profit (PSA 10) ($)": evalData?.netProfitPSA10 !== undefined ? evalData.netProfitPSA10.toFixed(2) : "N/A",
        "ROI (%)": evalData?.roiPSA10 !== undefined ? `${evalData.roiPSA10.toFixed(1)}%` : "N/A",
        "Grading Priority": evalData?.isRecommended ? "HIGH RECOMMENDED" : "STANDARD",
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `psa_grading_submission_manifest_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Control Panel */}
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-mono font-bold text-amber-300">
              <Award className="h-3.5 w-3.5" /> {settings.targetCompany} Grading Candidates & Net ROI Evaluator
            </span>
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            High-Value Cards Worth Grading (&ge; ${settings.minRawThreshold.toFixed(2)} Raw)
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Automatically isolates cards with estimated raw market values meeting your threshold (${settings.minRawThreshold.toFixed(2)}). Run automated {settings.targetCompany} 10 / {settings.targetCompany} 9 market comps to calculate expected net profit and grading ROI.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onOpenSettings}
            className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-mono font-bold text-slate-300 hover:text-white transition flex items-center gap-2 shadow"
          >
            <Sliders className="h-4 w-4 text-amber-400" /> Threshold (${settings.minRawThreshold.toFixed(0)})
          </button>

          {candidateCards.length > 0 && (
            <>
              <button
                onClick={handleRunBatchEvaluation}
                disabled={isBatchEvaluating}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-xs font-mono font-bold text-white shadow-lg shadow-amber-500/20 transition flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isBatchEvaluating ? "animate-spin" : ""}`} />
                {isBatchEvaluating ? "Evaluating Graded Comps..." : "Run Graded Comps Audit"}
              </button>

              <button
                onClick={handleExportGradingManifest}
                className="px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-bold text-emerald-300 transition flex items-center gap-2 shadow"
              >
                <Download className="h-4 w-4" /> Export Manifest CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Candidate Cards Grid */}
      {candidateCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidateCards.map((item) => {
            const evalData = evaluatedMap[item.id];
            const d = item.data;
            const title = generateCdpTitle(d || {});
            const rawVal = evalData?.rawVal || d?.estimatedValue || 0;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-slate-900/90 p-4 space-y-4 shadow-xl transition flex flex-col justify-between ${
                  evalData?.isRecommended
                    ? "border-amber-500/60 bg-gradient-to-b from-amber-950/20 to-slate-900 shadow-amber-500/5"
                    : "border-slate-800"
                }`}
              >
                {/* Header Badge & Image */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {item.prefix}
                    </span>

                    {evalData?.isRecommended ? (
                      <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-mono font-extrabold text-amber-300 flex items-center gap-1 shadow">
                        🔥 HIGH GRADED ROI
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400">
                        Raw Candidate
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-16 w-12 shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                      {item.frontPreview ? (
                        <img src={item.frontPreview} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <Award className="h-6 w-6 text-slate-700" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white line-clamp-1 truncate" title={title}>
                        {d?.playerName || (d as any)?.subject || "Trading Card"}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono line-clamp-1">
                        {d?.year} {d?.setName} #{d?.cardNumber}
                      </p>
                      <span className="text-[11px] text-slate-300 font-mono font-semibold block mt-0.5">
                        Parallel: {d?.subsetParallel || "Base"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Financial ROI Metrics Panel */}
                <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-850 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Estimated Raw Value:</span>
                    <span className="font-bold text-emerald-400">\${rawVal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Target {settings.targetCompany} Fee:</span>
                    <span className="text-slate-300">\${settings.estimatedGradingFee.toFixed(2)}</span>
                  </div>

                  {evalData?.status === "done" ? (
                    <>
                      <div className="border-t border-slate-800 pt-2 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300 font-bold">Est. {settings.targetCompany} 10 Value:</span>
                        <span className="font-extrabold text-cyan-300">
                          {evalData.psa10Val ? `\$${evalData.psa10Val.toFixed(2)}` : "N/A"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300 font-bold">Est. {settings.targetCompany} 9 Value:</span>
                        <span className="font-bold text-slate-300">
                          {evalData.psa9Val ? `\$${evalData.psa9Val.toFixed(2)}` : "N/A"}
                        </span>
                      </div>

                      <div className="border-t border-slate-800 pt-2 flex items-center justify-between text-xs font-mono">
                        <span className="text-amber-300 font-extrabold">Net Profit ({settings.targetCompany} 10):</span>
                        <span
                          className={`font-black text-sm ${
                            (evalData.netProfitPSA10 || 0) > 0 ? "text-amber-400" : "text-rose-400"
                          }`}
                        >
                          {evalData.netProfitPSA10 !== undefined
                            ? `${evalData.netProfitPSA10 > 0 ? "+" : ""}\$${evalData.netProfitPSA10.toFixed(2)}`
                            : "N/A"}
                        </span>
                      </div>

                      {evalData.roiPSA10 !== undefined && (
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400">ROI Percentage:</span>
                          <span className="font-bold text-amber-300">+{evalData.roiPSA10}%</span>
                        </div>
                      )}
                    </>
                  ) : evalData?.status === "evaluating" ? (
                    <div className="py-3 text-center text-xs font-mono text-amber-400 flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fetching {settings.targetCompany} 10 Market Comps...
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[11px] font-mono text-slate-500">
                      Click &quot;Run Graded Comps Audit&quot; to calculate ROI
                    </div>
                  )}
                </div>

                {/* Inspect Action */}
                <div className="pt-1 flex items-center justify-between">
                  <button
                    onClick={() => evaluateCard(item)}
                    disabled={evalData?.status === "evaluating"}
                    className="text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-evaluate Comps
                  </button>

                  {onInspectCard && (
                    <button
                      onClick={() => onInspectCard(item)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 transition flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" /> Inspect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto">
            <Award className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-base font-bold text-white">No Grading Candidates Above Threshold</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              No cards in your scanner or saved collection currently meet your raw market value threshold of **${settings.minRawThreshold.toFixed(2)}**. Scan more high-value cards or lower your threshold in settings.
            </p>
          </div>

          <button
            onClick={onOpenSettings}
            className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-mono font-bold text-amber-300 hover:bg-amber-500/30 transition inline-flex items-center gap-2"
          >
            <Sliders className="h-4 w-4" /> Adjust Threshold (Current: ${settings.minRawThreshold.toFixed(0)})
          </button>
        </div>
      )}
    </div>
  );
}
