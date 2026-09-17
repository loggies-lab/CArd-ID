"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  CardItem,
  SavedCollectionItem,
  UserGradingSettings,
  CDPCardSchema,
  GradingAnalysis,
  CompSaleItem,
  GradingTargetGrade,
  GradingRecommendationTier,
  getTotalGradingCost,
} from "@/types/card";
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
  Search,
  ArrowUpDown,
  X,
  Zap,
} from "lucide-react";
import Papa from "papaparse";

const LOCAL_STORAGE_GRADING_MAP_KEY = "card_id_grading_eval_map_v1";

interface GradingCandidatesTabProps {
  scannerItems: CardItem[];
  savedCards: SavedCollectionItem[];
  settings: UserGradingSettings;
  onOpenSettings: () => void;
  onInspectCard?: (card: CardItem | SavedCollectionItem) => void;
  onUpdateCard?: (cardId: string, updatedData: CDPCardSchema) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema }[]) => void;
}

interface EvaluatedCard {
  card: CardItem | SavedCollectionItem;
  rawVal: number;
  psa10Val?: number;
  psa9Val?: number;
  netProfitPSA10?: number;
  netProfitPSA9?: number;
  roiPSA10?: number;
  roiPSA9?: number;
  recommendationTier?: GradingRecommendationTier;
  isRecommended?: boolean;
  status: "idle" | "evaluating" | "done" | "error";
  errorMessage?: string;
  psa10Sales?: CompSaleItem[];
  psa9Sales?: CompSaleItem[];
}

export function computeCardTier(
  netProfit10: number,
  netProfit9: number,
  roi10: number,
  roi9: number,
  targetGrade: GradingTargetGrade,
  minProfitTarget: number,
  minRoiTarget: number,
  requirePsa9Profitability?: boolean
): GradingRecommendationTier {
  if (targetGrade === "psa9") {
    if (netProfit9 >= minProfitTarget && roi9 >= minRoiTarget) {
      return "do_it";
    }
    if (netProfit9 > 0 || (netProfit10 >= minProfitTarget && netProfit9 >= -10)) {
      return "maybe";
    }
    return "dont_do_it";
  }

  if (targetGrade === "balanced") {
    if (netProfit10 >= minProfitTarget && roi10 >= minRoiTarget && netProfit9 >= 0) {
      return "do_it";
    }
    if (netProfit10 >= minProfitTarget || (netProfit10 > 0 && netProfit9 >= -15)) {
      return "maybe";
    }
    return "dont_do_it";
  }

  // targetGrade === "psa10"
  if (netProfit10 >= minProfitTarget && roi10 >= minRoiTarget) {
    if (requirePsa9Profitability && netProfit9 < 0) {
      return "maybe";
    }
    return "do_it";
  }
  if (netProfit10 > 0) {
    return "maybe";
  }
  return "dont_do_it";
}

export function getActiveMetrics(
  evalData: EvaluatedCard | undefined,
  targetGrade: GradingTargetGrade,
  rawVal: number = 0,
  fee: number = 25.0
) {
  const safeRaw = Number.isFinite(rawVal) ? rawVal : 0;
  const safeFee = Number.isFinite(fee) ? fee : 25.0;
  const totalInvestment = safeRaw + safeFee;

  let psa10Val = Number(evalData?.psa10Val) || (safeRaw ? parseFloat((safeRaw * 2.8).toFixed(2)) : 0);
  let psa9Val = Number(evalData?.psa9Val) || (safeRaw ? parseFloat((safeRaw * 1.4).toFixed(2)) : 0);

  if (psa9Val > 0 && (!psa10Val || psa9Val >= psa10Val)) {
    psa10Val = parseFloat((psa9Val * 2.8).toFixed(2));
  } else if (psa10Val > 0 && !psa9Val) {
    psa9Val = parseFloat((psa10Val * 0.40).toFixed(2));
  }

  const net10 = evalData?.netProfitPSA10 !== undefined && Number.isFinite(evalData.netProfitPSA10)
    ? evalData.netProfitPSA10
    : parseFloat((psa10Val - totalInvestment).toFixed(2));
  const net9 = evalData?.netProfitPSA9 !== undefined && Number.isFinite(evalData.netProfitPSA9)
    ? evalData.netProfitPSA9
    : parseFloat((psa9Val - totalInvestment).toFixed(2));
  const roi10 = evalData?.roiPSA10 !== undefined && Number.isFinite(evalData.roiPSA10)
    ? evalData.roiPSA10
    : (totalInvestment > 0 ? parseFloat(((net10 / totalInvestment) * 100).toFixed(1)) : 0);
  const roi9 = evalData?.roiPSA9 !== undefined && Number.isFinite(evalData.roiPSA9)
    ? evalData.roiPSA9
    : (totalInvestment > 0 ? parseFloat(((net9 / totalInvestment) * 100).toFixed(1)) : 0);

  let activeProfit = net10;
  let activeRoi = roi10;
  let activeGradedVal = psa10Val;

  if (targetGrade === "psa9") {
    activeProfit = net9;
    activeRoi = roi9;
    activeGradedVal = psa9Val;
  } else if (targetGrade === "balanced") {
    activeProfit = parseFloat(((net10 + net9) / 2).toFixed(2));
    activeRoi = parseFloat(((roi10 + roi9) / 2).toFixed(1));
    activeGradedVal = psa10Val;
  }

  return {
    totalInvestment,
    psa10Val: Number.isFinite(psa10Val) ? psa10Val : 0,
    psa9Val: Number.isFinite(psa9Val) ? psa9Val : 0,
    net10: Number.isFinite(net10) ? net10 : 0,
    net9: Number.isFinite(net9) ? net9 : 0,
    roi10: Number.isFinite(roi10) ? roi10 : 0,
    roi9: Number.isFinite(roi9) ? roi9 : 0,
    activeProfit: Number.isFinite(activeProfit) ? activeProfit : 0,
    activeRoi: Number.isFinite(activeRoi) ? activeRoi : 0,
    activeGradedVal: Number.isFinite(activeGradedVal) ? activeGradedVal : 0,
  };
}

