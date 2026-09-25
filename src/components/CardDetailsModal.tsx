"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  CardItem,
  SavedCollectionItem,
  CDPCardSchema,
  CompSaleItem,
  GradingAnalysis,
  UserGradingSettings,
  GradingRecommendationTier,
  GradingTargetGrade,
  getTotalGradingCost,
  ValuationSummary,
  PsaAnalysisSummary,
  DualStreamCompResponse,
  CardDestination,
  VaultDestination,
  BinTier,
  TriageCategory,
  TriageStatus,
  GradingStage,
  UserSettings,
} from "@/types/card";
import { computeCardTier } from "@/components/GradingCandidatesTab";
import { generateCdpTitle } from "@/lib/titleGenerator";
import { sanitizeCompQuery, generateWaterfallQueries } from "@/lib/compSanitizer";
import { VariationMatcherModal } from "@/components/VariationMatcherModal";
import { extractVariationFromListingTitle, extractCardDetailsFromListing } from "@/lib/variationExtractor";
import { checkPotentialNumberedParallel } from "@/lib/parallelDetection";
import {
  X,
  Save,
  Sparkles,
  AlertTriangle,
  Image as ImageIcon,
  CheckCircle,
  Tag,
  ShieldCheck,
  MapPin,
  Award,
  Copy,
  Check,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Search,
  AlertCircle,
  Zap,
  Clock,
  ShieldAlert,
  BadgeDollarSign,
  CheckCircle2,
  Box,
  Compass,
  ArrowRight,
  Lock,
  Layers,
  Send,
} from "lucide-react";
import { useModalDismissal } from "@/lib/useModalDismissal";
import { FeatureGate } from "@/components/FeatureGate";
import { usePlanPermissions } from "@/context/PlanContext";

interface CardDetailsModalProps {
  card: CardItem | SavedCollectionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCardId: string, updatedData: CDPCardSchema) => void;
  isSaved?: boolean;
  onMarkCardAsSold?: (
    id: string,
    soldData: {
      soldPrice: number;
      soldPlatform?: 'SHOP' | 'EBAY' | 'VENDOR_TABLE' | 'CASH' | 'OTHER';
      soldFees?: number;
      soldDate?: string;
    }
  ) => Promise<boolean | void>;
  gradingSettings?: UserGradingSettings;
  userSettings?: UserSettings;
  onUpdateVaultAndBin?: (
    id: string,
    updates: {
      vaultDestination?: VaultDestination;
      binTier?: BinTier;
      isVaulted?: boolean;
      isBulk?: boolean;
      triageCategory?: TriageCategory;
      triageStatus?: TriageStatus;
      gradingStage?: GradingStage;
      dontGrade?: boolean;
      selectedChannel?: CardDestination;
    }
  ) => Promise<boolean | void>;
  onNavigateToTab?: (tab: "ebay" | "grading" | "bins" | "collection") => void;
}

interface EbayCompsResult extends Partial<DualStreamCompResponse> {
  totalFound: number;
  medianPrice: number;
  estimatedMarketValue: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  filteredMinPrice: number;
  filteredMaxPrice: number;
  outlierCount: number;
  recentSales: CompSaleItem[];
  soldComps?: CompSaleItem[];
  activeListings?: CompSaleItem[];
  valuation?: ValuationSummary;
  psaAnalysis?: PsaAnalysisSummary;
  compIsBaseEstimate?: boolean;
  matchedStage?: DualStreamCompResponse["matchedStage"];
  sanitizedQuery?: string;
  psa10Value?: number;
  psa9Value?: number;
  psa8Value?: number;
  psa10Sales?: CompSaleItem[];
  psa9Sales?: CompSaleItem[];
  psa8Sales?: CompSaleItem[];
  gradingAnalysis?: GradingAnalysis;
}