export function GradingCandidatesTab({
  scannerItems = [],
  savedCards = [],
  settings,
  onOpenSettings,
  onInspectCard,
  onUpdateCard,
  updateSavedCardDataBatch,
}: GradingCandidatesTabProps) {
  const minProfitTarget = settings?.minGradingProfit ?? settings?.minNetProfitThreshold ?? 50.0;
  const minRoiTarget = settings?.minGradingRoiPct ?? settings?.minRoiThreshold ?? 50.0;
  const effectiveGradingFee = getTotalGradingCost(settings);
  const minRawThreshold = settings?.minEbayRawThreshold ?? settings?.minRawThreshold ?? 4.0;
  const [activeTargetGrade, setActiveTargetGrade] = useState<GradingTargetGrade>(settings?.targetGrade || "psa9");

  useEffect(() => {
    if (settings?.targetGrade) {
      setActiveTargetGrade(settings.targetGrade);
    }
  }, [settings?.targetGrade]);

  // Search & Sorting state
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"hierarchy" | "profitTarget" | "profit10" | "profit9" | "psa10Val" | "psa9Val" | "rawVal" | "player">("hierarchy");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [strategyFilter, setStrategyFilter] = useState<"all" | "do_it" | "maybe" | "dont_do_it">("all");
  const [expandedGradedCardId, setExpandedGradedCardId] = useState<string | null>(null);
  const [gradedViewGrade, setGradedViewGrade] = useState<"psa10" | "psa9">(activeTargetGrade === "psa9" ? "psa9" : "psa10");

  // Combine unique items from scanner and collection
  const allCards: Array<CardItem | SavedCollectionItem> = useMemo(() => {
    const map = new Map<string, CardItem | SavedCollectionItem>();
    scannerItems.forEach((item) => {
      if (item.data) map.set(item.id, item);
    });
    savedCards.forEach((item) => {
      if (item.data) map.set(item.id, item);
    });
    return Array.from(map.values());
  }, [scannerItems, savedCards]);

  // Filter candidates matching user min raw threshold OR explicitly triaged into PSA grading
  const candidateCards = useMemo(() => {
    return allCards.filter((item) => {
      const isExplicitGrading =
        item.triageStatus === "GRADE_CANDIDATE" ||
        item.data?.triageStatus === "GRADE_CANDIDATE" ||
        item.data?.gradingAnalysis?.recommendationTier === "do_it" ||
        item.data?.gradingAnalysis?.isRecommended;
      const raw = item.data?.estimatedValue || 0;
      return isExplicitGrading || raw >= minRawThreshold;
    });
  }, [allCards, minRawThreshold]);

  // Initialize evaluatedMap from localStorage if available
  const [evaluatedMap, setEvaluatedMap] = useState<Record<string, EvaluatedCard>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_GRADING_MAP_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });

  // Cards that qualify for grading but haven't been comped out yet
  const uncompedCandidates = useMemo(() => {
    return candidateCards.filter((card) => {
      const evalData = evaluatedMap[card.id];
      const hasSessionDone =
        evalData?.status === "done" && ((evalData.psa10Val || 0) > 0 || (evalData.psa9Val || 0) > 0);
      const hasCardGrading = !!(
        card.data?.gradingAnalysis?.lastEvaluated &&
        ((card.data?.gradingAnalysis?.psa10Value || 0) > 0 || (card.data?.gradingAnalysis?.psa9Value || 0) > 0)
      );
      return !hasSessionDone && !hasCardGrading;
    });
  }, [candidateCards, evaluatedMap]);

  const [isBatchEvaluating, setIsBatchEvaluating] = useState(false);
  const [compProgress, setCompProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
  } | null>(null);
  const [compCancelRequested, setCompCancelRequested] = useState(false);

  // Sync candidate cards and pre-existing card gradingAnalysis into evaluatedMap
  useEffect(() => {
    setEvaluatedMap((prev) => {
      let changed = false;
      const next = { ...prev };

      allCards.forEach((card) => {
        const g = card.data?.gradingAnalysis;
        const cardId = card.id;

        if (g && (!next[cardId] || next[cardId].status !== "evaluating")) {
          const rawVal = card.data?.estimatedValue || 0;
          let psa10Val = g.psa10Value;
          let psa9Val = g.psa9Value;

          // Cross-anchor & auto-correct legacy inverted valuations (e.g. PSA 9 > PSA 10)
          if (psa9Val && (!psa10Val || psa9Val >= psa10Val)) {
            psa10Val = parseFloat((psa9Val * 2.8).toFixed(2));
          } else if (psa10Val && !psa9Val) {
            psa9Val = parseFloat((psa10Val * 0.40).toFixed(2));
          }

          const fee = effectiveGradingFee;
          const totalInv = rawVal + fee;
          const netProfitPSA10 = psa10Val !== undefined ? parseFloat((psa10Val - totalInv).toFixed(2)) : undefined;
          const netProfitPSA9 = psa9Val !== undefined ? parseFloat((psa9Val - totalInv).toFixed(2)) : undefined;
          const roiPSA10 = (netProfitPSA10 !== undefined && totalInv > 0) ? parseFloat(((netProfitPSA10 / totalInv) * 100).toFixed(1)) : undefined;
          const roiPSA9 = (netProfitPSA9 !== undefined && totalInv > 0) ? parseFloat(((netProfitPSA9 / totalInv) * 100).toFixed(1)) : undefined;
          const tier = computeCardTier(
            netProfitPSA10 ?? 0,
            netProfitPSA9 ?? 0,
            roiPSA10 ?? 0,
            roiPSA9 ?? 0,
            activeTargetGrade,
            minProfitTarget,
            minRoiTarget,
            settings?.requirePsa9Profitability
          );
          const isRecommended = tier === "do_it";

          const existing = next[cardId];
          if (
            !existing ||
            existing.rawVal !== rawVal ||
            existing.psa10Val !== psa10Val ||
            existing.psa9Val !== psa9Val ||
            existing.netProfitPSA10 !== netProfitPSA10 ||
            existing.netProfitPSA9 !== netProfitPSA9 ||
            existing.roiPSA10 !== roiPSA10 ||
            existing.roiPSA9 !== roiPSA9 ||
            existing.recommendationTier !== tier ||
            existing.isRecommended !== isRecommended ||
            existing.card !== card
          ) {
            next[cardId] = {
              card,
              rawVal,
              psa10Val,
              psa9Val,
              netProfitPSA10,
              netProfitPSA9,
              roiPSA10,
              roiPSA9,
              recommendationTier: tier,
              isRecommended,
              status: "done",
              psa10Sales: g.psa10Sales || [],
              psa9Sales: g.psa9Sales || [],
            };
            changed = true;
          }
        } else if (next[cardId]) {
          if (next[cardId].card !== card) {
            next[cardId] = { ...next[cardId], card };
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [allCards, activeTargetGrade, minProfitTarget, minRoiTarget, effectiveGradingFee, settings?.requirePsa9Profitability]);

  // Save lightweight evaluatedMap to localStorage whenever evaluation results update
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lightMap: Record<string, any> = {};
      Object.entries(evaluatedMap).forEach(([id, item]) => {
        if (item.status === "done") {
          lightMap[id] = {
            rawVal: item.rawVal,
            psa10Val: item.psa10Val,
            psa9Val: item.psa9Val,
            netProfitPSA10: item.netProfitPSA10,
            netProfitPSA9: item.netProfitPSA9,
            roiPSA10: item.roiPSA10,
            roiPSA9: item.roiPSA9,
            recommendationTier: item.recommendationTier,
            isRecommended: item.isRecommended,
            status: "done",
          };
        }
      });
      localStorage.setItem(LOCAL_STORAGE_GRADING_MAP_KEY, JSON.stringify(lightMap));
    } catch (e) {
      console.warn("Failed to persist grading evaluation map to localStorage:", e);
    }
  }, [evaluatedMap]);

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
          estimatedGradingFee: effectiveGradingFee,
          minRawThreshold: minRawThreshold,
          rawMarketValue: card.data?.estimatedValue || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to fetch graded comps");
      }

      const rawVal = data.estimatedMarketValue || card.data?.estimatedValue || 0;
      let psa10Val = data.psa10Value || data.gradingAnalysis?.psa10Value;
      let psa9Val = data.psa9Value || data.gradingAnalysis?.psa9Value;

      // Cross-anchoring: Anchor PSA 10 to PSA 9 if only PSA 9 comp exists
      if (psa9Val && !psa10Val) {
        psa10Val = parseFloat((psa9Val * 2.8).toFixed(2));
      } else if (psa10Val && !psa9Val) {
        psa9Val = parseFloat((psa10Val * 0.40).toFixed(2));
      } else if (!psa10Val && !psa9Val) {
        psa10Val = parseFloat((rawVal * 2.8).toFixed(2));
        psa9Val = parseFloat((rawVal * 1.4).toFixed(2));
      }

      // Strict Hierarchy Invariants: PSA 10 >= PSA 9 >= Raw
      if (psa9Val >= psa10Val) {
        psa10Val = parseFloat((psa9Val * 2.5).toFixed(2));
      }
      if (psa9Val < rawVal) {
        psa9Val = parseFloat((rawVal * 1.15).toFixed(2));
      }
      if (psa10Val < rawVal * 1.4) {
        psa10Val = parseFloat((rawVal * 2.5).toFixed(2));
      }

      const fee = effectiveGradingFee;
      const totalInvestment = rawVal + fee;
      const netProfitPSA10 = parseFloat((psa10Val - totalInvestment).toFixed(2));
      const netProfitPSA9 = parseFloat((psa9Val - totalInvestment).toFixed(2));
      const roiPSA10 = totalInvestment > 0 ? parseFloat(((netProfitPSA10 / totalInvestment) * 100).toFixed(1)) : 0;
      const roiPSA9 = totalInvestment > 0 ? parseFloat(((netProfitPSA9 / totalInvestment) * 100).toFixed(1)) : 0;

      const tier = computeCardTier(
        netProfitPSA10,
        netProfitPSA9,
        roiPSA10,
        roiPSA9,
        activeTargetGrade,
        minProfitTarget,
        minRoiTarget,
        settings.requirePsa9Profitability
      );
      const isRecommended = tier === "do_it";

      const gradingAnalysis: GradingAnalysis = {
        psa10Value: psa10Val,
        psa9Value: psa9Val,
        gradingFee: fee,
        netProfitPSA10,
        netProfitPSA9,
        roiPSA10,
        roiPSA9,
        recommendationTier: tier,
        isRecommended,
        lastEvaluated: new Date().toISOString(),
        psa10Sales: data.psa10Sales || data.gradingAnalysis?.psa10Sales || [],
        psa9Sales: data.psa9Sales || data.gradingAnalysis?.psa9Sales || [],
      };

      setEvaluatedMap((prev) => ({
        ...prev,
        [cardId]: {
          card,
          rawVal,
          psa10Val,
          psa9Val,
          netProfitPSA10,
          netProfitPSA9,
          roiPSA10,
          roiPSA9,
          recommendationTier: tier,
          isRecommended,
          status: "done",
          psa10Sales: data.psa10Sales || data.gradingAnalysis?.psa10Sales || [],
          psa9Sales: data.psa9Sales || data.gradingAnalysis?.psa9Sales || [],
        },
      }));

      // Update card schema & save to collection database
      if (card.data && onUpdateCard) {
        const updatedData: CDPCardSchema = {
          ...card.data,
          estimatedValue: rawVal,
          gradingAnalysis,
          valueLastUpdated: new Date().toISOString(),
        };
        onUpdateCard(cardId, updatedData);
      }
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

  const handleRunUncompedGradingComps = async () => {
    if (uncompedCandidates.length === 0 || isBatchEvaluating) return;
    setIsBatchEvaluating(true);
    setCompCancelRequested(false);

    const total = uncompedCandidates.length;
    for (let i = 0; i < total; i++) {
      if (compCancelRequested) break;
      const card = uncompedCandidates[i];
      const title = generateCdpTitle(card.data || {});
      setCompProgress({
        current: i + 1,
        total,
        currentTitle: title,
      });
      await evaluateCard(card);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setCompProgress(null);
    setIsBatchEvaluating(false);
  };

  const handleRunBatchEvaluation = async () => {
    if (candidateCards.length === 0 || isBatchEvaluating) return;
    setIsBatchEvaluating(true);
    setCompCancelRequested(false);

    const total = candidateCards.length;
    for (let i = 0; i < total; i++) {
      if (compCancelRequested) break;
      const card = candidateCards[i];
      const title = generateCdpTitle(card.data || {});
      setCompProgress({
        current: i + 1,
        total,
        currentTitle: title,
      });
      await evaluateCard(card);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setCompProgress(null);
    setIsBatchEvaluating(false);
  };

  const handleExportGradingManifest = () => {
    const exportData = candidateCards.map((item) => {
      const evalData = evaluatedMap[item.id];
      const d = item.data;
      const fee = effectiveGradingFee;
      const rawVal = evalData?.rawVal || d?.estimatedValue || 0;
      const metrics = getActiveMetrics(evalData, activeTargetGrade, rawVal, fee);
      const tier = evalData?.status === "done"
        ? computeCardTier(
            metrics.net10,
            metrics.net9,
            metrics.roi10,
            metrics.roi9,
            activeTargetGrade,
            minProfitTarget,
            minRoiTarget,
            settings.requirePsa9Profitability
          )
        : "unevaluated";

      const priorityLabel =
        tier === "do_it"
          ? "🟢 DO IT (HIGHLY RECOMMENDED)"
          : tier === "maybe"
          ? "🟡 MAYBE (MODERATE / WATCHLIST)"
          : tier === "dont_do_it"
          ? "🔴 DON'T DO IT (SELL RAW)"
          : "UNEVALUATED";

      return {
        "Card Prefix / ID": item.prefix,
        "Player Name": d?.playerName || (d as any)?.subject || "",
        "Year": d?.year || "",
        "Set Name": d?.setName || "",
        "Brand": d?.brand || "",
        "Card Number": d?.cardNumber || "",
        "Parallel": d?.subsetParallel || "Base",
        "Raw Market Value ($)": rawVal.toFixed(2),
        [`Est. ${settings.targetCompany} 10 Value ($)`]: metrics.psa10Val > 0 ? metrics.psa10Val.toFixed(2) : "N/A",
        [`Est. ${settings.targetCompany} 9 Value ($)`]: metrics.psa9Val > 0 ? metrics.psa9Val.toFixed(2) : "N/A",
        "Grading Fee ($)": fee.toFixed(2),
        "Target Scenario": activeTargetGrade === "psa9" ? "PSA 9 Baseline" : activeTargetGrade === "psa10" ? "PSA 10 Ceiling" : "Balanced",
        "Active Target Net Profit ($)": evalData?.status === "done" ? metrics.activeProfit.toFixed(2) : "N/A",
        "Active Target ROI (%)": evalData?.status === "done" ? `${metrics.activeRoi.toFixed(1)}%` : "N/A",
        "Net Profit (PSA 10) ($)": evalData?.status === "done" ? metrics.net10.toFixed(2) : "N/A",
        "Net Profit (PSA 9) ($)": evalData?.status === "done" ? metrics.net9.toFixed(2) : "N/A",
        "Grading Priority": priorityLabel,
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

  // Compute portfolio analysis summary metrics based on active target grade
  const analysisSummary = useMemo(() => {
    const evaluatedItems = candidateCards
      .map((item) => {
        const e = evaluatedMap[item.id];
        if (!e || e.status !== "done") return null;
        return {
          ...e,
          card: e.card || item,
        };
      })
      .filter((e): e is EvaluatedCard => !!e);

    const fee = effectiveGradingFee;

    const doItCards: EvaluatedCard[] = [];
    const maybeCards: EvaluatedCard[] = [];
    const dontDoItCards: EvaluatedCard[] = [];

    evaluatedItems.forEach((e) => {
      const raw = e.rawVal || 0;
      const m = getActiveMetrics(e, activeTargetGrade, raw, fee);
      const tier = computeCardTier(
        m.net10,
        m.net9,
        m.roi10,
        m.roi9,
        activeTargetGrade,
        minProfitTarget,
        minRoiTarget,
        settings?.requirePsa9Profitability
      );

      if (tier === "do_it") doItCards.push(e);
      else if (tier === "maybe") maybeCards.push(e);
      else dontDoItCards.push(e);
    });

    const totalDoItProfit = doItCards.reduce((sum, e) => {
      const raw = e.rawVal || 0;
      const m = getActiveMetrics(e, activeTargetGrade, raw, fee);
      return sum + m.activeProfit;
    }, 0);

    const totalMaybeProfit = maybeCards.reduce((sum, e) => {
      const raw = e.rawVal || 0;
      const m = getActiveMetrics(e, activeTargetGrade, raw, fee);
      return sum + Math.max(0, m.activeProfit);
    }, 0);

    const totalPsa10Potential = evaluatedItems.reduce((sum, e) => sum + (e.psa10Val || 0), 0);
    const totalPsa9Potential = evaluatedItems.reduce((sum, e) => sum + (e.psa9Val || 0), 0);

    // Find top card by active target graded value
    const topCard = evaluatedItems.length > 0
      ? [...evaluatedItems].sort((a, b) => {
          const rawA = a.rawVal || 0;
          const rawB = b.rawVal || 0;
          const mA = getActiveMetrics(a, activeTargetGrade, rawA, fee);
          const mB = getActiveMetrics(b, activeTargetGrade, rawB, fee);
          return mB.activeGradedVal - mA.activeGradedVal;
        })[0]
      : null;

    const topCardVal = topCard ? getActiveMetrics(topCard, activeTargetGrade, topCard.rawVal, fee).activeGradedVal : 0;

    return {
      evaluatedCount: evaluatedItems.length,
      doItCards,
      maybeCards,
      dontDoItCards,
      totalDoItProfit,
      totalMaybeProfit,
      totalPsa10Potential,
      totalPsa9Potential,
      topCard,
      topCardVal,
    };
  }, [candidateCards, evaluatedMap, activeTargetGrade, minProfitTarget, minRoiTarget, effectiveGradingFee, settings?.requirePsa9Profitability]);

  const filteredCandidateCards = useMemo(() => {
    if (strategyFilter === "all") return candidateCards;

    const fee = effectiveGradingFee;
    return candidateCards.filter((card) => {
      const evalData = evaluatedMap[card.id];
      if (!evalData || evalData.status !== "done") return false;

      const rawVal = evalData.rawVal || card.data?.estimatedValue || 0;
      const m = getActiveMetrics(evalData, activeTargetGrade, rawVal, fee);
      const tier = computeCardTier(
        m.net10,
        m.net9,
        m.roi10,
        m.roi9,
        activeTargetGrade,
        minProfitTarget,
        minRoiTarget,
        settings.requirePsa9Profitability
      );

      return tier === strategyFilter;
    });
  }, [candidateCards, evaluatedMap, strategyFilter, activeTargetGrade, minProfitTarget, minRoiTarget, effectiveGradingFee, settings.requirePsa9Profitability]);

  // Apply Search Term and Sorting
  const sortedAndFilteredCards = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const searchTokens = term.split(/\s+/).filter(Boolean);
    const fee = effectiveGradingFee;

    const toStr = (val: any): string => (val !== null && val !== undefined ? String(val).toLowerCase() : "");

    const list = filteredCandidateCards.filter((item) => {
      const card = item.data;
      if (!card) return false;

      const playerName = toStr(card.playerName || (card as any).subject || (card as any).player);
      const brand = toStr(card.brand);
      const setName = toStr(card.setName);
      const team = toStr(card.team);
      const cardNumber = toStr(card.cardNumber);
      const subsetParallel = toStr(card.subsetParallel);
      const sport = toStr(card.sport);
      const year = toStr(card.year);
      const prefix = toStr(item.prefix);
      const fullTitle = toStr(generateCdpTitle(card));

      const searchableText = `${fullTitle} ${playerName} ${brand} ${setName} ${team} ${cardNumber} ${subsetParallel} ${sport} ${year} ${prefix}`;
      return searchTokens.length === 0 || searchTokens.every((token) => searchableText.includes(token));
    });

    return list.sort((a, b) => {
      const evalA = evaluatedMap[a.id];
      const evalB = evaluatedMap[b.id];

      const rawA = evalA?.rawVal || a.data?.estimatedValue || 0;
      const rawB = evalB?.rawVal || b.data?.estimatedValue || 0;

      const metricsA = getActiveMetrics(evalA, activeTargetGrade, rawA, fee);
      const metricsB = getActiveMetrics(evalB, activeTargetGrade, rawB, fee);

      const tierA = evalA?.status === "done"
        ? computeCardTier(metricsA.net10, metricsA.net9, metricsA.roi10, metricsA.roi9, activeTargetGrade, minProfitTarget, minRoiTarget, settings.requirePsa9Profitability)
        : "unevaluated";
      const tierB = evalB?.status === "done"
        ? computeCardTier(metricsB.net10, metricsB.net9, metricsB.roi10, metricsB.roi9, activeTargetGrade, minProfitTarget, minRoiTarget, settings.requirePsa9Profitability)
        : "unevaluated";

      const tierWeight: Record<GradingRecommendationTier, number> = {
        do_it: 1,
        maybe: 2,
        dont_do_it: 3,
        unevaluated: 4,
      };

      let diff = 0;
      if (sortBy === "hierarchy") {
        // Hierarchical Sort: 🟢 DO IT -> 🟡 MAYBE -> 🔴 DON'T DO IT
        const weightDiff = tierWeight[tierA] - tierWeight[tierB];
        if (weightDiff !== 0) {
          return sortOrder === "desc" ? weightDiff : -weightDiff;
        }
        // Sub-sort within same tier by active profit descending
        diff = metricsB.activeProfit - metricsA.activeProfit;
        return sortOrder === "desc" ? diff : -diff;
      } else if (sortBy === "profitTarget") {
        diff = metricsB.activeProfit - metricsA.activeProfit;
      } else if (sortBy === "profit10") {
        diff = metricsB.net10 - metricsA.net10;
      } else if (sortBy === "profit9") {
        diff = metricsB.net9 - metricsA.net9;
      } else if (sortBy === "psa10Val") {
        diff = metricsB.psa10Val - metricsA.psa10Val;
      } else if (sortBy === "psa9Val") {
        diff = metricsB.psa9Val - metricsA.psa9Val;
      } else if (sortBy === "rawVal") {
        diff = rawB - rawA;
      } else if (sortBy === "player") {
        diff = (a.data?.playerName || "").localeCompare(b.data?.playerName || "");
      }

      return sortOrder === "desc" ? diff : -diff;
    });
  }, [filteredCandidateCards, evaluatedMap, searchTerm, sortBy, sortOrder, activeTargetGrade, minProfitTarget, minRoiTarget, effectiveGradingFee, settings.requirePsa9Profitability]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Panel */}
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 p-6 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-mono font-bold text-amber-300">
                <Award className="h-3.5 w-3.5" /> {settings.targetCompany} Grading ROI & Market Potential Evaluator
              </span>
              {settings.requirePsa9Profitability && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold text-cyan-300">
                  <CheckCircle className="h-3 w-3" /> PSA 9 Safety Net Active
                </span>
              )}
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">
              Grading Candidates & PSA Market Comps
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Automatically isolates cards meeting your raw market value threshold (<strong className="text-amber-300 font-mono">${minRawThreshold.toFixed(2)}</strong>). Target net profit goal is set to <strong className="text-emerald-400 font-mono">${minProfitTarget.toFixed(2)}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onOpenSettings}
              className="px-4 py-2.5 rounded-xl border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 text-xs font-mono font-black text-amber-300 transition flex items-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95"
            >
              <Sliders className="h-4 w-4 text-amber-400" /> ⚙️ Edit Rules & Profit Goal (${minProfitTarget.toFixed(0)})
            </button>

            {/* Primary Button: Run Comps ONLY on Cards that Qualify for Grading but Haven't Been Comped Out Yet */}
            <button
              type="button"
              onClick={handleRunUncompedGradingComps}
              disabled={isBatchEvaluating || uncompedCandidates.length === 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-mono font-black transition flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-60 ${
                uncompedCandidates.length > 0
                  ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-emerald-500/25 ring-2 ring-emerald-400/40 animate-pulse"
                  : "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
              }`}
              title={
                uncompedCandidates.length > 0
                  ? `Run graded sales comps on ${uncompedCandidates.length} uncomped card${uncompedCandidates.length === 1 ? '' : 's'}`
                  : "All grading candidates already have active market comps"
              }
            >
              <Zap className={`h-4 w-4 ${uncompedCandidates.length > 0 ? "fill-amber-300 text-amber-300" : "text-slate-500"}`} />
              {isBatchEvaluating && compProgress ? (
                <span>Evaluating ({compProgress.current}/{compProgress.total})...</span>
              ) : uncompedCandidates.length > 0 ? (
                <span>Run Comps on Uncomped Cards ({uncompedCandidates.length})</span>
              ) : (
                <span>✓ All Grading Cards Comped</span>
              )}
            </button>

            {/* Secondary Button: Re-audit All Candidates (Forces re-evaluation on all cards) */}
            <button
              type="button"
              onClick={handleRunBatchEvaluation}
              disabled={isBatchEvaluating || candidateCards.length === 0}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 hover:border-slate-600 text-xs font-mono font-bold text-slate-300 transition flex items-center gap-2 active:scale-95 disabled:opacity-50"
              title="Re-run sales comps on all grading candidates"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isBatchEvaluating && !compProgress ? "animate-spin" : ""}`} />
              <span>Re-audit All ({candidateCards.length})</span>
            </button>

            {candidateCards.length > 0 && (
              <button
                onClick={handleExportGradingManifest}
                className="px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-bold text-emerald-300 transition flex items-center gap-2 shadow"
              >
                <Download className="h-4 w-4" /> Export Manifest CSV
              </button>
            )}
          </div>
        </div>

        {/* Real-time Uncomped Batch Comps Progress Banner */}
        {isBatchEvaluating && compProgress && (
          <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/90 p-4 space-y-3 shadow-2xl backdrop-blur-xl animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-emerald-400 animate-spin" />
                <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider">
                  Running Comps on Uncomped Grading Candidates ({compProgress.current} / {compProgress.total})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCompCancelRequested(true)}
                className="text-xs font-mono font-bold text-rose-400 hover:text-rose-300 underline"
              >
                Cancel Evaluation
              </button>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full transition-all duration-300"
                style={{ width: `${(compProgress.current / compProgress.total) * 100}%` }}
              ></div>
            </div>

            <div className="text-xs font-mono text-slate-400 truncate">
              Querying Market Comps: <strong className="text-white">{compProgress.currentTitle}</strong>
            </div>
          </div>
        )}

        {/* Quick Target Grade Scenario Switcher Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 shadow-inner">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-400" /> Active Valuation Scenario:
            </span>
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTargetGrade("psa9")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-extrabold transition flex items-center gap-1.5 ${
                  activeTargetGrade === "psa9"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🛡️ PSA 9 Baseline (Conservative)
              </button>
              <button
                type="button"
                onClick={() => setActiveTargetGrade("psa10")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-extrabold transition flex items-center gap-1.5 ${
                  activeTargetGrade === "psa10"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ⭐ PSA 10 Ceiling (Best Case)
              </button>
              <button
                type="button"
                onClick={() => setActiveTargetGrade("balanced")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-extrabold transition flex items-center gap-1.5 ${
                  activeTargetGrade === "balanced"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ⚖️ Balanced (Risk-Adjusted)
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <span>Goal: <strong className="text-emerald-400 font-bold">&ge; ${minProfitTarget.toFixed(0)} Net</strong></span>
            <span>•</span>
            <span>Min ROI: <strong className="text-emerald-400 font-bold">&ge; {minRoiTarget}%</strong></span>
          </div>
        </div>

        {/* 4 Executive Traffic-Light Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80">
          {/* Stat 1: 🟢 DO IT */}
          <div className="rounded-2xl border border-emerald-500/40 bg-slate-950/80 p-4 space-y-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-400" /> 🟢 DO IT (HIGHLY RECOMMENDED)
              </span>
              <span className="text-[10px] text-slate-400">&ge; ${minProfitTarget.toFixed(0)} &amp; {minRoiTarget}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black font-mono text-white">
                {analysisSummary.doItCards.length} <span className="text-xs text-slate-400 font-normal">cards</span>
              </span>
              <span className="text-xs font-extrabold font-mono text-emerald-400">
                +${analysisSummary.totalDoItProfit.toFixed(2)} Net
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {analysisSummary.doItCards.length > 0
                ? `High-conviction candidates exceeding $${minProfitTarget.toFixed(0)} net & ${minRoiTarget}% ROI at ${activeTargetGrade === "psa9" ? "PSA 9" : activeTargetGrade === "psa10" ? "PSA 10" : "Balanced"}.`
                : `No cards hit both the $${minProfitTarget.toFixed(0)} net profit & ${minRoiTarget}% ROI goals yet.`}
            </p>
          </div>

          {/* Stat 2: 🟡 MAYBE */}
          <div className="rounded-2xl border border-amber-500/40 bg-slate-950/80 p-4 space-y-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-amber-300 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-amber-400" /> 🟡 MAYBE (MODERATE MARGIN)
              </span>
              <span className="text-[10px] text-amber-400">Watchlist</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black font-mono text-amber-300">
                {analysisSummary.maybeCards.length} <span className="text-xs text-slate-400 font-normal">cards</span>
              </span>
              <span className="text-xs font-extrabold font-mono text-amber-300">
                +${analysisSummary.totalMaybeProfit.toFixed(2)} Net
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Positive return or PSA 10 upside, but below primary targets or modest Grade 9 floor.
            </p>
          </div>

          {/* Stat 3: 🔴 DON'T DO IT */}
          <div className="rounded-2xl border border-rose-500/40 bg-slate-950/80 p-4 space-y-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-rose-400" /> 🔴 DON&apos;T DO IT (SELL RAW)
              </span>
              <span className="text-[10px] text-slate-400">Negative Net</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black font-mono text-slate-300">
                {analysisSummary.dontDoItCards.length} <span className="text-xs text-slate-400 font-normal">cards</span>
              </span>
              <span className="text-xs font-mono text-rose-400">Sell Raw / Hold</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Grading fee exceeds value spread. Better kept or sold un-graded.
            </p>
          </div>

          {/* Stat 4: Top Graded Potential */}
          <div className="rounded-2xl border border-indigo-500/40 bg-slate-950/80 p-4 space-y-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-400" /> TOP GRADED VALUATION
              </span>
              <span className="text-[10px] text-indigo-400">Active Scenario</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-black font-mono text-indigo-200">
                {analysisSummary.topCardVal > 0 ? `$${analysisSummary.topCardVal.toFixed(2)}` : "$0.00"}
              </span>
              <span className="text-xs font-mono text-slate-300">
                Total 10: ${analysisSummary.totalPsa10Potential.toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono truncate">
              {analysisSummary.topCard?.card?.data
                ? `Top Card: ${generateCdpTitle(analysisSummary.topCard.card.data)}`
                : "Run comps audit to reveal peak graded market potential."}
            </p>
          </div>
        </div>
      </div>

      {/* Filter, Search & Sorting Controls Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Strategy Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1">
              <Sliders className="h-3.5 w-3.5 text-amber-400" /> View Filter:
            </span>

            <button
              onClick={() => setStrategyFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                strategyFilter === "all"
                  ? "bg-slate-800 text-white border border-slate-700 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Candidates ({candidateCards.length})
            </button>

            <button
              onClick={() => setStrategyFilter("do_it")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                strategyFilter === "do_it"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow shadow-emerald-500/10"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              🟢 DO IT ({analysisSummary.doItCards.length})
            </button>

            <button
              onClick={() => setStrategyFilter("maybe")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                strategyFilter === "maybe"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow shadow-amber-500/10"
                  : "text-slate-400 hover:text-amber-400"
              }`}
            >
              🟡 MAYBE ({analysisSummary.maybeCards.length})
            </button>

            <button
              onClick={() => setStrategyFilter("dont_do_it")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                strategyFilter === "dont_do_it"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow"
                  : "text-slate-400 hover:text-rose-400"
              }`}
            >
              🔴 DON&apos;T DO IT ({analysisSummary.dontDoItCards.length})
            </button>
          </div>

          <button
            onClick={onOpenSettings}
            className="px-3.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-mono font-bold text-amber-300 transition flex items-center gap-1.5 shadow self-start md:self-auto"
          >
            <Sliders className="h-3.5 w-3.5 text-amber-400" /> ⚙️ Rules &amp; Settings
          </button>
        </div>

        {/* Search Input & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search grading candidates by player, set, team..."
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs font-mono text-slate-100 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 p-0.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" /> Sort By:
            </span>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 focus:border-amber-500 text-xs font-mono font-bold text-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer"
            >
              <option value="hierarchy">⭐ Recommendation Hierarchy (🟢 Do It → 🟡 Maybe → 🔴 Don&apos;t)</option>
              <option value="profitTarget">Highest Active Net Profit ({activeTargetGrade.toUpperCase()})</option>
              <option value="profit10">Highest Net Profit (PSA 10)</option>
              <option value="profit9">Highest Net Profit (PSA 9)</option>
              <option value="psa10Val">Highest PSA 10 Value</option>
              <option value="psa9Val">Highest PSA 9 Value</option>
              <option value="rawVal">Highest Estimated Raw Value</option>
              <option value="player">Player Name (A-Z)</option>
            </select>

            <button
              onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition font-mono text-xs font-bold"
              title="Toggle Sort Direction"
            >
              {sortOrder === "desc" ? "⬇️ High to Low" : "⬆️ Low to High"}
            </button>
          </div>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      {sortedAndFilteredCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAndFilteredCards.map((item) => {
            const evalData = evaluatedMap[item.id];
            const d = item.data;
            const title = generateCdpTitle(d || {});
            const rawVal = evalData?.rawVal || d?.estimatedValue || 0;
            const fee = effectiveGradingFee;
            const m = getActiveMetrics(evalData, activeTargetGrade, rawVal, fee);
            const tier = evalData?.status === "done"
              ? computeCardTier(
                  m.net10,
                  m.net9,
                  m.roi10,
                  m.roi9,
                  activeTargetGrade,
                  minProfitTarget,
                  minRoiTarget,
                  settings.requirePsa9Profitability
                )
              : "unevaluated";

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 space-y-4 shadow-xl transition flex flex-col justify-between ${
                  tier === "do_it"
                    ? "border-emerald-500/60 bg-gradient-to-b from-emerald-950/25 via-slate-900 to-slate-900 shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                    : tier === "maybe"
                    ? "border-amber-500/50 bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-900 shadow-amber-500/10"
                    : tier === "dont_do_it"
                    ? "border-rose-500/40 bg-gradient-to-b from-rose-950/15 via-slate-900 to-slate-900 shadow-rose-500/10"
                    : "border-slate-800 bg-slate-900/90"
                }`}
              >
                {/* Header Badge & Image */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {item.prefix}
                    </span>

                    {evalData?.status === "done" ? (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {tier === "do_it" && (
                          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/50 px-2.5 py-0.5 text-[10px] font-mono font-black text-emerald-300 flex items-center gap-1 shadow-md shadow-emerald-500/20">
                            🟢 DO IT ({m.activeProfit > 0 ? "+" : ""}${m.activeProfit.toFixed(2)} Net)
                          </span>
                        )}
                        {tier === "maybe" && (
                          <span className="rounded-full bg-amber-500/20 border border-amber-500/50 px-2.5 py-0.5 text-[10px] font-mono font-extrabold text-amber-300 flex items-center gap-1 shadow-md shadow-amber-500/10">
                            🟡 MAYBE ({m.activeProfit > 0 ? "+" : ""}${m.activeProfit.toFixed(2)} Net)
                          </span>
                        )}
                        {tier === "dont_do_it" && (
                          <span className="rounded-full bg-rose-500/20 border border-rose-500/50 px-2.5 py-0.5 text-[10px] font-mono font-extrabold text-rose-300 flex items-center gap-1">
                            🔴 DON&apos;T DO IT ({m.activeProfit >= 0 ? "+" : ""}${m.activeProfit.toFixed(2)} Net)
                          </span>
                        )}
                      </div>
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
                    <span className="font-bold text-emerald-400">${rawVal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Target {settings.targetCompany || "PSA"} Fee + Shipping:</span>
                    <span className="text-slate-300 font-bold text-white">${effectiveGradingFee.toFixed(2)}</span>
                  </div>

                  {evalData?.status === "done" ? (
                    <>
                      {/* PSA 10 Row */}
                      <div className={`p-2 rounded-lg border transition ${
                        activeTargetGrade === "psa10"
                          ? "bg-amber-950/30 border-amber-500/40"
                          : "border-slate-800/80 bg-slate-900/50"
                      }`}>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-300 font-bold flex items-center gap-1">
                            Est. {settings.targetCompany} 10 Value:
                            {activeTargetGrade === "psa10" && (
                              <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.2 rounded font-mono font-extrabold">
                                ACTIVE TARGET
                              </span>
                            )}
                          </span>
                          <span className="font-extrabold text-amber-300">
                            {m.psa10Val > 0 ? `$${m.psa10Val.toFixed(2)}` : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                          <span className="text-slate-400">Net Profit (10):</span>
                          <span className={`font-black ${m.net10 > 0 ? "text-amber-400" : "text-rose-400"}`}>
                            {m.net10 > 0 ? "+" : ""}${m.net10.toFixed(2)} ({m.roi10}%)
                          </span>
                        </div>
                      </div>

                      {/* PSA 9 Row */}
                      <div className={`p-2 rounded-lg border transition ${
                        activeTargetGrade === "psa9"
                          ? "bg-cyan-950/30 border-cyan-500/40"
                          : "border-slate-800/80 bg-slate-900/50"
                      }`}>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-300 font-bold flex items-center gap-1">
                            Est. {settings.targetCompany} 9 Value:
                            {activeTargetGrade === "psa9" && (
                              <span className="text-[9px] bg-cyan-500/30 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-extrabold">
                                ACTIVE TARGET
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-cyan-300">
                            {m.psa9Val > 0 ? `$${m.psa9Val.toFixed(2)}` : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                          <span className="text-slate-400">Net Profit (9):</span>
                          <span className={`font-black ${m.net9 >= 0 ? "text-cyan-300" : "text-rose-400"}`}>
                            {m.net9 >= 0 ? "+" : ""}${m.net9.toFixed(2)} ({m.roi9}%)
                          </span>
                        </div>
                      </div>

                      {activeTargetGrade === "balanced" && (
                        <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 flex items-center justify-between text-xs font-mono">
                          <span className="text-emerald-300 font-bold flex items-center gap-1">
                            ⚖️ Balanced Target Net:
                          </span>
                          <span className="font-black text-emerald-300">
                            {m.activeProfit > 0 ? "+" : ""}${m.activeProfit.toFixed(2)} ({m.activeRoi}%)
                          </span>
                        </div>
                      )}
                    </>
                  ) : evalData?.status === "evaluating" ? (
                    <div className="py-3 text-center text-xs font-mono text-amber-400 flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fetching {settings.targetCompany} 10 &amp; 9 Market Comps...
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[11px] font-mono text-slate-500">
                      Click &quot;Run Graded Comps Audit&quot; to calculate ROI
                    </div>
                  )}
                </div>

                {/* Expandable Graded Comps Viewer */}
                {expandedGradedCardId === item.id && (
                  <div className="bg-slate-950/90 rounded-xl p-3 border border-amber-500/30 space-y-3 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setGradedViewGrade("psa10")}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 ${
                            gradedViewGrade === "psa10"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "text-slate-400 hover:text-amber-300"
                          }`}
                        >
                          💎 PSA 10 ({(evalData?.psa10Sales || item.data?.gradingAnalysis?.psa10Sales || []).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setGradedViewGrade("psa9")}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition flex items-center gap-1 ${
                            gradedViewGrade === "psa9"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-slate-400 hover:text-cyan-300"
                          }`}
                        >
                          🛡️ PSA 9 ({(evalData?.psa9Sales || item.data?.gradingAnalysis?.psa9Sales || []).length})
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedGradedCardId(null)}
                        className="text-[10px] font-mono text-slate-400 hover:text-white"
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* Listings Display */}
                    {gradedViewGrade === "psa10" ? (
                      (evalData?.psa10Sales || item.data?.gradingAnalysis?.psa10Sales || []).length > 0 ? (
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                          {(evalData?.psa10Sales || item.data?.gradingAnalysis?.psa10Sales || []).map((sale, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs"
                            >
                              <div className="h-10 w-9 shrink-0 bg-slate-950 rounded overflow-hidden border border-slate-800 flex items-center justify-center">
                                {sale.imageUrl ? (
                                  <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                ) : (
                                  <Award className="h-4 w-4 text-amber-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[10px] text-slate-200 line-clamp-1 block" title={sale.title}>
                                  {sale.title}
                                </span>
                                <span className="text-xs font-mono font-black text-amber-400">
                                  ${sale.price.toFixed(2)} {sale.currency}
                                </span>
                              </div>
                              {sale.itemWebUrl && (
                                <a
                                  href={sale.itemWebUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded bg-slate-800 hover:bg-amber-600 text-slate-400 hover:text-white transition shrink-0"
                                  title="View Graded Listing on eBay"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] font-mono text-slate-400 text-center py-2">
                          No direct PSA 10 comps found for this card.
                        </p>
                      )
                    ) : (
                      (evalData?.psa9Sales || item.data?.gradingAnalysis?.psa9Sales || []).length > 0 ? (
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                          {(evalData?.psa9Sales || item.data?.gradingAnalysis?.psa9Sales || []).map((sale, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs"
                            >
                              <div className="h-10 w-9 shrink-0 bg-slate-950 rounded overflow-hidden border border-slate-800 flex items-center justify-center">
                                {sale.imageUrl ? (
                                  <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                ) : (
                                  <Award className="h-4 w-4 text-cyan-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[10px] text-slate-200 line-clamp-1 block" title={sale.title}>
                                  {sale.title}
                                </span>
                                <span className="text-xs font-mono font-black text-cyan-400">
                                  ${sale.price.toFixed(2)} {sale.currency}
                                </span>
                              </div>
                              {sale.itemWebUrl && (
                                <a
                                  href={sale.itemWebUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-400 hover:text-white transition shrink-0"
                                  title="View Graded Listing on eBay"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] font-mono text-slate-400 text-center py-2">
                          No direct PSA 9 comps found for this card.
                        </p>
                      )
                    )}
                  </div>
                )}

                {/* Inspect & Action Buttons */}
                <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
                  <button
                    onClick={() => evaluateCard(item)}
                    disabled={evalData?.status === "evaluating"}
                    className="text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-evaluate Comps
                  </button>

                  <div className="flex items-center gap-1.5">
                    {((evalData?.psa10Sales || item.data?.gradingAnalysis?.psa10Sales || []).length > 0 ||
                      (evalData?.psa9Sales || item.data?.gradingAnalysis?.psa9Sales || []).length > 0) && (
                      <button
                        type="button"
                        onClick={() => setExpandedGradedCardId(expandedGradedCardId === item.id ? null : item.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 ${
                          expandedGradedCardId === item.id
                            ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                            : "bg-slate-800 hover:bg-slate-700 text-amber-300"
                        }`}
                        title="View direct eBay graded comps for this card"
                      >
                        <Award className="h-3.5 w-3.5 text-amber-400" />
                        {expandedGradedCardId === item.id
                          ? "Hide Comps"
                          : `Comps (${
                              (evalData?.psa10Sales || item.data?.gradingAnalysis?.psa10Sales || []).length +
                              (evalData?.psa9Sales || item.data?.gradingAnalysis?.psa9Sales || []).length
                            })`}
                      </button>
                    )}

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
              </div>
            );
          })}
        </div>
      ) : candidateCards.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto">
            <Award className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h4 className="text-base font-bold text-white">
              {allCards.length === 0
                ? "No Scanned Cards Available Yet"
                : `No Cards Meet the Raw Threshold ($${minRawThreshold.toFixed(2)})`}
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              {allCards.length === 0
                ? "Upload or scan a batch of trading cards in the Batch Scanner tab to analyze PSA 10 & PSA 9 grading profitability."
                : `You have ${allCards.length} cards in your collection, but none currently meet the minimum raw value cutoff ($${minRawThreshold.toFixed(2)}). You can lower your minimum raw threshold in settings to analyze lower-value cards.`}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            <button
              onClick={onOpenSettings}
              className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-mono font-bold text-amber-300 hover:bg-amber-500/30 transition inline-flex items-center gap-2"
            >
              <Sliders className="h-3.5 w-3.5" /> Adjust Raw Threshold ($)
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto">
            <Award className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-base font-bold text-white">No Candidate Cards Matching &quot;{strategyFilter.toUpperCase()}&quot; Filter</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              No candidate cards match your current strategy filter. Switch your filter tab above or lower your threshold in settings.
            </p>
          </div>

          <button
            onClick={() => setStrategyFilter("all")}
            className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-mono font-bold text-amber-300 hover:bg-amber-500/30 transition inline-flex items-center gap-2"
          >
            Show All Candidates ({candidateCards.length})
          </button>
        </div>
      )}
    </div>
  );
}