export function CardDetailsModal({
  card,
  isOpen,
  onClose,
  onSave,
  isSaved,
  onMarkCardAsSold,
  gradingSettings,
  userSettings,
  onUpdateVaultAndBin,
  onNavigateToTab,
}: CardDetailsModalProps) {
  const { getGateMode, userPlan, isVipUnlimited, isAdmin, openPaywall } = usePlanPermissions();
  const isPaidUser = userPlan !== "FREE" || isVipUnlimited || isAdmin;
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const [copiedTitle, setCopiedTitle] = useState(false);

  // Sold Form State
  const [showSoldForm, setShowSoldForm] = useState(false);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  const [soldPriceInput, setSoldPriceInput] = useState<string>("");
  const [soldPlatformInput, setSoldPlatformInput] = useState<'SHOP' | 'EBAY' | 'VENDOR_TABLE' | 'CASH' | 'OTHER'>("EBAY");
  const [soldFeesInput, setSoldFeesInput] = useState<string>("");
  const [soldDateInput, setSoldDateInput] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // eBay Comps State
  const [compsResult, setCompsResult] = useState<EbayCompsResult | null>(null);
  const [compsTab, setCompsTab] = useState<"raw" | "psa10" | "psa9" | "psa8">("raw");
  const [rawSubTab, setRawSubTab] = useState<"sold" | "active">("sold");
  const [formatFilter, setFormatFilter] = useState<"ALL" | "FIXED_PRICE" | "AUCTION">("ALL");
  const [isFetchingComps, setIsFetchingComps] = useState(false);
  const [compsError, setCompsError] = useState<string | null>(null);
  const [customCompsQuery, setCustomCompsQuery] = useState("");
  const [appliedValueSuccess, setAppliedValueSuccess] = useState(false);
  const [isVariationMatcherOpen, setIsVariationMatcherOpen] = useState(false);
  const [appliedVariationNotice, setAppliedVariationNotice] = useState<string | null>(null);

  // Editable form state initialized from card data
  const [formData, setFormData] = useState<CDPCardSchema>({
    playerName: "",
    brand: "",
    setName: "",
    cardNumber: "",
    subsetParallel: "Base",
    team: "",
    sport: "Baseball",
    year: "",
    condition: "Raw",
    estimatedValue: 0,
    rawEstimatedValue: 0,
    purchasePrice: undefined,
    compIsBaseEstimate: false,
    valueLastUpdated: undefined,
    lastPriceRefreshedAt: undefined,
    lastCompDate: undefined,
    isRookie: false,
    isAutographed: false,
    isMemorabilia: false,
    isNumbered: false,
    numberedTo: undefined,
    serialVerified: false,
    isPossibleNumbered: false,
    isParallelOrColored: false,
    suspectedNumbered: false,
    detectedParallelType: undefined,
    gradingCompany: "None",
    grade: "",
    certNumber: "",
    location: "",
    notes: "",
  });

  // Keep formData in sync when the selected card changes
  useEffect(() => {
    if (card && card.data) {
      setFormData({
        playerName: card.data.playerName || (card as any).subject || "",
        brand: card.data.brand || "",
        setName: card.data.setName || "",
        cardNumber: card.data.cardNumber || "",
        subsetParallel: card.data.subsetParallel || "Base",
        team: card.data.team || "",
        sport: card.data.sport || "Baseball",
        year: card.data.year || "",
        condition: card.data.condition || "Raw",
        estimatedValue: card.data.estimatedValue || 0,
        rawEstimatedValue: card.data.rawEstimatedValue || card.data.estimatedValue || 0,
        purchasePrice: card.purchasePrice !== undefined ? card.purchasePrice : card.data.purchasePrice,
        compIsBaseEstimate: !!card.data.compIsBaseEstimate,
        lastPriceRefreshedAt: card.data.lastPriceRefreshedAt,
        isRookie: !!card.data.isRookie,
        isAutographed: !!card.data.isAutographed,
        isMemorabilia: !!card.data.isMemorabilia,
        isNumbered: !!card.data.isNumbered,
        numberedTo: card.data.numberedTo,
        serialVerified: !!card.data.serialVerified || !!(card as any).serialVerified,
        isPossibleNumbered: !!card.data.isPossibleNumbered || !!(card as any).isPossibleNumbered,
        isParallelOrColored: !!card.data.isParallelOrColored,
        suspectedNumbered: !!card.data.suspectedNumbered,
        detectedParallelType: card.data.detectedParallelType,
        gradingCompany: card.data.gradingCompany || "None",
        grade: card.data.grade || "",
        certNumber: card.data.certNumber || "",
        location: card.data.location || "",
        notes: card.data.notes || "",
        valueLastUpdated: card.data.valueLastUpdated,
        lastCompDate: card.data.lastCompDate,
        gradingAnalysis: card.data.gradingAnalysis,
      });
      setActiveSide("front");
      setCopiedTitle(false);
      setAppliedValueSuccess(false);

      setShowSoldForm(false);
      setIsMarkingSold(false);
      setSoldPriceInput(card.soldPrice !== undefined ? String(card.soldPrice) : card.data?.estimatedValue ? String(card.data.estimatedValue) : "");
      setSoldPlatformInput((card.soldPlatform as any) || "EBAY");
      setSoldFeesInput(card.soldFees !== undefined ? String(card.soldFees) : "");
      setSoldDateInput(card.soldDate ? card.soldDate.split("T")[0] : new Date().toISOString().split("T")[0]);

      const generatedQuery = sanitizeCompQuery(card.data) || generateCdpTitle(card.data);
      setCustomCompsQuery(generatedQuery);

      // Preload compsResult if card already has comps or graded sales from previous evaluation
      const savedSold: CompSaleItem[] =
        (card.data as any)?.lastCompsResult?.soldComps ||
        (card.data as any)?.soldComps ||
        [];
      const savedActive: CompSaleItem[] =
        (card.data as any)?.lastCompsResult?.activeListings ||
        (card.data as any)?.activeListings ||
        (Array.isArray(card.data?.listings) ? (card.data.listings as any) : []);
      const existingComps: CompSaleItem[] =
        (card.data as any)?.lastCompsResult?.recentSales ||
        (card.data as any)?.recentSales ||
        (savedSold.length > 0 ? savedSold : savedActive);

      if (savedSold.length > 0 || savedActive.length > 0 || existingComps.length > 0) {
        const estVal = card.data?.estimatedValue || 0;
        const partitionedSold =
          savedSold.length > 0
            ? savedSold
            : existingComps.filter((s: any) => s.saleType === "sold" || Boolean(s.soldDate));
        const partitionedActive =
          savedActive.length > 0
            ? savedActive
            : existingComps.filter((s: any) => s.saleType !== "sold" && !s.soldDate);

        setCompsResult({
          totalFound: (partitionedSold.length + partitionedActive.length) || existingComps.length,
          medianPrice: estVal,
          estimatedMarketValue: estVal,
          rawEstimatedValue: estVal,
          averagePrice: estVal,
          minPrice: 0,
          maxPrice: 0,
          filteredMinPrice: 0,
          filteredMaxPrice: 0,
          outlierCount: existingComps.filter((s: any) => s.isOutlier).length,
          recentSales: existingComps,
          soldComps: partitionedSold,
          activeListings: partitionedActive,
          valuation: {
            estimatedValue: estVal,
            confidenceTier: partitionedSold.length >= 5 ? "HIGH" : partitionedSold.length >= 2 ? "MEDIUM" : "LOW",
            confidenceReason: partitionedSold.length > 0
              ? `${partitionedSold.length} verified sold comps saved`
              : `${partitionedActive.length} active listings saved`,
            soldCount30Days: partitionedSold.length,
          },
          psa10Value: card.data.gradingAnalysis?.psa10Value,
          psa9Value: card.data.gradingAnalysis?.psa9Value,
          psa8Value: card.data.gradingAnalysis?.psa8Value,
          psa10Sales: card.data.gradingAnalysis?.psa10Sales || [],
          psa9Sales: card.data.gradingAnalysis?.psa9Sales || [],
          psa8Sales: card.data.gradingAnalysis?.psa8Sales || [],
          gradingAnalysis: card.data.gradingAnalysis,
        });
        setCompsTab("raw");
        setRawSubTab(partitionedSold.length > 0 ? "sold" : "active");
      } else if (card.data.gradingAnalysis?.psa10Sales?.length || card.data.gradingAnalysis?.psa9Sales?.length || card.data.gradingAnalysis?.psa8Sales?.length) {
        setCompsResult({
          totalFound: (card.data.gradingAnalysis.psa10Sales?.length || 0) + (card.data.gradingAnalysis.psa9Sales?.length || 0) + (card.data.gradingAnalysis.psa8Sales?.length || 0),
          medianPrice: card.data.estimatedValue || 0,
          estimatedMarketValue: card.data.estimatedValue || 0,
          rawEstimatedValue: card.data.estimatedValue || 0,
          averagePrice: card.data.estimatedValue || 0,
          minPrice: 0,
          maxPrice: 0,
          filteredMinPrice: 0,
          filteredMaxPrice: 0,
          outlierCount: 0,
          recentSales: [],
          psa10Value: card.data.gradingAnalysis.psa10Value,
          psa9Value: card.data.gradingAnalysis.psa9Value,
          psa8Value: card.data.gradingAnalysis.psa8Value,
          psa10Sales: card.data.gradingAnalysis.psa10Sales || [],
          psa9Sales: card.data.gradingAnalysis.psa9Sales || [],
          psa8Sales: card.data.gradingAnalysis.psa8Sales || [],
          gradingAnalysis: card.data.gradingAnalysis,
        });
        setCompsTab("psa10");
      } else {
        setCompsResult(null);
        setCompsTab("raw");
      }
      setCompsError(null);
    }
  }, [card?.id, isOpen]);

  // Re-run generateCdpTitle automatically whenever any attribute changes
  const cdpTitle = generateCdpTitle(formData);

  // Automatically keep customCompsQuery in sync whenever card details change
  useEffect(() => {
    if (!isOpen || !card) return;
    const generated = sanitizeCompQuery(formData) || generateCdpTitle(formData);
    if (generated) {
      setCustomCompsQuery(generated);
    }
  }, [
    isOpen,
    card,
    formData.playerName,
    formData.brand,
    formData.setName,
    formData.cardNumber,
    formData.subsetParallel,
    formData.team,
    formData.sport,
    formData.year,
    formData.isRookie,
    formData.isAutographed,
    formData.isMemorabilia,
    formData.isNumbered,
    formData.numberedTo,
    formData.condition,
    formData.gradingCompany,
    formData.grade,
  ]);

  useModalDismissal(isOpen, onClose);

  const parallelEval = checkPotentialNumberedParallel({
    data: formData,
    serialVerified: formData.serialVerified || (card as any)?.serialVerified,
  });

  const handleChange = (field: keyof CDPCardSchema, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === "cardNumber" && typeof value === "string" ? value.replace(/#/g, "").trim() : value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (card) onSave(card.id, formData);
    onClose();
  };

  const handleConfirmMarkAsSold = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!card || !onMarkCardAsSold) return;
    const price = parseFloat(soldPriceInput);
    if (isNaN(price) || price < 0) return;
    const fees = parseFloat(soldFeesInput) || 0;
    setIsMarkingSold(true);
    try {
      await onMarkCardAsSold(card.id, {
        soldPrice: price,
        soldPlatform: soldPlatformInput,
        soldFees: fees,
        soldDate: soldDateInput ? new Date(soldDateInput).toISOString() : new Date().toISOString(),
      });
      setShowSoldForm(false);
      onClose();
    } catch (err) {
      console.error("Failed to mark card as sold:", err);
    } finally {
      setIsMarkingSold(false);
    }
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(cdpTitle);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2500);
  };

  const handleApplyEstValue = (val: number) => {
    const updatedData: CDPCardSchema = {
      ...formData,
      estimatedValue: val,
      rawEstimatedValue: val,
      valueLastUpdated: new Date().toISOString(),
      lastPriceRefreshedAt: new Date().toISOString(),
      lastCompDate: new Date().toISOString(),
    };
    setFormData(updatedData);

    // Immediately persist to parent collection & Firestore database!
    if (card && card.id) {
      onSave(card.id, updatedData);
    }

    setAppliedValueSuccess(true);
    setTimeout(() => setAppliedValueSuccess(false), 2500);
  };

  const handleFetchComps = async (
    tabToActivate?: "raw" | "psa10" | "psa9",
    overrideQuery?: string,
    overrideData?: CDPCardSchema
  ) => {
    const dataToUse = overrideData || formData;
    const sanitizedTitle = sanitizeCompQuery(dataToUse);
    const queryToUse = (overrideQuery || customCompsQuery || sanitizedTitle || cdpTitle).trim();
    if (!queryToUse) return;

    setIsFetchingComps(true);
    setCompsError(null);
    if (tabToActivate) {
      setCompsTab(tabToActivate);
    }

    const isGradedCompRequest =
      tabToActivate === "psa10" ||
      tabToActivate === "psa9" ||
      dataToUse.condition === "Graded";

    try {
      const res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryToUse,
          cardData: dataToUse,
          includeGraded: isGradedCompRequest,
          gradingCompany: dataToUse.gradingCompany && dataToUse.gradingCompany !== "None" ? dataToUse.gradingCompany : (gradingSettings?.targetCompany || "PSA"),
          rawMarketValue: dataToUse.estimatedValue || undefined,
          gradingFee: getTotalGradingCost(gradingSettings),
          minProfitTarget: gradingSettings?.minGradingProfit ?? gradingSettings?.minNetProfitThreshold ?? 50.0,
          minRoiTarget: gradingSettings?.minGradingRoiPct ?? gradingSettings?.minRoiThreshold ?? 50.0,
          targetGrade: gradingSettings?.targetGrade ?? "psa9",
          requirePsa9Profitability: gradingSettings?.requirePsa9Profitability ?? true,
        }),
      });

      const data: any = await res.json();

      if (!res.ok || !data || data.error) {
        setCompsError(data?.error || "Failed to fetch eBay sales comps.");
        setCompsResult(null);
      } else {
        const rawSales: CompSaleItem[] = Array.isArray(data.recentSales) ? data.recentSales : [];
        const returnedSold: CompSaleItem[] = Array.isArray(data.soldComps) ? data.soldComps : [];
        const returnedActive: CompSaleItem[] = Array.isArray(data.activeListings) ? data.activeListings : [];

        // Partition with clean separation between sold sales and active listings
        const derivedSold =
          returnedSold.length > 0
            ? returnedSold
            : rawSales.filter((s: any) => s.saleType === "sold" || Boolean(s.soldDate));
        const derivedActive =
          returnedActive.length > 0
            ? returnedActive
            : rawSales.filter((s: any) => s.saleType !== "sold" && !s.soldDate);
        const allComps = [...derivedSold, ...derivedActive].length > 0 ? [...derivedSold, ...derivedActive] : rawSales;

        const estValue = data.valuation?.estimatedValue ?? data.estimatedMarketValue ?? data.medianPrice ?? 0;

        const normalizedData: DualStreamCompResponse = {
          ...data,
          recentSales: allComps,
          soldComps: derivedSold,
          activeListings: derivedActive,
          totalFound: (derivedSold.length + derivedActive.length) || data.totalFound || allComps.length,
          valuation: data.valuation ?? {
            estimatedValue: estValue,
            confidenceTier: derivedSold.length >= 5 ? "HIGH" : derivedSold.length >= 2 ? "MEDIUM" : "LOW",
            confidenceReason: derivedSold.length > 0
              ? `${derivedSold.length} verified sold comps analyzed`
              : `${derivedActive.length} active listings analyzed`,
            soldCount30Days: derivedSold.length,
            lowestActivePrice: data.minPrice ?? (derivedActive[0]?.price || 0),
          },
        };

        // Automated Fallback: If 0 comps were found on the initial query, automatically try Auto-Adjust All to get a match!
        if (estValue === 0 && (data.totalFound === 0 || allComps.length === 0) && !overrideQuery) {
          const queryWaterfall = generateWaterfallQueries(dataToUse);
          const autoAllQuery = queryWaterfall.autoAdjustTiers.find((t) => t.id === "auto_adjust_all")?.query || queryWaterfall.dropNumberQuery;
          if (autoAllQuery && autoAllQuery !== queryToUse) {
            setCustomCompsQuery(autoAllQuery);
            return handleFetchComps(tabToActivate, autoAllQuery, dataToUse);
          }
        }

        if (data.autoAdjusted && data.sanitizedQuery && data.sanitizedQuery !== customCompsQuery) {
          setCustomCompsQuery(data.sanitizedQuery);
        }

        setCompsResult(normalizedData);
        setCompsTab(tabToActivate || "raw");
        setRawSubTab(derivedSold.length > 0 ? "sold" : "active");

        const updated = {
          ...dataToUse,
          estimatedValue: estValue,
          rawEstimatedValue: estValue,
          compIsBaseEstimate: !!data.compIsBaseEstimate,
          valueLastUpdated: new Date().toISOString(),
          lastPriceRefreshedAt: new Date().toISOString(),
          lastCompDate: new Date().toISOString(),
          recentSales: allComps,
          ...(data.gradingAnalysis ? { gradingAnalysis: data.gradingAnalysis } : {}),
        };
        setFormData(updated);
        if (card && card.id) {
          onSave(card.id, updated);
        }
      }
    } catch (err: any) {
      setCompsError(err.message || "Failed to connect to eBay Comps API.");
      setCompsResult(null);
    } finally {
      setIsFetchingComps(false);
    }
  };

  const handleApplyVariationFromListing = async (saleOrTitle: string | CompSaleItem) => {
    let saleItem: CompSaleItem;
    if (typeof saleOrTitle === "string") {
      const found =
        compsResult?.activeListings?.find((s) => s.title === saleOrTitle) ||
        compsResult?.soldComps?.find((s) => s.title === saleOrTitle) ||
        compsResult?.recentSales?.find((s) => s.title === saleOrTitle);
      saleItem = found || { title: saleOrTitle, price: 0, currency: "USD", isOutlier: false };
    } else {
      saleItem = saleOrTitle;
    }

    const updates = extractCardDetailsFromListing(saleItem, formData);

    const updated: CDPCardSchema = {
      ...formData,
      ...updates,
    };

    setFormData(updated);

    // Synchronize compsResult in-place so all valuation metrics, FMV cards,
    // and margin calculations in the modal immediately reflect the matched listing price!
    if (updates.estimatedValue) {
      const matchedPrice = updates.estimatedValue;
      setCompsResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          medianPrice: matchedPrice,
          estimatedMarketValue: matchedPrice,
          rawEstimatedValue: matchedPrice,
          valuation: {
            soldCount30Days: prev.valuation?.soldCount30Days ?? 1,
            ...prev.valuation,
            estimatedValue: matchedPrice,
            confidenceTier: "HIGH",
            confidenceReason: `Directly matched to listing "${saleItem.title}"`,
          },
        };
      });
    }

    if (card && card.id) {
      onSave(card.id, updated);
    }

    const detailsUpdated: string[] = [];
    if (updates.estimatedValue) detailsUpdated.push(`Value: $${updates.estimatedValue.toFixed(2)}`);
    if (updates.year) detailsUpdated.push(`Year: ${updates.year}`);
    if (updates.setName) detailsUpdated.push(`Set: ${updates.setName}`);
    if (updates.subsetParallel) detailsUpdated.push(`Variation: "${updates.subsetParallel}"`);
    if (updates.numberedTo) detailsUpdated.push(`/${updates.numberedTo}`);
    if (updates.cardNumber && updates.cardNumber !== formData.cardNumber) detailsUpdated.push(`#${updates.cardNumber}`);
    if (updates.team) detailsUpdated.push(`Team: ${updates.team}`);
    if (updates.isRookie) detailsUpdated.push(`RC ⭐`);
    if (updates.isAutographed) detailsUpdated.push(`Auto ✍️`);
    if (updates.isMemorabilia) detailsUpdated.push(`Relic 🧵`);

    setAppliedVariationNotice(`✨ Applied eBay Listing Details! ${detailsUpdated.join(" • ")}. Inspector view is open — review details or make changes if needed, then click "Save Changes".`);
    setTimeout(() => setAppliedVariationNotice(null), 9000);

    const newQuery = sanitizeCompQuery(updated);
    setCustomCompsQuery(newQuery);
  };

  const handleVariationMatched = async (
    cardId: string,
    updates: Partial<CDPCardSchema>,
    recomp?: boolean
  ) => {
    const updated: CDPCardSchema = {
      ...formData,
      ...updates,
    };
    setFormData(updated);

    if (updates.estimatedValue) {
      const matchedPrice = updates.estimatedValue;
      setCompsResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          medianPrice: matchedPrice,
          estimatedMarketValue: matchedPrice,
          rawEstimatedValue: matchedPrice,
          valuation: {
            soldCount30Days: prev.valuation?.soldCount30Days ?? 1,
            ...prev.valuation,
            estimatedValue: matchedPrice,
            confidenceTier: "HIGH",
            confidenceReason: "Matched from eBay listing",
          },
        };
      });
    }

    if (card && card.id) {
      onSave(card.id, updated);
    }
    setIsVariationMatcherOpen(false);

    const detailsUpdated: string[] = [];
    if (updates.estimatedValue) detailsUpdated.push(`Value: $${updates.estimatedValue.toFixed(2)}`);
    if (updates.year) detailsUpdated.push(`Year: ${updates.year}`);
    if (updates.setName) detailsUpdated.push(`Set: ${updates.setName}`);
    if (updates.subsetParallel) detailsUpdated.push(`Variation: "${updates.subsetParallel}"`);
    if (updates.numberedTo) detailsUpdated.push(`/${updates.numberedTo}`);
    if (updates.cardNumber && updates.cardNumber !== formData.cardNumber) detailsUpdated.push(`#${updates.cardNumber}`);
    if (updates.team) detailsUpdated.push(`Team: ${updates.team}`);
    if (updates.isRookie) detailsUpdated.push(`RC ⭐`);

    setAppliedVariationNotice(`✨ Applied eBay Listing Details! ${detailsUpdated.join(" • ")}. Inspector view is open — review details or make changes if needed, then click "Save Changes".`);
    setTimeout(() => setAppliedVariationNotice(null), 9000);

    if (recomp) {
      const newQuery = sanitizeCompQuery(updated);
      setCustomCompsQuery(newQuery);
      handleFetchComps("raw", newQuery, updated);
    }
  };

  // Active Grading Evaluation & Traffic-Light Tier for Comps
  const activeTargetGrade: GradingTargetGrade = gradingSettings?.targetGrade || "psa9";
  const minProfitTarget = gradingSettings?.minGradingProfit ?? gradingSettings?.minNetProfitThreshold ?? 50.0;
  const minRoiTarget = gradingSettings?.minGradingRoiPct ?? gradingSettings?.minRoiThreshold ?? 50.0;
  const requirePsa9 = gradingSettings?.requirePsa9Profitability ?? true;
  const gradingFee = compsResult?.gradingAnalysis?.gradingFee || getTotalGradingCost(gradingSettings);
  const rawMarketVal = compsResult?.valuation?.estimatedValue ?? compsResult?.estimatedMarketValue ?? formData.estimatedValue ?? 0;
  const totalBreakeven = rawMarketVal + gradingFee;

  const currentP10 = compsResult?.psa10Value || 0;
  const currentP9 = compsResult?.psa9Value || 0;
  const currentP8 = compsResult?.psa8Value || 0;
  const hasVerifiedGradedComps = currentP10 > 0 || currentP9 > 0 || currentP8 > 0;

  const netP10 = compsResult?.gradingAnalysis?.netProfitPSA10 !== undefined
    ? compsResult.gradingAnalysis.netProfitPSA10
    : (currentP10 > 0 ? parseFloat((currentP10 - totalBreakeven).toFixed(2)) : 0);
  const netP9 = compsResult?.gradingAnalysis?.netProfitPSA9 !== undefined
    ? compsResult.gradingAnalysis.netProfitPSA9
    : (currentP9 > 0 ? parseFloat((currentP9 - totalBreakeven).toFixed(2)) : 0);
  const netP8 = compsResult?.gradingAnalysis?.netProfitPSA8 !== undefined
    ? compsResult.gradingAnalysis.netProfitPSA8
    : (currentP8 > 0 ? parseFloat((currentP8 - totalBreakeven).toFixed(2)) : 0);
  const roiP10 = compsResult?.gradingAnalysis?.roiPSA10 !== undefined
    ? compsResult.gradingAnalysis.roiPSA10
    : (currentP10 > 0 && totalBreakeven > 0 ? parseFloat(((netP10 / totalBreakeven) * 100).toFixed(1)) : 0);
  const roiP9 = compsResult?.gradingAnalysis?.roiPSA9 !== undefined
    ? compsResult.gradingAnalysis.roiPSA9
    : (currentP9 > 0 && totalBreakeven > 0 ? parseFloat(((netP9 / totalBreakeven) * 100).toFixed(1)) : 0);
  const roiP8 = compsResult?.gradingAnalysis?.roiPSA8 !== undefined
    ? compsResult.gradingAnalysis.roiPSA8
    : (currentP8 > 0 && totalBreakeven > 0 ? parseFloat(((netP8 / totalBreakeven) * 100).toFixed(1)) : 0);

  const cardTier = hasVerifiedGradedComps
    ? computeCardTier(
        netP10,
        netP9,
        roiP10,
        roiP9,
        activeTargetGrade,
        minProfitTarget,
        minRoiTarget,
        requirePsa9,
        netP8,
        roiP8,
        {
          psa8: gradingSettings?.psa8Threshold,
          psa9: gradingSettings?.psa9Threshold,
          psa10: gradingSettings?.psa10Threshold,
        }
      )
    : "unevaluated";

  // Automated System Destination Recommendation
  // Chooses between: 'EBAY' | 'GRADE' | 'BINS' | 'BULK'
  const recommendedDestination = useMemo<{
    destination: CardDestination;
    label: string;
    subLabel: string;
    reason: string;
    badgeColor: string;
  }>(() => {
    const rawVal = formData.estimatedValue || card?.data?.estimatedValue || 0;
    const minEbayThreshold = gradingSettings?.minEbayRawThreshold ?? userSettings?.minEbayRawThreshold ?? 4.0;
    const pureBulkCutoff = gradingSettings?.pureBulkCutoff ?? userSettings?.pureBulkCutoff ?? 1.0;

    const isRejectedFromGrading =
      card?.dontGrade === true ||
      card?.data?.dontGrade === true ||
      card?.gradingStage === "REJECTED" ||
      card?.data?.gradingStage === "REJECTED" ||
      formData.dontGrade === true ||
      formData.gradingStage === "REJECTED";

    // 1. Grade Recommendation Check:
    // If PSA ROI analysis is strongly profitable, or card tier is "do_it"
    const isGradingTier = cardTier === "do_it";
    const isExplicitlyRecommendedByAnalysis =
      compsResult?.gradingAnalysis?.isRecommended === true ||
      card?.data?.gradingAnalysis?.isRecommended === true ||
      compsResult?.gradingAnalysis?.recommendationTier === "do_it" ||
      (compsResult?.gradingAnalysis?.recommendationTier as string) === "strong_candidate";

    const hasStrongPsa10Upside =
      currentP10 > 0 &&
      netP10 >= minProfitTarget &&
      roiP10 >= minRoiTarget &&
      rawVal >= (gradingSettings?.minRawThreshold ?? 10.0);

    const isGradeCandidate =
      !isRejectedFromGrading &&
      (isGradingTier || isExplicitlyRecommendedByAnalysis || hasStrongPsa10Upside);

    if (isGradeCandidate) {
      const profitText = netP10 > 0 ? `+$${netP10.toFixed(2)} PSA 10 profit` : `High ROI grading candidate`;
      return {
        destination: "GRADE",
        label: "Grade",
        subLabel: "PSA Pipeline",
        reason: `High grading arbitrage (${profitText}${roiP10 > 0 ? `, ${roiP10.toFixed(0)}% ROI` : ""})`,
        badgeColor: "text-purple-300 border-purple-500/40 bg-purple-500/10",
      };
    }

    // 2. eBay Recommendation Check:
    // If raw estimated value >= minEbayThreshold (default $4.00)
    if (rawVal >= minEbayThreshold) {
      return {
        destination: "EBAY",
        label: "eBay",
        subLabel: "Singles ($4+)",
        reason: `Raw value ($${rawVal.toFixed(2)}) meets single threshold (≥ $${minEbayThreshold.toFixed(2)})`,
        badgeColor: "text-indigo-300 border-indigo-500/40 bg-indigo-500/10",
      };
    }

    // 3. $Bins Recommendation Check:
    // If raw value is between pureBulkCutoff ($1.00) and minEbayThreshold ($4.00)
    if (rawVal >= pureBulkCutoff) {
      let binTierLabel = "$1 Bin";
      if (rawVal >= 3.0) binTierLabel = "$4 Bin";
      else if (rawVal >= 2.0) binTierLabel = "$3 Bin";
      return {
        destination: "BINS",
        label: "$Bins",
        subLabel: "Value Bins",
        reason: `Raw value ($${rawVal.toFixed(2)}) is optimal for ${binTierLabel} show inventory`,
        badgeColor: "text-amber-300 border-amber-500/40 bg-amber-500/10",
      };
    }

    // 4. Bulk Recommendation Check:
    // If raw value < pureBulkCutoff ($1.00)
    return {
      destination: "BULK",
      label: "Bulk",
      subLabel: "Pure Bulk",
      reason: `Raw value ($${rawVal.toFixed(2)}) is sub-$${pureBulkCutoff.toFixed(2)} bulk common outflow`,
      badgeColor: "text-slate-300 border-slate-600 bg-slate-800/50",
    };
  }, [
    card,
    formData.estimatedValue,
    formData.dontGrade,
    formData.gradingStage,
    cardTier,
    compsResult,
    currentP10,
    netP10,
    roiP10,
    minProfitTarget,
    minRoiTarget,
    gradingSettings,
    userSettings,
  ]);

  // Active Selected Destination:
  const currentCardDestination = useMemo<CardDestination | null>(() => {
    if (!card) return null;
    if (card.selectedChannel) return card.selectedChannel;
    if (card.data?.selectedChannel) return card.data.selectedChannel;
    if (formData.selectedChannel) return formData.selectedChannel;
    if (card.vaultDestination === "PSA_GRADING" || card.triageStatus === "GRADE_CANDIDATE" || card.data?.triageStatus === "GRADE_CANDIDATE") return "GRADE";
    if (card.vaultDestination === "EBAY" || card.triageStatus === "EBAY_RAW" || card.data?.triageStatus === "EBAY_RAW") return "EBAY";
    if (card.binTier === "PURE_BULK" || card.isBulk || card.triageCategory === "BULK") return "BULK";
    if (card.binTier === "BIN_UNDER_4" || card.binTier === "BIN_1" || card.binTier === "BIN_3" || card.binTier === "BIN_4" || card.triageCategory === "DOLLAR_BIN" || card.triageStatus === "DOLLAR_BIN") return "BINS";
    return null;
  }, [card, formData.selectedChannel]);

  const [userSelectedDestination, setUserSelectedDestination] = useState<CardDestination | null>(currentCardDestination);
  const [destinationActionFeedback, setDestinationActionFeedback] = useState<{
    message: string;
    type: "success" | "info" | "error";
  } | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  useEffect(() => {
    setUserSelectedDestination(currentCardDestination);
    setDestinationActionFeedback(null);
  }, [currentCardDestination, card?.id]);

  const handleDestinationSelect = async (dest: CardDestination) => {
    if (!card) return;
    setUserSelectedDestination(dest);

    const destName = dest === "EBAY" ? "eBay" : dest === "GRADE" ? "Grade" : dest === "BINS" ? "$Bins" : "Bulk";

    if (!isPaidUser) {
      // FREE USER:
      // Can select it freely; saved to card inventory tags, but does NOT feed into pipeline tabs
      const updatedData: CDPCardSchema = {
        ...formData,
        selectedChannel: dest,
      };
      setFormData(updatedData);
      onSave(card.id, updatedData);
      setDestinationActionFeedback({
        message: `🏷️ Selected: Card tagged for ${destName} in your Master Collection. Automated pipeline feeding into active tabs is available on Paid Plans.`,
        type: "info",
      });
      return;
    }

    // PAID USER:
    // Feeds over to the appropriate spot!
    setIsRoutingLoading(true);
    try {
      const rawVal = formData.estimatedValue || card.data?.estimatedValue || 0;

      if (dest === "EBAY") {
        await onUpdateVaultAndBin?.(card.id, {
          isVaulted: true,
          vaultDestination: "EBAY",
          binTier: undefined,
          isBulk: false,
          triageCategory: "EBAY",
          triageStatus: "EBAY_RAW",
          selectedChannel: "EBAY",
        });
        setDestinationActionFeedback({
          message: `✓ Fed to eBay Singles Candidates Tab. Card is ready for pricing and publishing.`,
          type: "success",
        });
      } else if (dest === "GRADE") {
        await onUpdateVaultAndBin?.(card.id, {
          isVaulted: true,
          vaultDestination: "PSA_GRADING",
          binTier: undefined,
          isBulk: false,
          triageCategory: "GRADING",
          triageStatus: "GRADE_CANDIDATE",
          dontGrade: false,
          gradingStage: "CHECK_ROI",
          selectedChannel: "GRADE",
        });
        setDestinationActionFeedback({
          message: `✓ Fed to PSA Grading Candidates Tab. Card is in Step 1: Check ROI.`,
          type: "success",
        });
      } else if (dest === "BINS") {
        await onUpdateVaultAndBin?.(card.id, {
          isVaulted: false,
          vaultDestination: undefined,
          binTier: "BIN_UNDER_4",
          isBulk: false,
          triageCategory: "DOLLAR_BIN",
          triageStatus: "DOLLAR_BIN",
          selectedChannel: "BINS",
        });
        setDestinationActionFeedback({
          message: `✓ Fed to <$4 Bins (Value Bins) in Bins & Bulk Tab.`,
          type: "success",
        });
      } else if (dest === "BULK") {
        await onUpdateVaultAndBin?.(card.id, {
          isVaulted: false,
          vaultDestination: undefined,
          binTier: "PURE_BULK",
          isBulk: true,
          triageCategory: "BULK",
          triageStatus: "DOLLAR_BIN",
          selectedChannel: "BULK",
        });
        setDestinationActionFeedback({
          message: `✓ Fed to Pure Bulk Box in Bins & Bulk Tab.`,
          type: "success",
        });
      }

      setFormData((prev) => ({
        ...prev,
        selectedChannel: dest,
      }));
    } catch (err) {
      console.error("Failed to route card:", err);
      setDestinationActionFeedback({
        message: "Failed to update card destination.",
        type: "error",
      });
    } finally {
      setIsRoutingLoading(false);
    }
  };

  if (!isOpen || !card) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header (Sticky) */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20 shrink-0">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-300">
                  Card Inspector • CDP Title Generator
                </span>
                {isSaved ? (
                  <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                    ✓ In Master Collection
                  </span>
                ) : (
                  <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300 animate-pulse">
                    ⚡ Unsaved Intake Card
                  </span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-white tracking-tight line-clamp-1 break-words">
                {cdpTitle || "Trading Card Inspector"}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Real-time Applied eBay Details Notice Banner */}
            {appliedVariationNotice && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-950/95 via-slate-900/95 to-emerald-950/95 border-2 border-emerald-500/70 rounded-2xl flex items-center justify-between gap-3 text-emerald-200 shadow-xl shadow-emerald-950/60 animate-fade-in sticky top-0 z-30 backdrop-blur-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono font-bold leading-relaxed truncate">
                    {appliedVariationNotice}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                    Inspector Open
                  </span>
                  <button
                    type="button"
                    onClick={() => setAppliedVariationNotice(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* SECTION A: Image Header & Quick Preview Switcher */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            {/* Image Preview Box */}
            <div className="md:col-span-1 space-y-3">
              <div className="relative aspect-[3/4] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
                {activeSide === "front" ? (
                  card.frontPreview ? (
                    <img
                      src={card.frontPreview}
                      alt="Front"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500 font-mono">No Front Image</div>
                  )
                ) : (
                  card.backPreview ? (
                    <img
                      src={card.backPreview}
                      alt="Back"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500 font-mono">No Back Image</div>
                  )
                )}

                <span className="absolute top-2 left-2 rounded bg-slate-950/90 border border-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 uppercase">
                  {activeSide} view
                </span>
              </div>

              {/* Front/Back Thumbnail Switcher */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSide("front")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition ${
                    activeSide === "front"
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Front
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSide("back")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition ${
                    activeSide === "back"
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Back
                </button>
              </div>
            </div>

            {/* Quick Header Metadata Summary & Generated Marketplace Title */}
            <div className="md:col-span-2 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Generated Marketplace Title Input + Copy Button */}
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Generated Marketplace Title
                    </span>
                    {copiedTitle && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded">
                        ✓ Copied to Clipboard!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={cdpTitle}
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-2 text-xs font-mono font-bold text-white focus:outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyTitle}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                    >
                      {copiedTitle ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5 text-white" />}
                      {copiedTitle ? "Copied" : "Copy Title"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {formData.isRookie && (
                    <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300">
                      ⭐ ROOKIE CARD
                    </span>
                  )}
                  {formData.isAutographed && (
                    <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
                      ✍️ AUTOGRAPH
                    </span>
                  )}
                  {formData.isMemorabilia && (
                    <span className="rounded bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-xs font-mono font-bold text-indigo-300">
                      🏷️ MEMORABILIA
                    </span>
                  )}
                  {formData.isNumbered && (
                    <span className="rounded bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-xs font-mono font-bold text-purple-300">
                      #{formData.numberedTo ? ` /${formData.numberedTo}` : " NUMBERED"}
                    </span>
                  )}

                  {/* Physical Inventory Destination & Quota Status Badge */}
                  {(card.isBulk || card.triageCategory === "BULK" || card.binTier === "PURE_BULK" || (card.data as any)?.triageCategory === "BULK" || (card.data as any)?.isBulk) ? (
                    <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-xs font-mono font-bold text-rose-300 flex items-center gap-1">
                      📦 Bulk Outflow (Boxed to Get Rid Of • 0 Vault Slots)
                    </span>
                  ) : (card.triageCategory === "EBAY" || (card.data as any)?.triageCategory === "EBAY") ? (
                    <span className="rounded bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 text-xs font-mono font-bold text-cyan-300 flex items-center gap-1">
                      💻 eBay Singles • {card.ebayBinNumber || (card.data as any)?.ebayBinNumber || card.locationId || "Bin 1"} (Vaulted)
                    </span>
                  ) : (card.triageCategory === "GRADING" || (card.data as any)?.triageCategory === "GRADING") ? (
                    <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 flex items-center gap-1">
                      🏆 PSA Grading Candidate (Vaulted)
                    </span>
                  ) : (card.triageCategory === "DOLLAR_BIN" || (card.data as any)?.triageCategory === "DOLLAR_BIN" || card.binTier) ? (
                    <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-300 flex items-center gap-1">
                      🏷️ Dollar Bins • Unmetered Show Stock (0 Vault Slots)
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Prominent Sold Banner */}
              {card.isSold && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-purple-950/70 to-slate-900 border border-purple-500/40 text-xs font-mono shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500 text-white font-black text-[10px] tracking-wider uppercase shadow">
                      SOLD
                    </span>
                    <span className="text-slate-200">
                      Realized Sale:{" "}
                      <strong className="text-emerald-400 font-bold text-sm">
                        ${(card.soldPrice ?? 0).toFixed(2)}
                      </strong>
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      via {card.soldPlatform || "MARKETPLACE"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] flex-wrap">
                    {card.soldFees !== undefined && (
                      <span className="text-slate-400">
                        Fees: <span className="text-rose-300 font-semibold">${Number(card.soldFees).toFixed(2)}</span>
                      </span>
                    )}
                    {card.soldNetProfit !== undefined && (
                      <span className="text-slate-300">
                        Net Profit:{" "}
                        <strong className={card.soldNetProfit >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {card.soldNetProfit >= 0 ? "+" : ""}${Number(card.soldNetProfit).toFixed(2)}
                        </strong>
                      </span>
                    )}
                    {card.soldDate && (
                      <span className="text-slate-400">
                        {new Date(card.soldDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* AI Cost Telemetry Box */}
              {(card.aiUsage || card.data?.aiUsage) && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs font-mono shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
                      AI Identification Cost:
                    </span>
                    <strong className="text-white">
                      ${(card.aiUsage || card.data?.aiUsage)!.costUsd < 0.001
                        ? (card.aiUsage || card.data?.aiUsage)!.costUsd.toFixed(5)
                        : (card.aiUsage || card.data?.aiUsage)!.costUsd.toFixed(4)}
                    </strong>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap">
                    <span className="text-cyan-300 font-semibold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">
                      {(card.aiUsage || card.data?.aiUsage)!.model}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span>Prompt: {(card.aiUsage || card.data?.aiUsage)!.promptTokens} tok</span>
                    <span className="text-slate-500">•</span>
                    <span>Output: {(card.aiUsage || card.data?.aiUsage)!.outputTokens} tok</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">Total: {(card.aiUsage || card.data?.aiUsage)!.totalTokens} tok</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Prefix ID</span>
                  <span className="font-mono font-bold text-cyan-300 truncate block">{card.prefix}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Sport</span>
                  <span className="font-bold text-slate-200 block">{formData.sport || "N/A"}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Format / Grade</span>
                  <span className="font-bold text-slate-200 block">
                    {formData.condition === "Graded" ? `${formData.gradingCompany || ''} ${formData.grade || ''}`.trim() || "Graded" : "Raw"}
                  </span>
                </div>
                {getGateMode("barcodeSkuSequencing") !== "hidden" ? (
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono block">Location</span>
                    <span className="font-mono font-bold text-slate-200 truncate block">{formData.location || "Unassigned"}</span>
                  </div>
                ) : (
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono block">Vault Status</span>
                    <span className="font-mono font-bold text-emerald-400 truncate block">Personal Collection</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NEEDS CONFIRMATION BANNER FOR UNVERIFIED COLOR / PARALLEL */}
          {parallelEval.isPotentialNumbered && (
            <div className="rounded-2xl border-2 border-amber-500/80 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 p-4 space-y-3 shadow-xl ring-1 ring-amber-500/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
                    <AlertTriangle className="h-5 w-5 fill-amber-400/20" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-amber-300">
                        Needs Confirmation: Unverified Color / Parallel
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-mono font-black uppercase">
                        {parallelEval.detectedType || formData.subsetParallel || "Unverified"}
                      </span>
                    </div>
                    <p className="text-xs text-amber-200/90 font-mono mt-1">
                      {parallelEval.reason || "Special color or finish detected without confirmed serial number."} Comps may reflect unnumbered base sales until verified.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-amber-500/30">
                <button
                  type="button"
                  onClick={() => setIsVariationMatcherOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs font-mono transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                  title="Search eBay listings to match exact card variation"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Match from eBay Listing</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleChange("subsetParallel", "Base");
                    handleChange("isNumbered", false);
                    handleChange("numberedTo", "");
                    handleChange("serialVerified", true);
                    handleChange("isPossibleNumbered", false);
                    handleChange("isParallelOrColored", false);
                    handleChange("suspectedNumbered", false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-xs font-mono font-bold transition cursor-pointer active:scale-95"
                  title="Confirm this card is an unnumbered base card"
                >
                  Confirm as Base
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleChange("serialVerified", true);
                    handleChange("isPossibleNumbered", false);
                    handleChange("suspectedNumbered", false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/50 text-xs font-mono font-bold transition cursor-pointer active:scale-95"
                  title="Confirm current variation name and serial details are accurate"
                >
                  Confirm Variation
                </button>
              </div>
            </div>
          )}

          {/* SECTION: Master Collection Destination & Channel Routing (eBay, Grade, $Bins, Bulk) */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950/90 via-slate-900/60 to-slate-950/90 p-4 sm:p-5 space-y-4 shadow-xl relative overflow-hidden">
            {/* Top Glow Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 opacity-60" />

            {/* Header & System Pick Announcement */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-300 shadow-sm shrink-0">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-extrabold text-white tracking-tight">
                      Destination & Workflow Routing
                    </h4>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isPaidUser
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    }`}>
                      {isPaidUser ? "👑 Live Pipeline Sync Active" : "🏷️ Free Plan Inventory Tagging"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select where this card should go. The system automatically highlights the optimal destination based on comps and profitability.
                  </p>
                </div>
              </div>

              {/* Recommended Badge Highlight */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border shadow-md bg-gradient-to-r from-cyan-950/60 to-blue-950/40 border-cyan-500/40 text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span>
                    System Recommends: <strong className="text-white uppercase tracking-wider">{recommendedDestination.label}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Selectable Destination Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. eBay Singles */}
              {(() => {
                const isRec = recommendedDestination.destination === "EBAY";
                const isSel = userSelectedDestination === "EBAY";
                return (
                  <button
                    type="button"
                    onClick={() => handleDestinationSelect("EBAY")}
                    disabled={isRoutingLoading}
                    className={`relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer group ${
                      isSel
                        ? "border-indigo-400 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-indigo-900/30 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/50 -translate-y-0.5"
                        : isRec
                        ? "border-cyan-500/60 bg-slate-900/80 hover:bg-slate-900 hover:border-cyan-400 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/30"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`p-2 rounded-xl border ${
                        isSel
                          ? "bg-indigo-500/20 border-indigo-400 text-indigo-300"
                          : "bg-slate-800/80 border-slate-700 text-indigo-400 group-hover:text-indigo-300"
                      }`}>
                        <Tag className="h-4 w-4" />
                      </div>

                      <div className="flex items-center gap-1">
                        {isRec && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 animate-pulse">
                            <Sparkles className="h-2.5 w-2.5 text-cyan-400" /> AI Pick
                          </span>
                        )}
                        {isSel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-indigo-500 text-white shadow-sm">
                            <Check className="h-2.5 w-2.5" /> Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-white">eBay</span>
                        <span className="text-[11px] font-mono font-semibold text-indigo-300">($4+ Singles)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        List as raw single on eBay marketplace with comps & template.
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">Target Area:</span>
                      <span className="text-indigo-300 font-bold">eBay Singles Desk</span>
                    </div>
                  </button>
                );
              })()}

              {/* 2. PSA Grading */}
              {(() => {
                const isRec = recommendedDestination.destination === "GRADE";
                const isSel = userSelectedDestination === "GRADE";
                return (
                  <button
                    type="button"
                    onClick={() => handleDestinationSelect("GRADE")}
                    disabled={isRoutingLoading}
                    className={`relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer group ${
                      isSel
                        ? "border-purple-400 bg-gradient-to-br from-purple-950/80 via-slate-900 to-fuchsia-900/30 shadow-lg shadow-purple-500/20 ring-2 ring-purple-500/50 -translate-y-0.5"
                        : isRec
                        ? "border-purple-500/60 bg-slate-900/80 hover:bg-slate-900 hover:border-purple-400 shadow-md shadow-purple-500/10 ring-1 ring-purple-500/30"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`p-2 rounded-xl border ${
                        isSel
                          ? "bg-purple-500/20 border-purple-400 text-purple-300"
                          : "bg-slate-800/80 border-slate-700 text-purple-400 group-hover:text-purple-300"
                      }`}>
                        <Award className="h-4 w-4" />
                      </div>

                      <div className="flex items-center gap-1">
                        {isRec && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-purple-500/20 border border-purple-500/50 text-purple-300 animate-pulse">
                            <Sparkles className="h-2.5 w-2.5 text-purple-400" /> AI Pick
                          </span>
                        )}
                        {isSel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-purple-500 text-white shadow-sm">
                            <Check className="h-2.5 w-2.5" /> Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-white">Grade</span>
                        <span className="text-[11px] font-mono font-semibold text-purple-300">(PSA Pipeline)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Submit to PSA grading pipeline for profit arbitrage & submission prep.
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">Target Area:</span>
                      <span className="text-purple-300 font-bold">Grading Candidates</span>
                    </div>
                  </button>
                );
              })()}

              {/* 3. $Bins */}
              {(() => {
                const isRec = recommendedDestination.destination === "BINS";
                const isSel = userSelectedDestination === "BINS";
                return (
                  <button
                    type="button"
                    onClick={() => handleDestinationSelect("BINS")}
                    disabled={isRoutingLoading}
                    className={`relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer group ${
                      isSel
                        ? "border-amber-400 bg-gradient-to-br from-amber-950/80 via-slate-900 to-yellow-900/30 shadow-lg shadow-amber-500/20 ring-2 ring-amber-500/50 -translate-y-0.5"
                        : isRec
                        ? "border-amber-500/60 bg-slate-900/80 hover:bg-slate-900 hover:border-amber-400 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`p-2 rounded-xl border ${
                        isSel
                          ? "bg-amber-500/20 border-amber-400 text-amber-300"
                          : "bg-slate-800/80 border-slate-700 text-amber-400 group-hover:text-amber-300"
                      }`}>
                        <DollarSign className="h-4 w-4" />
                      </div>

                      <div className="flex items-center gap-1">
                        {isRec && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-amber-500/20 border border-amber-500/50 text-amber-300 animate-pulse">
                            <Sparkles className="h-2.5 w-2.5 text-amber-400" /> AI Pick
                          </span>
                        )}
                        {isSel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-amber-500 text-slate-950 shadow-sm">
                            <Check className="h-2.5 w-2.5" /> Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-white">&lt;$4 Bins</span>
                        <span className="text-[11px] font-mono font-semibold text-amber-300">(Value Bins)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Stock physical show value bins (&lt;$4) for fast cash sales.
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">Target Area:</span>
                      <span className="text-amber-300 font-bold">&lt;$4 Value Bins</span>
                    </div>
                  </button>
                );
              })()}

              {/* 4. Bulk */}
              {(() => {
                const isRec = recommendedDestination.destination === "BULK";
                const isSel = userSelectedDestination === "BULK";
                return (
                  <button
                    type="button"
                    onClick={() => handleDestinationSelect("BULK")}
                    disabled={isRoutingLoading}
                    className={`relative flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer group ${
                      isSel
                        ? "border-rose-400 bg-gradient-to-br from-rose-950/80 via-slate-900 to-slate-900 shadow-lg shadow-rose-500/20 ring-2 ring-rose-500/50 -translate-y-0.5"
                        : isRec
                        ? "border-slate-500/70 bg-slate-900/80 hover:bg-slate-900 hover:border-slate-400 shadow-md shadow-slate-500/10 ring-1 ring-slate-500/30"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className={`p-2 rounded-xl border ${
                        isSel
                          ? "bg-rose-500/20 border-rose-400 text-rose-300"
                          : "bg-slate-800/80 border-slate-700 text-slate-400 group-hover:text-slate-300"
                      }`}>
                        <Box className="h-4 w-4" />
                      </div>

                      <div className="flex items-center gap-1">
                        {isRec && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-slate-700 border border-slate-600 text-slate-200 animate-pulse">
                            <Sparkles className="h-2.5 w-2.5 text-slate-300" /> AI Pick
                          </span>
                        )}
                        {isSel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-rose-500 text-white shadow-sm">
                            <Check className="h-2.5 w-2.5" /> Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-white">Bulk</span>
                        <span className="text-[11px] font-mono font-semibold text-slate-400">(&lt;$1 Commons)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Sub-$1 commons & box lots priced to liquidate and purge.
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">Target Area:</span>
                      <span className="text-slate-300 font-bold">Bulk Outflow Box</span>
                    </div>
                  </button>
                );
              })()}
            </div>

            {/* Bottom Status / AI Explanation & Pipeline Jump Buttons */}
            <div className="space-y-2 pt-1 border-t border-slate-800/70">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                {/* AI Rationale */}
                <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px]">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>
                    <strong className="text-slate-200">System Rationale:</strong> {recommendedDestination.reason}
                  </span>
                </div>

                {/* Direct Tab Navigation Button for Paid Users */}
                {isPaidUser && userSelectedDestination && onNavigateToTab && (
                  <div className="flex items-center gap-2">
                    {userSelectedDestination === "EBAY" && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab("ebay")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-bold font-mono transition cursor-pointer active:scale-95"
                      >
                        <span>View in eBay Singles Desk</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {userSelectedDestination === "GRADE" && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab("grading")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold font-mono transition cursor-pointer active:scale-95"
                      >
                        <span>View in Grading Pipeline</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {userSelectedDestination === "BINS" && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab("bins")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 text-xs font-bold font-mono transition cursor-pointer active:scale-95"
                      >
                        <span>View in Show Bins Manager</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {userSelectedDestination === "BULK" && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab("bins")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold font-mono transition cursor-pointer active:scale-95"
                      >
                        <span>View in Bulk Outflow Manager</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Feedback Alert Banner */}
              {destinationActionFeedback && (
                <div className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between gap-2 animate-fade-in ${
                  destinationActionFeedback.type === "success"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : destinationActionFeedback.type === "info"
                    ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-300"
                    : "bg-rose-950/40 border-rose-500/40 text-rose-300"
                }`}>
                  <div className="flex items-center gap-2">
                    {destinationActionFeedback.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Tag className="h-4 w-4 text-cyan-400 shrink-0" />
                    )}
                    <span>{destinationActionFeedback.message}</span>
                  </div>

                  {!isPaidUser && (
                    <button
                      type="button"
                      onClick={() => openPaywall("Automatic inventory pipeline feeding into eBay, Grading, and Show Bins tabs is a Pro Dealer feature.", "PRO")}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-[11px] font-mono transition shrink-0 cursor-pointer active:scale-95 shadow"
                    >
                      ⚡ Upgrade to Auto-Feed
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SECTION B: Core CDP Identification Fields */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Tag className="h-4 w-4 text-cyan-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Core CDP Identification Fields
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              {/* Player Name */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Player Name</label>
                <input
                  type="text"
                  value={formData.playerName}
                  onChange={(e) => handleChange("playerName", e.target.value)}
                  placeholder="e.g. Ken Griffey Jr."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Sport Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Sport</label>
                <select
                  value={formData.sport}
                  onChange={(e) => handleChange("sport", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="Baseball">Baseball</option>
                  <option value="Basketball">Basketball</option>
                  <option value="Football">Football</option>
                  <option value="Soccer">Soccer</option>
                  <option value="Hockey">Hockey</option>
                  <option value="Pokemon">Pokemon</option>
                  <option value="One Piece">One Piece</option>
                  <option value="Racing">Racing</option>
                  <option value="Wrestling">Wrestling</option>
                  <option value="MMA">MMA</option>
                  {formData.sport && !["Baseball", "Basketball", "Football", "Soccer", "Hockey", "Pokemon", "One Piece", "Racing", "Wrestling", "MMA", "Other"].includes(formData.sport) && (
                    <option value={formData.sport}>{formData.sport}</option>
                  )}
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Release Year */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Release Year</label>
                <input
                  type="text"
                  value={formData.year || ""}
                  onChange={(e) => handleChange("year", e.target.value)}
                  placeholder="e.g. 2023 or 2023-24"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Brand</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={(e) => handleChange("brand", e.target.value)}
                  placeholder="e.g. Upper Deck, Topps, Panini, Bowman"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Set Name */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Set Name</label>
                <input
                  type="text"
                  value={formData.setName}
                  onChange={(e) => handleChange("setName", e.target.value)}
                  placeholder="e.g. 1991 Upper Deck, 2024-25 Bowman Chrome"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Card Number */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Card Number (No #)</label>
                <input
                  type="text"
                  value={formData.cardNumber}
                  onChange={(e) => handleChange("cardNumber", e.target.value)}
                  placeholder="e.g. 245 or BCV-166"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-cyan-300 font-mono focus:outline-none"
                />
              </div>

              {/* Subset / Parallel */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <span>Subset / Parallel Finish</span>
                    {parallelEval.isPotentialNumbered && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Needs Confirmation</span>
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsVariationMatcherOpen(true)}
                    className="text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition cursor-pointer"
                    title="Open eBay Variation Finder to match listing"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Match from eBay</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.subsetParallel}
                  onChange={(e) => handleChange("subsetParallel", e.target.value)}
                  placeholder="e.g. Base, Refractor, Silver Prizm"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Team */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Team Name</label>
                <input
                  type="text"
                  value={formData.team}
                  onChange={(e) => handleChange("team", e.target.value)}
                  placeholder="e.g. Los Angeles Dodgers, Atlanta Hawks"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION C: CDP Attribute Flags & Serial Numbering */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Award className="h-4 w-4 text-amber-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                CDP Attribute Flags & Serial Print Run
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
              {/* Rookie Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isRookie
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isRookie}
                  onChange={(e) => handleChange("isRookie", e.target.checked)}
                  className="rounded border-slate-800 accent-emerald-500 h-4 w-4"
                />
                <span>Rookie Card (RC)</span>
              </label>

              {/* Autograph Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isAutographed
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isAutographed}
                  onChange={(e) => handleChange("isAutographed", e.target.checked)}
                  className="rounded border-slate-800 accent-amber-500 h-4 w-4"
                />
                <span>Autograph (AUTO)</span>
              </label>

              {/* Memorabilia Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isMemorabilia
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isMemorabilia}
                  onChange={(e) => handleChange("isMemorabilia", e.target.checked)}
                  className="rounded border-slate-800 accent-indigo-500 h-4 w-4"
                />
                <span>Memorabilia (MEM)</span>
              </label>

              {/* Numbered Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isNumbered
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isNumbered}
                  onChange={(e) => handleChange("isNumbered", e.target.checked)}
                  className="rounded border-slate-800 accent-purple-500 h-4 w-4"
                />
                <span>Numbered Serial</span>
              </label>

              {/* Print Run / Serial Number Field */}
              <div>
                <input
                  type="text"
                  value={formData.numberedTo || ""}
                  onChange={(e) => handleChange("numberedTo", e.target.value)}
                  placeholder="Print Run (e.g. 99, 25, 1)"
                  disabled={!formData.isNumbered}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-xl p-2 text-xs font-mono text-purple-300 focus:outline-none"
                />
              </div>

              {/* Verified Variation / Serial Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.serialVerified
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={!!formData.serialVerified}
                  onChange={(e) => handleChange("serialVerified", e.target.checked)}
                  className="rounded border-slate-800 accent-amber-500 h-4 w-4"
                />
                <span>Verified Variation</span>
              </label>
            </div>
          </div>

          {/* SECTION D: Physical Condition & Storage Metadata */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Physical Condition & Storage Metadata
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {/* Condition / Grade Format Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Condition Format</label>
                <select
                  value={formData.condition || "Raw"}
                  onChange={(e) => handleChange("condition", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="Raw">Raw</option>
                  <option value="Graded">Graded</option>
                </select>
              </div>

              {/* Grading Company Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Grading Company</label>
                <select
                  value={formData.gradingCompany || "None"}
                  onChange={(e) => handleChange("gradingCompany", e.target.value)}
                  disabled={formData.condition !== "Graded"}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="None">None</option>
                  <option value="PSA">PSA</option>
                  <option value="BGS">BGS (Beckett)</option>
                  <option value="SGC">SGC</option>
                  <option value="CGC">CGC</option>
                </select>
              </div>

              {/* Grade Value */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Grade Value</label>
                <input
                  type="text"
                  value={formData.grade || ""}
                  onChange={(e) => handleChange("grade", e.target.value)}
                  placeholder="e.g. 10, 9.5, 9"
                  disabled={formData.condition !== "Graded"}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              {/* Location / Bin ID (Warehouse / Dealer Gated) */}
              {getGateMode("barcodeSkuSequencing") !== "hidden" && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-cyan-400" /> Location / Bin ID
                  </label>
                  <input
                    type="text"
                    value={formData.location || ""}
                    onChange={(e) => handleChange("location", e.target.value)}
                    placeholder="e.g. Box 1, Bin A"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                  />
                </div>
              )}

              {/* Applied Card Value ($) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Current Value / Comps ($)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.estimatedValue !== undefined ? formData.estimatedValue : ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleChange("estimatedValue", isNaN(val) ? undefined : val);
                    handleChange("valueLastUpdated", new Date().toISOString());
                    handleChange("lastPriceRefreshedAt", new Date().toISOString());
                    handleChange("lastCompDate", new Date().toISOString());
                  }}
                  placeholder="e.g. 1.47"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg p-2 text-emerald-300 font-mono font-bold focus:outline-none"
                />
              </div>

              {/* Purchase Price ($) / Cost Basis */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-cyan-400" /> Bought For / Cost Basis ($)
                  </span>
                  {formData.purchasePrice !== undefined && formData.purchasePrice > 0 && formData.estimatedValue !== undefined && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      formData.estimatedValue >= formData.purchasePrice
                        ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                        : "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                    }`}>
                      {formData.estimatedValue >= formData.purchasePrice ? "+" : ""}$
                      {(formData.estimatedValue - formData.purchasePrice).toFixed(2)} (
                      {formData.purchasePrice > 0
                        ? `${(((formData.estimatedValue - formData.purchasePrice) / formData.purchasePrice) * 100).toFixed(1)}%`
                        : "0%"} ROI)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice !== undefined ? formData.purchasePrice : ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleChange("purchasePrice", isNaN(val) ? undefined : val);
                  }}
                  placeholder="e.g. 0.50"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-cyan-300 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>

            {/* If card is already sold: Show comprehensive sold metrics summary */}
            {card.isSold && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-mono font-black">
                    ✓ MARKED AS SOLD
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {card.soldDate ? new Date(card.soldDate).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-purple-500/20">
                    <span className="text-[10px] text-slate-400 block">Sold Price</span>
                    <span className="font-bold text-emerald-400 text-sm">${(card.soldPrice ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-purple-500/20">
                    <span className="text-[10px] text-slate-400 block">Platform</span>
                    <span className="font-bold text-slate-200">{card.soldPlatform || "OTHER"}</span>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-purple-500/20">
                    <span className="text-[10px] text-slate-400 block">Platform Fees</span>
                    <span className="font-bold text-rose-300">${(card.soldFees ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-purple-500/20">
                    <span className="text-[10px] text-slate-400 block">Realized Profit</span>
                    <span className={`font-bold ${(card.soldNetProfit ?? 0) >= 0 ? "text-emerald-400 text-sm" : "text-rose-400 text-sm"}`}>
                      {(card.soldNetProfit ?? 0) >= 0 ? "+" : ""}${Number(card.soldNetProfit ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* If card is not sold: Action button to record sale and toggle sale drawer */}
            {!card.isSold && onMarkCardAsSold && (
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                {!showSoldForm ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div>
                      <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                        <BadgeDollarSign className="h-4 w-4 text-purple-400" /> Mark as Sold & Track Realized Profit
                      </h5>
                      <p className="text-[11px] text-slate-400">
                        Record final sale price, platform, and fees to lock in your realized gains.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSoldForm(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark as Sold
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-purple-500/40 bg-purple-950/20 p-4 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-mono">
                          Record Card Sale
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSoldForm(false)}
                        className="text-slate-400 hover:text-white text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Final Sale Price ($) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={soldPriceInput}
                          onChange={(e) => setSoldPriceInput(e.target.value)}
                          placeholder="e.g. 15.00"
                          className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg p-2 text-emerald-300 font-mono font-bold focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Sales Channel / Platform</label>
                        <select
                          value={soldPlatformInput}
                          onChange={(e) => setSoldPlatformInput(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none"
                        >
                          <option value="EBAY">eBay Marketplace</option>
                          <option value="SHOP">Card Shop / Physical Store</option>
                          <option value="VENDOR_TABLE">Card Show / Vendor Table</option>
                          <option value="CASH">Cash / Private Sale</option>
                          <option value="OTHER">Other Marketplace</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Selling / Shipping Fees ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={soldFeesInput}
                          onChange={(e) => setSoldFeesInput(e.target.value)}
                          placeholder="e.g. 1.85"
                          className="w-full bg-slate-950 border border-slate-700 focus:border-slate-500 rounded-lg p-2 text-slate-200 font-mono focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Sale Date</label>
                        <input
                          type="date"
                          value={soldDateInput}
                          onChange={(e) => setSoldDateInput(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-slate-500 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Live Projected Profit Calculation */}
                    {parseFloat(soldPriceInput) > 0 && (
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Projected Net Profit:</span>
                        {(() => {
                          const sp = parseFloat(soldPriceInput) || 0;
                          const fees = parseFloat(soldFeesInput) || 0;
                          const cost = formData.purchasePrice ?? card.purchasePrice ?? 0;
                          const net = sp - fees - cost;
                          return (
                            <span className={`font-bold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {net >= 0 ? "+" : ""}${net.toFixed(2)}{" "}
                              <span className="text-[10px] text-slate-400">
                                ({cost > 0 ? `${((net / cost) * 100).toFixed(1)}% ROI` : "No cost basis"})
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowSoldForm(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isMarkingSold || !soldPriceInput || parseFloat(soldPriceInput) < 0}
                        onClick={() => handleConfirmMarkAsSold()}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow transition disabled:opacity-50 cursor-pointer"
                      >
                        {isMarkingSold ? "Saving..." : "✓ Confirm & Mark as Sold"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION E: Real-Time eBay Market Sold Comps */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-col gap-3 border-b border-slate-800 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    eBay Market Sales Comps
                  </h4>
                  {compsResult?.compIsBaseEstimate && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
                      ⚠️ Base Card Estimate
                    </span>
                  )}
                  {compsResult?.matchedStage && compsResult.matchedStage !== "none" && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-mono">
                      Stage: {compsResult.matchedStage === "strict" ? "Exact Match" : compsResult.matchedStage === "drop_number" ? "Title Only" : "Base Fallback"}
                    </span>
                  )}
                </div>

                {customCompsQuery.trim() && (
                  <a
                    href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(customCompsQuery)}&LH_Complete=1&LH_Sold=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-xs font-semibold transition active:scale-95 self-start sm:self-auto"
                    title="Open live completed search directly on eBay"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>View on eBay</span>
                  </a>
                )}
              </div>

              {/* Editable Search Query Input Box Directly next to Re-run Comps button */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400 shrink-0">
                  <Search className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Search Query:</span>
                </div>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={customCompsQuery}
                    onChange={(e) => setCustomCompsQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (customCompsQuery.trim() && !isFetchingComps) {
                          handleFetchComps("raw");
                        }
                      }
                    }}
                    placeholder="Search query (e.g. 2020 Prizm Anthony Edwards 258)..."
                    className="w-full pl-3 pr-7 py-1.5 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg text-xs font-mono text-slate-100 focus:outline-none"
                  />
                  {customCompsQuery && (
                    <button
                      type="button"
                      onClick={() => setCustomCompsQuery("")}
                      className="absolute right-2 top-2 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                      title="Clear query"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFetchComps("raw")}
                    disabled={isFetchingComps || !customCompsQuery.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                    title="Re-run market comps with this query"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetchingComps && compsTab === "raw" ? "animate-spin" : ""}`} />
                    <span>{isFetchingComps && compsTab === "raw" ? "Fetching..." : "Re-run Comps"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFetchComps("psa10")}
                    disabled={isFetchingComps || !customCompsQuery.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                    title="Audit PSA 10 & 9 graded ROI"
                  >
                    <Award className={`h-3.5 w-3.5 text-white ${isFetchingComps && compsTab !== "raw" ? "animate-spin" : ""}`} />
                    <span>{isFetchingComps && compsTab !== "raw" ? "Auditing..." : "Grade Audit"}</span>
                  </button>
                </div>
              </div>

              {/* Auto-Adjusted Title Notification Banner */}
              {compsResult?.autoAdjusted && (
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/40 p-2.5 text-xs font-mono text-cyan-200 flex items-center justify-between gap-3 shadow-md flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 animate-pulse" />
                    <span>
                      <strong>⚡ Auto-Adjusted Title:</strong> {compsResult.adjustmentReason || "Title adjusted"} to find {compsResult.totalFound || compsResult.activeListings?.length || 0} active comps!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const exact = sanitizeCompQuery(formData);
                      setCustomCompsQuery(exact);
                      handleFetchComps("raw", exact);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-cyan-300 border border-cyan-800 transition active:scale-95 cursor-pointer"
                    title="Reset search to full exact card title and re-run"
                  >
                    Reset to Exact Title
                  </button>
                </div>
              )}

              {/* Quick Query Waterfall & Auto-Adjust Suggestions */}
              {(() => {
                const queryWaterfall = generateWaterfallQueries(formData);
                const handleApplyQuickQuery = (newQuery: string) => {
                  setCustomCompsQuery(newQuery);
                  handleFetchComps("raw", newQuery);
                };

                return (
                  <div className="flex items-center gap-1.5 flex-wrap px-1 text-[11px] font-mono">
                    <span className="text-slate-400 font-bold flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      <span>Adjust Title:</span>
                    </span>
                    {queryWaterfall.strictQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.strictQuery)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.strictQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Search exact full title with card number, year, set, and serial"
                      >
                        Exact
                      </button>
                    )}
                    {queryWaterfall.dropNumberQuery && queryWaterfall.dropNumberQuery !== queryWaterfall.strictQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.dropNumberQuery)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.dropNumberQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Drop card number (e.g. #HM-AI) to find listings without card number"
                      >
                        Drop Card #
                      </button>
                    )}
                    {queryWaterfall.dropSerialQuery && queryWaterfall.dropSerialQuery !== queryWaterfall.strictQuery && queryWaterfall.dropSerialQuery !== queryWaterfall.dropNumberQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.dropSerialQuery!)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.dropSerialQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Drop serial denominator (/5) to find unnumbered or different print runs"
                      >
                        Drop Serial #
                      </button>
                    )}
                    {queryWaterfall.dropYearQuery && queryWaterfall.dropYearQuery !== queryWaterfall.strictQuery && queryWaterfall.dropYearQuery !== queryWaterfall.dropNumberQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.dropYearQuery!)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.dropYearQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Drop release year to handle season format differences"
                      >
                        Drop Year
                      </button>
                    )}
                    {queryWaterfall.dropSetNameQuery && queryWaterfall.dropSetNameQuery !== queryWaterfall.strictQuery && queryWaterfall.dropSetNameQuery !== queryWaterfall.dropNumberQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.dropSetNameQuery!)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.dropSetNameQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Drop verbose set name to match simplified listings"
                      >
                        Drop Set Name
                      </button>
                    )}
                    {queryWaterfall.playerParallelQuery && (
                      <button
                        type="button"
                        onClick={() => handleApplyQuickQuery(queryWaterfall.playerParallelQuery!)}
                        className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 ${
                          customCompsQuery === queryWaterfall.playerParallelQuery
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                        title="Search player name and insert/parallel only"
                      >
                        Player + Insert
                      </button>
                    )}
                    {(() => {
                      const autoAll = queryWaterfall.autoAdjustTiers.find((t) => t.id === "auto_adjust_all")?.query;
                      if (!autoAll || autoAll === queryWaterfall.strictQuery || autoAll === queryWaterfall.dropNumberQuery) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => handleApplyQuickQuery(autoAll)}
                          className={`px-2 py-0.5 rounded border transition cursor-pointer active:scale-95 font-bold ${
                            customCompsQuery === autoAll
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                          }`}
                          title="Auto-adjust: Drop card #, serial #, year, and set name to find active comps"
                        >
                          ⚡ Auto-Adjust All
                        </button>
                      );
                    })()}
                    {compsResult?.matchedStage && compsResult.matchedStage !== "none" && (
                      <span className="ml-auto text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-700/60 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                        {compsResult.autoAdjusted && <Sparkles className="h-2.5 w-2.5 text-cyan-400" />}
                        <span>
                          Matched via: {
                            compsResult.matchedStage === "strict" ? "Exact Query" :
                            compsResult.matchedStage === "drop_number" ? "Dropped Card #" :
                            compsResult.matchedStage === "drop_serial" ? "Dropped Serial #" :
                            compsResult.matchedStage === "drop_year" ? "Dropped Year" :
                            compsResult.matchedStage === "drop_set_name" ? "Dropped Set Name" :
                            compsResult.matchedStage === "player_parallel" ? "Player + Insert" :
                            compsResult.matchedStage === "short_parallel" ? "Core Parallel" :
                            compsResult.matchedStage === "season_year" ? "Season Start Year" :
                            compsResult.matchedStage === "vague" ? "Vague / Broad" :
                            compsResult.matchedStage === "base_fallback" ? "Base Fallback" :
                            compsResult.matchedStage
                          }
                        </span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Fallback Banner if Base Card Estimate */}
            {compsResult?.compIsBaseEstimate && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-mono text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  <strong>⚠️ Base Card Estimate:</strong> Parallel sales were not found on eBay. Pricing shown reflects base card sales comps.
                </span>
              </div>
            )}

            {/* Zero Comps Found Notice with Auto-Adjust Action Options */}
            {compsResult && compsResult.totalFound === 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-slate-900/90 p-3 text-xs font-mono text-slate-200 flex flex-col gap-2.5 shadow-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>
                    No active comps pulled up for <strong>&quot;{customCompsQuery}&quot;</strong>. Auto-adjust search title:
                  </span>
                </div>
                {(() => {
                  const waterfall = generateWaterfallQueries(formData);
                  return (
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-800">
                      {waterfall.autoAdjustTiers.map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => {
                            setCustomCompsQuery(tier.query);
                            handleFetchComps("raw", tier.query);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 text-[11px] font-mono font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
                          title={tier.description}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>{tier.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Error Message */}
            {compsError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-mono text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{compsError}</span>
              </div>
            )}

            {/* In-Flight Fetching State */}
            {isFetchingComps && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-6 flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
                <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
                <div>
                  <h5 className="text-sm font-bold text-slate-100 font-mono">Fetching Real-Time eBay Market Comps...</h5>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Searching for: &ldquo;{customCompsQuery}&rdquo;</p>
                </div>
              </div>
            )}

            {/* Comps Summary Cards & Results */}
            {compsResult && (
              <div className="space-y-4">
                {/* Comps Category Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCompsTab("raw")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 ${
                      compsTab === "raw"
                        ? "bg-slate-800 text-emerald-400 border border-emerald-500/40 shadow shadow-emerald-500/10"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📦 Raw Comps ({compsResult.recentSales?.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompsTab("psa10")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 ${
                      compsTab === "psa10"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow shadow-amber-500/10"
                        : "text-slate-400 hover:text-amber-300"
                    }`}
                  >
                    💎 PSA 10 Comps ({compsResult.psa10Sales?.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompsTab("psa9")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 ${
                      compsTab === "psa9"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow shadow-cyan-500/10"
                        : "text-slate-400 hover:text-cyan-300"
                    }`}
                  >
                    🛡️ PSA 9 Comps ({compsResult.psa9Sales?.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompsTab("psa8")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 ${
                      compsTab === "psa8"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow shadow-purple-500/10"
                        : "text-slate-400 hover:text-purple-300"
                    }`}
                  >
                    ⚡ PSA 8 Comps ({compsResult.psa8Sales?.length || 0})
                  </button>
                </div>

                {/* TAB 1: RAW COMPS */}
                {compsTab === "raw" && (
                  <div className="space-y-4">
                    {/* Valuation & Confidence Tier Banner */}
                    {compsResult.valuation && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 ${
                              compsResult.valuation.confidenceTier === "HIGH"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : compsResult.valuation.confidenceTier === "MEDIUM"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            {compsResult.valuation.confidenceTier === "HIGH"
                              ? "🟢 High Confidence"
                              : compsResult.valuation.confidenceTier === "MEDIUM"
                              ? "🟡 Moderate Confidence"
                              : "⚪ Low Confidence"}
                          </span>
                          <span className="text-xs font-mono text-slate-300">
                            {compsResult.valuation.confidenceReason}
                          </span>
                        </div>
                        {compsResult.valuation.lowestActivePrice !== undefined && (
                          <div className="text-[11px] font-mono text-slate-400 shrink-0">
                            Active Floor:{" "}
                            <strong className="text-emerald-400 font-mono">
                              ${compsResult.valuation.lowestActivePrice.toFixed(2)}
                            </strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats Header Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Estimated Fair Market Value */}
                      <div className="bg-gradient-to-br from-cyan-950/80 to-slate-900 p-3 rounded-xl border border-cyan-500/30 flex flex-col justify-between space-y-2">
                        <div>
                          <span className="text-[10px] text-cyan-300 font-mono font-bold uppercase block tracking-wider">
                            Est. Fair Value (FMV)
                          </span>
                          <span className="text-xl font-black text-emerald-400 font-mono">
                            ${(compsResult.valuation?.estimatedValue ?? compsResult.estimatedMarketValue).toFixed(2)}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-mono">Time-Decayed & Floor Protected</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyEstValue(compsResult.valuation?.estimatedValue ?? compsResult.estimatedMarketValue)}
                          className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono font-bold transition flex items-center justify-center gap-1 shadow active:scale-95"
                        >
                          {appliedValueSuccess ? <Check className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                          {appliedValueSuccess ? "✓ Value Applied!" : `Apply $${(compsResult.valuation?.estimatedValue ?? compsResult.estimatedMarketValue).toFixed(2)} to Card`}
                        </button>
                      </div>

                      {/* Lowest Active Floor */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Active Floor Price</span>
                        <span className="text-lg font-black text-cyan-300 font-mono">
                          {compsResult.valuation?.lowestActivePrice !== undefined
                            ? `$${compsResult.valuation.lowestActivePrice.toFixed(2)}`
                            : compsResult.minPrice > 0 ? `$${compsResult.minPrice.toFixed(2)}` : "N/A"}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">Buy-It-Now Ceiling Cap</span>
                      </div>

                      {/* 30-Day Sales Volume */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">30-Day Sales Velocity</span>
                        <span className="text-sm font-black text-slate-200 font-mono block mt-1">
                          {compsResult.valuation?.soldCount30Days ?? compsResult.soldComps?.length ?? compsResult.recentSales?.length ?? 0} Analyzed Comps
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          {compsResult.valuation?.daysSinceLastSale !== undefined
                            ? `Last sold ${compsResult.valuation.daysSinceLastSale}d ago`
                            : "No recent sales date"}
                        </span>
                      </div>

                      {/* Sample & Dual Channels */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Dual Market Stream</span>
                        <span className="text-xs font-mono font-bold text-slate-200 block mt-1">
                          {(compsResult.soldComps && compsResult.soldComps.length > 0 ? compsResult.soldComps.length : (compsResult.recentSales?.length || 0))} Comps / {(compsResult.activeListings && compsResult.activeListings.length > 0 ? compsResult.activeListings.length : (compsResult.recentSales?.length || 0))} Active
                        </span>
                        {compsResult.outlierCount > 0 ? (
                          <span className="text-[9px] text-amber-400 font-mono font-bold block mt-0.5">
                            ⚡ {compsResult.outlierCount} Filtered Mismatches
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-400 font-mono block mt-0.5">
                            ✓ Clean Strict Matches
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Variation Update Notice Banner */}
                    {appliedVariationNotice && (
                      <div className="p-3 bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-between text-xs font-mono font-bold text-emerald-300 animate-fade-in shadow-md">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span>{appliedVariationNotice}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAppliedVariationNotice(null)}
                          className="text-slate-400 hover:text-white p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Variation Helper Banner */}
                    <div className="p-2.5 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                        <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
                        <span>Spot your card below? Click on any matching eBay listing to automatically update your card details & price!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsVariationMatcherOpen(true)}
                        className="px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Search className="h-3 w-3" />
                        <span>Open Variation Finder</span>
                      </button>
                    </div>

                    {/* Dual Stream Sub-Tab Selector & Format Filter */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRawSubTab("sold")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            rawSubTab === "sold"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow shadow-emerald-500/10"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          ⚡ Market Comps ({compsResult.soldComps?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRawSubTab("active")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            rawSubTab === "active"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow shadow-cyan-500/10"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          🛒 Active Supply ({compsResult.activeListings?.length || 0})
                        </button>
                      </div>

                      {/* Format Filter Bar (All / Buy It Now / Auctions) */}
                      <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setFormatFilter("ALL")}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                            formatFilter === "ALL"
                              ? "bg-slate-700 text-white shadow-xs"
                              : "text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          All Formats
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormatFilter("FIXED_PRICE")}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                            formatFilter === "FIXED_PRICE"
                              ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 shadow-xs"
                              : "text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          🏷️ Buy It Now
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormatFilter("AUCTION")}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                            formatFilter === "AUCTION"
                              ? "bg-purple-500/30 text-purple-300 border border-purple-500/40 shadow-xs"
                              : "text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          🔨 Auctions
                        </button>
                      </div>
                    </div>

                    {/* Active vs Sold Items Render */}
                    {(() => {
                      const baseList =
                        rawSubTab === "sold"
                          ? (compsResult.soldComps || [])
                          : (compsResult.activeListings || compsResult.recentSales || []);

                      const listToDisplay = baseList.filter((item) => {
                        if (formatFilter === "ALL") return true;
                        if (!item.buyingFormat) return true;
                        return item.buyingFormat === formatFilter;
                      });

                      if (baseList.length === 0) {
                        return (
                          <div className="text-center py-6 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                            <p className="text-xs text-slate-300 font-mono font-bold">
                              {rawSubTab === "sold"
                                ? "No verified sold transactions found from completed listings."
                                : "No active market supply listings currently open."}
                            </p>
                            {rawSubTab === "sold" && (compsResult.activeListings?.length || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => setRawSubTab("active")}
                                className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold hover:bg-cyan-500/30 transition cursor-pointer"
                              >
                                View {compsResult.activeListings?.length} Active Supply Listings Instead →
                              </button>
                            )}
                            <p className="text-[11px] text-slate-500 font-mono">
                              Try refining your search keywords above or select one of the suggested query variations.
                            </p>
                          </div>
                        );
                      }

                      if (listToDisplay.length === 0) {
                        return (
                          <div className="text-center py-6 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-1">
                            <p className="text-xs text-slate-300 font-mono font-bold">
                              No {formatFilter === "AUCTION" ? "auction" : "Buy It Now"} listings match the current filter.
                            </p>
                            <button
                              type="button"
                              onClick={() => setFormatFilter("ALL")}
                              className="text-[11px] text-cyan-400 hover:underline font-mono cursor-pointer"
                            >
                              Show all {baseList.length} comps
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                              {rawSubTab === "sold" ? "Recently Sold Market Comps" : "Active Competitor Listings"} ({listToDisplay.length})
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {rawSubTab === "sold" ? "Sorted by end time" : "Real-time supply"}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {listToDisplay.map((sale, idx) => {
                              const analysis = extractVariationFromListingTitle(sale.title, formData);
                              const isVariationMatch =
                                Boolean(formData.subsetParallel) &&
                                analysis.variation.toLowerCase() === (formData.subsetParallel || "").toLowerCase();
                              const isPriceMatch =
                                sale.price > 0 &&
                                Boolean(formData.estimatedValue) &&
                                Math.abs((formData.estimatedValue || 0) - sale.price) < 0.01;
                              const isExactListingMatch = isVariationMatch && isPriceMatch;

                              return (
                                <div
                                  key={idx}
                                  onClick={() => handleApplyVariationFromListing(sale)}
                                  className={`flex flex-col justify-between bg-slate-900 border p-3 rounded-2xl transition cursor-pointer select-none group relative ${
                                    isExactListingMatch
                                      ? "border-emerald-500/80 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/50"
                                      : sale.isOutlier
                                      ? "border-amber-500/40 bg-amber-500/5 opacity-80 hover:border-amber-400 hover:bg-slate-850"
                                      : "border-slate-800/80 hover:border-cyan-500/60 hover:bg-slate-850"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="h-14 w-14 shrink-0 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                                      {sale.imageUrl ? (
                                        <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                      ) : (
                                        <DollarSign className="h-5 w-5 text-slate-600" />
                                      )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      {/* Extracted variation chip */}
                                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        <span
                                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                            isExactListingMatch
                                              ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black"
                                              : analysis.category === "REFRACTOR"
                                              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                              : analysis.category === "PRIZM"
                                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                              : analysis.variation !== "Base"
                                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                              : "bg-slate-800 text-slate-400 border-slate-700"
                                          }`}
                                        >
                                          <Sparkles className="h-2.5 w-2.5" />
                                          <span>{analysis.variation}</span>
                                        </span>
                                        {analysis.isNumbered && analysis.numberedTo && (
                                          <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-amber-400 text-slate-950">
                                            /{analysis.numberedTo}
                                          </span>
                                        )}
                                        {isExactListingMatch && (
                                          <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                            ✓ Matched Comp
                                          </span>
                                        )}
                                        {sale.isOutlier && (
                                          <span
                                            className="rounded bg-amber-500/20 border border-amber-500/40 px-1 py-0.5 text-[9px] font-mono font-bold text-amber-300"
                                            title={sale.outlierReason || "Outlier Excluded"}
                                          >
                                            ⚡ {sale.outlierReason || "Outlier"}
                                          </span>
                                        )}
                                      </div>

                                      <h5 className="text-xs font-semibold text-slate-200 line-clamp-2" title={sale.title}>
                                        {sale.title}
                                      </h5>

                                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span
                                          className={`text-xs font-mono font-black ${
                                            isExactListingMatch
                                              ? "text-emerald-300"
                                              : sale.isOutlier
                                              ? "text-amber-300"
                                              : rawSubTab === "sold"
                                              ? "text-emerald-400"
                                              : "text-cyan-400"
                                          }`}
                                        >
                                          ${sale.price.toFixed(2)} {sale.currency}
                                        </span>

                                        {rawSubTab === "sold" ? (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                            ✓ Sold
                                          </span>
                                        ) : (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                            🛒 Active Asking
                                          </span>
                                        )}

                                        {sale.soldDate && (
                                          <span className="text-[9px] text-slate-400 font-mono">
                                            {new Date(sale.soldDate).toLocaleDateString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                              year: "numeric",
                                            })}
                                          </span>
                                        )}

                                        {sale.buyingFormat && (
                                          <span
                                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 ${
                                              sale.buyingFormat === "AUCTION"
                                                ? "bg-purple-900/40 text-purple-300 border border-purple-700/50"
                                                : "bg-slate-800 text-slate-400 border border-slate-700/50"
                                            }`}
                                          >
                                            {sale.buyingFormat === "AUCTION" ? (
                                              <>
                                                <span>🔨 {rawSubTab === "sold" ? "Auction Sale" : "Live Auction"}</span>
                                                {sale.bidCount !== undefined && (
                                                  <span className="text-purple-200">({sale.bidCount})</span>
                                                )}
                                              </>
                                            ) : (
                                              <span>🏷️ {rawSubTab === "sold" ? "BIN Sale" : "Buy It Now"}</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action row: Match Variation & External Link */}
                                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApplyVariationFromListing(sale);
                                      }}
                                      title={
                                        isExactListingMatch
                                          ? `Currently applied to card: $${sale.price.toFixed(2)} ("${analysis.variation}")`
                                          : `Apply value $${sale.price.toFixed(2)} and update card details (year, set name, variation, serial #, RC) to match listing`
                                      }
                                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-[10px] font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                                        isExactListingMatch
                                          ? "bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md border border-emerald-400 ring-2 ring-emerald-400/40"
                                          : "bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/40 active:scale-95"
                                      }`}
                                    >
                                      {isExactListingMatch ? (
                                        <>
                                          <Check className="h-3.5 w-3.5 text-white" />
                                          <span>✓ Applied to Card: ${sale.price.toFixed(2)} ({analysis.variation})</span>
                                        </>
                                      ) : (
                                        <>
                                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                                          <span>
                                            Apply ${sale.price.toFixed(2)} & Details ({analysis.variation})
                                          </span>
                                        </>
                                      )}
                                    </button>

                                    {Boolean(sale.itemWebUrl || sale.title) && (
                                      <a
                                        href={
                                          sale.itemWebUrl ||
                                          `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(sale.title)}${
                                            rawSubTab === "sold" ? "&LH_Complete=1&LH_Sold=1" : ""
                                          }`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-cyan-600 text-slate-400 hover:text-white transition shrink-0"
                                        title={rawSubTab === "sold" ? "View Sold Listing on eBay" : "View Live Listing on eBay"}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TAB 2: PSA 10 GRADED COMPS */}
                {compsTab === "psa10" && (
                  <div className="space-y-4">
                    {/* TRAFFIC-LIGHT RECOMMENDATION BANNER */}
                    <div className={`p-4 rounded-2xl border transition-all duration-200 shadow-md ${
                      cardTier === "do_it"
                        ? "bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900/90 border-emerald-500/50 shadow-emerald-500/10"
                        : cardTier === "maybe"
                        ? "bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900/90 border-amber-500/50 shadow-amber-500/10"
                        : "bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-900/90 border-rose-500/50 shadow-rose-500/10"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black tracking-wider uppercase flex items-center gap-1.5 shadow ${
                            cardTier === "do_it"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : cardTier === "maybe"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}>
                            {cardTier === "do_it" && "🟢 RECOMMENDATION: DO IT"}
                            {cardTier === "maybe" && "🟡 RECOMMENDATION: MAYBE"}
                            {cardTier === "dont_do_it" && "🔴 RECOMMENDATION: DON'T DO IT"}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Scenario: <strong className="text-slate-200 uppercase font-bold">{activeTargetGrade === "psa8" ? "⚡ PSA 8 Conservative" : activeTargetGrade === "psa9" ? "🛡️ PSA 9 Baseline" : activeTargetGrade === "psa10" ? "⭐ PSA 10 Ceiling" : "⚖️ Balanced"}</strong>
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400">
                          Breakeven: <strong className="text-slate-200">${totalBreakeven.toFixed(2)}</strong>
                          <span className="text-[10px] text-slate-500 ml-1">(Raw ${rawMarketVal.toFixed(2)} + Fee ${gradingFee.toFixed(2)})</span>
                        </div>
                      </div>

                      {/* Side-by-side PSA 10 vs PSA 9 vs PSA 8 summary with Dynamic Feature Gating */}
                      <FeatureGate
                        feature="gradingArbitrageMatrix"
                        targetPlan="STARTER"
                        customLockedTitle="Unlock PSA 10 & 9 Arbitrage Projections"
                        customBlurredDescription="Reveals exact PSA 10, 9 & 8 market projections, grading ROI percentages, and net profit margins."
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2.5">
                          <div className={`p-2.5 rounded-xl border ${
                            activeTargetGrade === "psa10" ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30" : "bg-slate-900/80 border-slate-800"
                          }`}>
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-amber-300 flex items-center gap-1">
                                💎 PSA 10 {activeTargetGrade === "psa10" && <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 rounded font-bold">TARGET</span>}
                              </span>
                              <span className="font-black text-amber-400 font-mono text-sm">${currentP10.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                              <span className="text-slate-400">Net Profit / ROI:</span>
                              <span className={`font-bold ${netP10 >= minProfitTarget ? "text-emerald-400" : netP10 > 0 ? "text-amber-300" : "text-rose-400"}`}>
                                {netP10 > 0 ? "+" : ""}${netP10.toFixed(2)} ({roiP10 > 0 ? "+" : ""}{roiP10.toFixed(1)}%)
                              </span>
                            </div>
                          </div>

                          <div className={`p-2.5 rounded-xl border ${
                            activeTargetGrade === "psa9" ? "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30" : "bg-slate-900/80 border-slate-800"
                          }`}>
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-cyan-300 flex items-center gap-1">
                                🛡️ PSA 9 {activeTargetGrade === "psa9" && <span className="text-[9px] bg-cyan-500/30 text-cyan-200 px-1 rounded font-bold">TARGET</span>}
                              </span>
                              <span className="font-black text-cyan-400 font-mono text-xs">${currentP9.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                              <span className="text-slate-400">Net Profit / ROI:</span>
                              <span className={`font-bold ${netP9 >= minProfitTarget ? "text-emerald-400" : netP9 >= 0 ? "text-cyan-300" : "text-rose-400"}`}>
                                {netP9 > 0 ? "+" : ""}${netP9.toFixed(2)} ({roiP9 > 0 ? "+" : ""}{roiP9.toFixed(1)}%)
                              </span>
                            </div>
                          </div>

                          <div className={`p-2.5 rounded-xl border ${
                            activeTargetGrade === "psa8" ? "bg-purple-500/10 border-purple-500/40 ring-1 ring-purple-500/30" : "bg-slate-900/80 border-slate-800"
                          }`}>
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-purple-300 flex items-center gap-1">
                                ⚡ PSA 8 {activeTargetGrade === "psa8" && <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1 rounded font-bold">TARGET</span>}
                              </span>
                              <span className="font-black text-purple-400 font-mono text-xs">${currentP8.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                              <span className="text-slate-400">Net Profit / ROI:</span>
                              <span className={`font-bold ${netP8 >= minProfitTarget ? "text-emerald-400" : netP8 >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                                {netP8 > 0 ? "+" : ""}${netP8.toFixed(2)} ({roiP8 > 0 ? "+" : ""}{roiP8.toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </FeatureGate>
                    </div>

                    {/* Graded PSA 10 Metric Header */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* PSA 10 Valuation */}
                      <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 p-3 rounded-xl border border-amber-500/40 flex flex-col justify-between space-y-2">
                        <div>
                          <span className="text-[10px] text-amber-300 font-mono font-bold uppercase block tracking-wider">
                            💎 Est. PSA 10 Value
                          </span>
                          <span className="text-xl font-black text-amber-400 font-mono">
                            {compsResult.psa10Value ? `$${compsResult.psa10Value.toFixed(2)}` : "N/A"}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-mono">Verified Gem Mint Grade</span>
                        </div>

                        {compsResult.psa10Value && (
                          <button
                            type="button"
                            onClick={() => handleApplyEstValue(compsResult.psa10Value!)}
                            className="w-full py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-mono font-bold transition flex items-center justify-center gap-1 shadow active:scale-95"
                          >
                            {appliedValueSuccess ? <Check className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                            {appliedValueSuccess ? "✓ Value Applied!" : `Apply $${compsResult.psa10Value.toFixed(2)} to Card`}
                          </button>
                        )}
                      </div>

                      {/* Net Profit (PSA 10) */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Est. Net Profit</span>
                        <span className={`text-lg font-black font-mono block mt-0.5 ${
                          (compsResult.gradingAnalysis?.netProfitPSA10 ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {compsResult.gradingAnalysis?.netProfitPSA10 !== undefined
                            ? `${compsResult.gradingAnalysis.netProfitPSA10 > 0 ? "+" : ""}$${compsResult.gradingAnalysis.netProfitPSA10.toFixed(2)}`
                            : "N/A"}
                        </span>
                        <span className="text-[9px] text-amber-300 block font-mono">
                          ROI: +{compsResult.gradingAnalysis?.roiPSA10 || 0}%
                        </span>
                      </div>

                      {/* Grading Investment */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Grading Fee</span>
                        <span className="text-sm font-black text-slate-200 font-mono block mt-1">
                          ${compsResult.gradingAnalysis?.gradingFee?.toFixed(2) || gradingFee.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          Total Inv: ${((compsResult.estimatedMarketValue || 0) + (compsResult.gradingAnalysis?.gradingFee || gradingFee)).toFixed(2)}
                        </span>
                      </div>

                      {/* Scanned PSA 10 Listings */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">PSA 10 Listings</span>
                        <span className="text-xs font-mono font-bold text-amber-300 block mt-1">
                          {compsResult.psa10Sales?.length || 0} Comps Scanned
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono mt-0.5">
                          eBay Live Market
                        </span>
                      </div>
                    </div>

                    {/* Graded PSA 10 Sales Listings Grid */}
                    {compsResult.psa10Sales && compsResult.psa10Sales.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-amber-300 uppercase tracking-wider block">
                            Live PSA 10 Market Listings ({compsResult.psa10Sales.length})
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Sorted by Active/Sold Price
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {compsResult.psa10Sales.map((sale, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 p-2.5 rounded-xl transition shadow-md ${
                                sale.isOutlier
                                  ? "bg-slate-900/50 border border-slate-800 opacity-60"
                                  : "bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/60 shadow-amber-500/5"
                              }`}
                            >
                              <div className="h-14 w-12 shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                                {sale.imageUrl ? (
                                  <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                ) : (
                                  <Award className="h-6 w-6 text-amber-500" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`rounded px-1.5 py-0.2 text-[9px] font-mono font-extrabold shrink-0 border ${
                                    sale.isOutlier
                                      ? "bg-slate-800 border-slate-700 text-slate-400"
                                      : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                                  }`}>
                                    💎 PSA 10
                                  </span>
                                  <h5 className="text-xs font-semibold text-slate-200 line-clamp-1 flex-1" title={sale.title}>
                                    {sale.title}
                                  </h5>
                                  {sale.isOutlier && (
                                    <span
                                      className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.2 text-[9px] font-mono font-bold text-rose-300"
                                      title={sale.outlierReason || "Excluded"}
                                    >
                                      ⚡ Excluded: {sale.outlierReason || "Invalid"}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className={`text-sm font-mono font-black ${
                                    sale.isOutlier ? "text-slate-400 line-through" : "text-amber-400"
                                  }`}>
                                    ${sale.price.toFixed(2)} {sale.currency}
                                  </span>
                                  {sale.buyingFormat && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1 ${
                                      sale.buyingFormat === "AUCTION"
                                        ? "bg-purple-900/40 text-purple-300 border border-purple-700/50"
                                        : "bg-slate-800 text-slate-400 border border-slate-700/50"
                                    }`}>
                                      {sale.buyingFormat === "AUCTION" ? (
                                        <>
                                          <span>🔨 Auction</span>
                                          {sale.bidCount !== undefined && (
                                            <span className="text-purple-200">({sale.bidCount}b)</span>
                                          )}
                                        </>
                                      ) : (
                                        "🏷️ BIN"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {sale.itemWebUrl && (
                                <a
                                  href={sale.itemWebUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-slate-800 hover:bg-amber-600 text-slate-400 hover:text-white transition shrink-0"
                                  title="View Graded Listing on eBay"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                        <Award className="h-8 w-8 text-amber-500/60 mx-auto" />
                        <p className="text-xs text-slate-300 font-mono font-bold">
                          {compsResult.psa10Value
                            ? `Estimated PSA 10 Value: $${compsResult.psa10Value.toFixed(2)}`
                            : "No verified PSA 10 comps found for this card."}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono max-w-md mx-auto">
                          {compsResult.psa10Value
                            ? "Calculated from verified clean marketplace transactions."
                            : "Raw clickbait and non-slab listings were excluded. No artificial multipliers applied."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PSA 9 GRADED COMPS */}
                {compsTab === "psa9" && (
                  <div className="space-y-4">
                    {/* TRAFFIC-LIGHT RECOMMENDATION BANNER */}
                    <div className={`p-4 rounded-2xl border transition-all duration-200 shadow-md ${
                      cardTier === "do_it"
                        ? "bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900/90 border-emerald-500/50 shadow-emerald-500/10"
                        : cardTier === "maybe"
                        ? "bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900/90 border-amber-500/50 shadow-amber-500/10"
                        : "bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-900/90 border-rose-500/50 shadow-rose-500/10"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black tracking-wider uppercase flex items-center gap-1.5 shadow ${
                            cardTier === "do_it"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : cardTier === "maybe"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}>
                            {cardTier === "do_it" && "🟢 RECOMMENDATION: DO IT"}
                            {cardTier === "maybe" && "🟡 RECOMMENDATION: MAYBE"}
                            {cardTier === "dont_do_it" && "🔴 RECOMMENDATION: DON'T DO IT"}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Scenario: <strong className="text-slate-200 uppercase font-bold">{activeTargetGrade === "psa8" ? "⚡ PSA 8 Conservative" : activeTargetGrade === "psa9" ? "🛡️ PSA 9 Baseline" : activeTargetGrade === "psa10" ? "⭐ PSA 10 Ceiling" : "⚖️ Balanced"}</strong>
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400">
                          Breakeven: <strong className="text-slate-200">${totalBreakeven.toFixed(2)}</strong>
                          <span className="text-[10px] text-slate-500 ml-1">(Raw ${rawMarketVal.toFixed(2)} + Fee ${gradingFee.toFixed(2)})</span>
                        </div>
                      </div>

                      {/* Side-by-side PSA 10 vs PSA 9 vs PSA 8 summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2.5">
                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa10" ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-amber-300 flex items-center gap-1">
                              💎 PSA 10 {activeTargetGrade === "psa10" && <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-amber-400 font-mono text-sm">${currentP10.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP10 >= minProfitTarget ? "text-emerald-400" : netP10 > 0 ? "text-amber-300" : "text-rose-400"}`}>
                              {netP10 > 0 ? "+" : ""}${netP10.toFixed(2)} ({roiP10 > 0 ? "+" : ""}{roiP10.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa9" ? "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-cyan-300 flex items-center gap-1">
                              🛡️ PSA 9 {activeTargetGrade === "psa9" && <span className="text-[9px] bg-cyan-500/30 text-cyan-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-cyan-400 font-mono text-xs">${currentP9.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP9 >= minProfitTarget ? "text-emerald-400" : netP9 >= 0 ? "text-cyan-300" : "text-rose-400"}`}>
                              {netP9 > 0 ? "+" : ""}${netP9.toFixed(2)} ({roiP9 > 0 ? "+" : ""}{roiP9.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa8" ? "bg-purple-500/10 border-purple-500/40 ring-1 ring-purple-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-purple-300 flex items-center gap-1">
                              ⚡ PSA 8 {activeTargetGrade === "psa8" && <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-purple-400 font-mono text-xs">${currentP8.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP8 >= minProfitTarget ? "text-emerald-400" : netP8 >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                              {netP8 > 0 ? "+" : ""}${netP8.toFixed(2)} ({roiP8 > 0 ? "+" : ""}{roiP8.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Graded PSA 9 Metric Header */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* PSA 9 Valuation */}
                      <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 p-3 rounded-xl border border-cyan-500/40 flex flex-col justify-between space-y-2">
                        <div>
                          <span className="text-[10px] text-cyan-300 font-mono font-bold uppercase block tracking-wider">
                            🛡️ Est. PSA 9 Value
                          </span>
                          <span className="text-xl font-black text-cyan-400 font-mono">
                            {compsResult.psa9Value ? `$${compsResult.psa9Value.toFixed(2)}` : "N/A"}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-mono">Safe Haven Mint Floor</span>
                        </div>

                        {compsResult.psa9Value && (
                          <button
                            type="button"
                            onClick={() => handleApplyEstValue(compsResult.psa9Value!)}
                            className="w-full py-1.5 px-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-mono font-bold transition flex items-center justify-center gap-1 shadow active:scale-95"
                          >
                            {appliedValueSuccess ? <Check className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                            {appliedValueSuccess ? "✓ Value Applied!" : `Apply $${compsResult.psa9Value.toFixed(2)} to Card`}
                          </button>
                        )}
                      </div>

                      {/* Net Profit (PSA 9) */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Net Profit @ Grade 9</span>
                        <span className={`text-lg font-black font-mono block mt-0.5 ${
                          (compsResult.gradingAnalysis?.netProfitPSA9 ?? 0) >= 0 ? "text-cyan-400" : "text-rose-400"
                        }`}>
                          {compsResult.gradingAnalysis?.netProfitPSA9 !== undefined
                            ? `${compsResult.gradingAnalysis.netProfitPSA9 >= 0 ? "+" : ""}$${compsResult.gradingAnalysis.netProfitPSA9.toFixed(2)}`
                            : "N/A"}
                        </span>
                        <span className="text-[9px] text-cyan-300 block font-mono">
                          {(compsResult.gradingAnalysis?.netProfitPSA9 ?? 0) >= 0 ? "🛡️ Profitable Floor" : "⚠️ Loss on Grade 9"}
                        </span>
                      </div>

                      {/* Grading Investment */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Grading Fee</span>
                        <span className="text-sm font-black text-slate-200 font-mono block mt-1">
                          ${compsResult.gradingAnalysis?.gradingFee?.toFixed(2) || gradingFee.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          Total Inv: ${((compsResult.estimatedMarketValue || 0) + (compsResult.gradingAnalysis?.gradingFee || gradingFee)).toFixed(2)}
                        </span>
                      </div>

                      {/* Scanned PSA 9 Listings */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">PSA 9 Listings</span>
                        <span className="text-xs font-mono font-bold text-cyan-300 block mt-1">
                          {compsResult.psa9Sales?.length || 0} Comps Scanned
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono mt-0.5">
                          eBay Live Market
                        </span>
                      </div>
                    </div>

                    {/* Graded PSA 9 Sales Listings Grid */}
                    {compsResult.psa9Sales && compsResult.psa9Sales.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-cyan-300 uppercase tracking-wider block">
                            Live PSA 9 Market Listings ({compsResult.psa9Sales.length})
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Sorted by Active/Sold Price
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {compsResult.psa9Sales.map((sale, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 p-2.5 rounded-xl transition shadow-md ${
                                sale.isOutlier
                                  ? "bg-slate-900/50 border border-slate-800 opacity-60"
                                  : "bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-500/60 shadow-cyan-500/5"
                              }`}
                            >
                              <div className="h-14 w-12 shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                                {sale.imageUrl ? (
                                  <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                ) : (
                                  <Award className="h-6 w-6 text-cyan-400" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`rounded px-1.5 py-0.2 text-[9px] font-mono font-extrabold shrink-0 border ${
                                    sale.isOutlier
                                      ? "bg-slate-800 border-slate-700 text-slate-400"
                                      : "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                                  }`}>
                                    🛡️ PSA 9
                                  </span>
                                  <h5 className="text-xs font-semibold text-slate-200 line-clamp-1 flex-1" title={sale.title}>
                                    {sale.title}
                                  </h5>
                                  {sale.isOutlier && (
                                    <span
                                      className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.2 text-[9px] font-mono font-bold text-rose-300"
                                      title={sale.outlierReason || "Excluded"}
                                    >
                                      ⚡ Excluded: {sale.outlierReason || "Invalid"}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className={`text-sm font-mono font-black ${
                                    sale.isOutlier ? "text-slate-400 line-through" : "text-cyan-400"
                                  }`}>
                                    ${sale.price.toFixed(2)} {sale.currency}
                                  </span>
                                  {sale.buyingFormat && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1 ${
                                      sale.buyingFormat === "AUCTION"
                                        ? "bg-purple-900/40 text-purple-300 border border-purple-700/50"
                                        : "bg-slate-800 text-slate-400 border border-slate-700/50"
                                    }`}>
                                      {sale.buyingFormat === "AUCTION" ? (
                                        <>
                                          <span>🔨 Auction</span>
                                          {sale.bidCount !== undefined && (
                                            <span className="text-purple-200">({sale.bidCount}b)</span>
                                          )}
                                        </>
                                      ) : (
                                        "🏷️ BIN"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {sale.itemWebUrl && (
                                <a
                                  href={sale.itemWebUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-400 hover:text-white transition shrink-0"
                                  title="View Graded Listing on eBay"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                        <Award className="h-8 w-8 text-cyan-400/60 mx-auto" />
                        <p className="text-xs text-slate-300 font-mono font-bold">
                          {compsResult.psa9Value
                            ? `Estimated PSA 9 Value: $${compsResult.psa9Value.toFixed(2)}`
                            : "No verified PSA 9 comps found for this card."}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono max-w-md mx-auto">
                          {compsResult.psa9Value
                            ? "Calculated from verified clean marketplace transactions."
                            : "Raw clickbait and non-slab listings were excluded. No artificial multipliers applied."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PSA 8 GRADED COMPS */}
                {compsTab === "psa8" && (
                  <div className="space-y-4">
                    {/* TRAFFIC-LIGHT RECOMMENDATION BANNER */}
                    <div className={`p-4 rounded-2xl border transition-all duration-200 shadow-md ${
                      cardTier === "do_it"
                        ? "bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900/90 border-emerald-500/50 shadow-emerald-500/10"
                        : cardTier === "maybe"
                        ? "bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900/90 border-amber-500/50 shadow-amber-500/10"
                        : "bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-900/90 border-rose-500/50 shadow-rose-500/10"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black tracking-wider uppercase flex items-center gap-1.5 shadow ${
                            cardTier === "do_it"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : cardTier === "maybe"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}>
                            {cardTier === "do_it" && "🟢 RECOMMENDATION: DO IT"}
                            {cardTier === "maybe" && "🟡 RECOMMENDATION: MAYBE"}
                            {cardTier === "dont_do_it" && "🔴 RECOMMENDATION: DON'T DO IT"}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Scenario: <strong className="text-slate-200 uppercase font-bold">{activeTargetGrade === "psa8" ? "⚡ PSA 8 Conservative" : activeTargetGrade === "psa9" ? "🛡️ PSA 9 Baseline" : activeTargetGrade === "psa10" ? "⭐ PSA 10 Ceiling" : "⚖️ Balanced"}</strong>
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400">
                          Breakeven: <strong className="text-slate-200">${totalBreakeven.toFixed(2)}</strong>
                          <span className="text-[10px] text-slate-500 ml-1">(Raw ${rawMarketVal.toFixed(2)} + Fee ${gradingFee.toFixed(2)})</span>
                        </div>
                      </div>

                      {/* Side-by-side PSA 10 vs PSA 9 vs PSA 8 summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2.5">
                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa10" ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-amber-300 flex items-center gap-1">
                              💎 PSA 10 {activeTargetGrade === "psa10" && <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-amber-400 font-mono text-sm">${currentP10.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP10 >= minProfitTarget ? "text-emerald-400" : netP10 > 0 ? "text-amber-300" : "text-rose-400"}`}>
                              {netP10 > 0 ? "+" : ""}${netP10.toFixed(2)} ({roiP10 > 0 ? "+" : ""}{roiP10.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa9" ? "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-cyan-300 flex items-center gap-1">
                              🛡️ PSA 9 {activeTargetGrade === "psa9" && <span className="text-[9px] bg-cyan-500/30 text-cyan-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-cyan-400 font-mono text-xs">${currentP9.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP9 >= minProfitTarget ? "text-emerald-400" : netP9 >= 0 ? "text-cyan-300" : "text-rose-400"}`}>
                              {netP9 > 0 ? "+" : ""}${netP9.toFixed(2)} ({roiP9 > 0 ? "+" : ""}{roiP9.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${
                          activeTargetGrade === "psa8" ? "bg-purple-500/10 border-purple-500/40 ring-1 ring-purple-500/30" : "bg-slate-900/80 border-slate-800"
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-purple-300 flex items-center gap-1">
                              ⚡ PSA 8 {activeTargetGrade === "psa8" && <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1 rounded font-bold">TARGET</span>}
                            </span>
                            <span className="font-black text-purple-400 font-mono text-xs">${currentP8.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                            <span className="text-slate-400">Net Profit / ROI:</span>
                            <span className={`font-bold ${netP8 >= minProfitTarget ? "text-emerald-400" : netP8 >= 0 ? "text-purple-300" : "text-rose-400"}`}>
                              {netP8 > 0 ? "+" : ""}${netP8.toFixed(2)} ({roiP8 > 0 ? "+" : ""}{roiP8.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Graded PSA 8 Metric Header */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* PSA 8 Valuation */}
                      <div className="bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 p-3 rounded-xl border border-purple-500/40 flex flex-col justify-between space-y-2">
                        <div>
                          <span className="text-[10px] text-purple-300 font-mono font-bold uppercase block tracking-wider">
                            ⚡ Est. PSA 8 Value
                          </span>
                          <span className="text-xl font-black text-purple-400 font-mono">
                            {compsResult.psa8Value ? `$${compsResult.psa8Value.toFixed(2)}` : "N/A"}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-mono">Conservative / NM-MT Floor</span>
                        </div>

                        {compsResult.psa8Value && (
                          <button
                            type="button"
                            onClick={() => handleApplyEstValue(compsResult.psa8Value!)}
                            className="w-full py-1.5 px-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-mono font-bold transition flex items-center justify-center gap-1 shadow active:scale-95 cursor-pointer"
                          >
                            {appliedValueSuccess ? <Check className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                            {appliedValueSuccess ? "✓ Value Applied!" : `Apply $${compsResult.psa8Value.toFixed(2)} to Card`}
                          </button>
                        )}
                      </div>

                      {/* Net Profit (PSA 8) */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Net Profit @ Grade 8</span>
                        <span className={`text-lg font-black font-mono block mt-0.5 ${
                          (compsResult.gradingAnalysis?.netProfitPSA8 ?? 0) >= 0 ? "text-purple-400" : "text-rose-400"
                        }`}>
                          {compsResult.gradingAnalysis?.netProfitPSA8 !== undefined
                            ? `${compsResult.gradingAnalysis.netProfitPSA8 >= 0 ? "+" : ""}$${compsResult.gradingAnalysis.netProfitPSA8.toFixed(2)}`
                            : "N/A"}
                        </span>
                        <span className="text-[9px] text-purple-300 block font-mono">
                          {(compsResult.gradingAnalysis?.netProfitPSA8 ?? 0) >= 0 ? "⚡ Profitable Floor" : "⚠️ Loss on Grade 8"}
                        </span>
                      </div>

                      {/* Grading Investment */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">Grading Fee</span>
                        <span className="text-sm font-black text-slate-200 font-mono block mt-1">
                          ${compsResult.gradingAnalysis?.gradingFee?.toFixed(2) || gradingFee.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono">
                          Total Inv: ${((compsResult.estimatedMarketValue || 0) + (compsResult.gradingAnalysis?.gradingFee || gradingFee)).toFixed(2)}
                        </span>
                      </div>

                      {/* Scanned PSA 8 Listings */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono uppercase block">PSA 8 Listings</span>
                        <span className="text-xs font-mono font-bold text-purple-300 block mt-1">
                          {compsResult.psa8Sales?.length || 0} Comps Scanned
                        </span>
                        <span className="text-[9px] text-slate-400 block font-mono mt-0.5">
                          eBay Live Market
                        </span>
                      </div>
                    </div>

                    {/* Graded PSA 8 Sales Listings Grid */}
                    {compsResult.psa8Sales && compsResult.psa8Sales.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-purple-300 uppercase tracking-wider block">
                            Live PSA 8 Market Listings ({compsResult.psa8Sales.length})
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Sorted by Active/Sold Price
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {compsResult.psa8Sales.map((sale, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 p-2.5 rounded-xl transition shadow-md ${
                                sale.isOutlier
                                  ? "bg-slate-900/50 border border-slate-800 opacity-60"
                                  : "bg-slate-900/90 border border-purple-500/30 hover:border-purple-500/60 shadow-purple-500/5"
                              }`}
                            >
                              <div className="h-14 w-12 shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                                {sale.imageUrl ? (
                                  <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                                ) : (
                                  <Award className="h-6 w-6 text-purple-400" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`rounded px-1.5 py-0.2 text-[9px] font-mono font-extrabold shrink-0 border ${
                                    sale.isOutlier
                                      ? "bg-slate-800 border-slate-700 text-slate-400"
                                      : "bg-purple-500/20 border-purple-500/40 text-purple-300"
                                  }`}>
                                    ⚡ PSA 8
                                  </span>
                                  <h5 className="text-xs font-semibold text-slate-200 line-clamp-1 flex-1" title={sale.title}>
                                    {sale.title}
                                  </h5>
                                  {sale.isOutlier && (
                                    <span
                                      className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.2 text-[9px] font-mono font-bold text-rose-300"
                                      title={sale.outlierReason || "Excluded"}
                                    >
                                      ⚡ Excluded: {sale.outlierReason || "Invalid"}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className={`text-sm font-mono font-black ${
                                    sale.isOutlier ? "text-slate-400 line-through" : "text-purple-400"
                                  }`}>
                                    ${sale.price.toFixed(2)} {sale.currency}
                                  </span>
                                  {sale.buyingFormat && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1 ${
                                      sale.buyingFormat === "AUCTION"
                                        ? "bg-purple-900/40 text-purple-300 border border-purple-700/50"
                                        : "bg-slate-800 text-slate-400 border border-slate-700/50"
                                    }`}>
                                      {sale.buyingFormat === "AUCTION" ? (
                                        <>
                                          <span>🔨 Auction</span>
                                          {sale.bidCount !== undefined && (
                                            <span className="text-purple-200">({sale.bidCount}b)</span>
                                          )}
                                        </>
                                      ) : (
                                        "🏷️ BIN"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {sale.itemWebUrl && (
                                <a
                                  href={sale.itemWebUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-slate-800 hover:bg-purple-600 text-slate-400 hover:text-white transition shrink-0"
                                  title="View Graded Listing on eBay"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                        <Award className="h-8 w-8 text-purple-400/60 mx-auto" />
                        <p className="text-xs text-slate-300 font-mono font-bold">
                          {compsResult.psa8Value
                            ? `Estimated PSA 8 Value: $${compsResult.psa8Value.toFixed(2)}`
                            : "No verified PSA 8 comps found for this card."}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono max-w-md mx-auto">
                          {compsResult.psa8Value
                            ? "Calculated from verified clean marketplace transactions."
                            : "Raw clickbait and non-slab listings were excluded. No artificial multipliers applied."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          </div>

          {/* Modal Footer Controls (Sticky) */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-800 p-4 sm:p-5 bg-slate-950/90 backdrop-blur-sm shrink-0">
            <div>
              {!card.isSold && onMarkCardAsSold && !showSoldForm && (
                <button
                  type="button"
                  onClick={() => setShowSoldForm(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-xs font-bold text-purple-200 transition active:scale-95 cursor-pointer"
                >
                  <BadgeDollarSign className="h-3.5 w-3.5 text-purple-400" />
                  <span>Mark as Sold</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black shadow-lg transition active:scale-95 cursor-pointer ${
                  isSaved
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20"
                    : "bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white shadow-emerald-500/25 ring-2 ring-emerald-400/40"
                }`}
              >
                <Save className="h-4 w-4" />
                <span>{isSaved ? "Save Changes" : "⚡ Save to Collection & Inventory"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Variation Matcher Modal */}
      {card && isVariationMatcherOpen && (
        <VariationMatcherModal
          isOpen={isVariationMatcherOpen}
          onClose={() => setIsVariationMatcherOpen(false)}
          card={card}
          onApplyVariation={handleVariationMatched}
        />
      )}
    </div>
  );
}
