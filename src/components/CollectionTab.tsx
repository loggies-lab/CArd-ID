"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  SavedCollectionItem,
  CDPCardSchema,
  TriageStatus,
  getCardTriageStatus,
  getKeyCardFlags,
  checkPotentialNumberedParallel,
  sanitizeCompQuery,
  VaultDestination,
  BinTier,
  UserSettings,
  isCardInVault,
  GradingStage,
  GradingRejectReason,
  GRADING_REJECT_REASON_LABELS,
} from "@/types/card";
import { isDealerSubscription } from "@/types/subscription";
import { usePlanPermissions } from "@/context/PlanContext";
import { FeatureGate } from "@/components/FeatureGate";
import { exportSavedCollectionToCSV } from "@/lib/csvExport";
import { generateCdpTitle } from "@/lib/titleGenerator";
import { useAuth } from "@/context/AuthContext";
import { PortfolioChart } from "@/components/PortfolioChart";
import { GainersFallersWidget } from "@/components/GainersFallersWidget";
import { PortfolioSnapshot } from "@/types/portfolio";
import { separateInventory } from "@/lib/inventorySeparationService";
import {
  getPortfolioSnapshots,
  recordPortfolioSnapshot,
  computeGainersAndFallers,
} from "@/lib/portfolioHistory";
import { generateWaterfallQueries } from "@/lib/compSanitizer";
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
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit3,
  Check,
  Package,
  ExternalLink,
  Store,
  Box,
  TrendingUp,
  CheckCircle2,
  Share2,
  ArrowRight,
  ShieldCheck,
  Database,
} from "lucide-react";
import { FloatingActionBar } from "@/components/FloatingActionBar";
import { CardActionsMenu } from "@/components/CardActionsMenu";
import { VariationMatcherModal } from "@/components/VariationMatcherModal";

interface CollectionTabProps {
  savedCards: SavedCollectionItem[];
  removeCard: (id: string) => void;
  removeCardsBatch?: (ids: string[]) => Promise<void> | void;
  clearCollection: () => void;
  onInspectCard?: (card: SavedCollectionItem) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema }[]) => void;
  updateCardTriageStatus?: (id: string, triageStatus: TriageStatus) => Promise<void> | void;
  renameBatch?: (batchId: string, newBatchName: string) => Promise<boolean>;
  onListCardsToEbay?: (cards: SavedCollectionItem[]) => void;
  userSettings?: UserSettings;
  subscriptionPlan?: string;
  unlimitedAccess?: boolean;
  initialBatchId?: string;
  onBatchFilterChange?: (batchId: string) => void;
  onOpenLedger?: () => void;
  markCardAsSold?: (
    id: string,
    soldData: {
      soldPrice: number;
      soldPlatform?: "SHOP" | "EBAY" | "VENDOR_TABLE" | "CASH" | "OTHER";
      soldFees?: number;
      soldDate?: string;
    }
  ) => Promise<boolean>;
  updateCardVaultAndBin?: (
    id: string,
    updates: {
      vaultDestination?: VaultDestination;
      binTier?: BinTier;
      isVaulted?: boolean;
      isBulk?: boolean;
      triageStatus?: TriageStatus;
      gradingStage?: GradingStage;
      dontGrade?: boolean;
    }
  ) => Promise<boolean>;
  updateCardsVaultAndBinBatch?: (
    updates: {
      id: string;
      vaultDestination?: VaultDestination;
      binTier?: BinTier;
      isVaulted?: boolean;
      isBulk?: boolean;
      triageStatus?: TriageStatus;
    }[]
  ) => Promise<boolean>;
  onNavigateToBins?: () => void;
  onNavigateToEbay?: () => void;
  onNavigateToGrading?: () => void;
  onNavigateToScanner?: () => void;
  stagedCount?: number;
}

type SortField = "price" | "dateAdded" | "title" | "player" | "year" | "needsConfirmation";

export function getCardStatusBadge(item: SavedCollectionItem) {
  if (item.isSold) {
    return {
      label: `Sold $${item.soldPrice?.toFixed(2) || ""}`,
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      shortLabel: "Sold",
    };
  }
  if (item.vaultDestination === "PSA_GRADING" || (!item.vaultDestination && item.triageStatus === "GRADE_CANDIDATE")) {
    return {
      label: "🔬 PSA Candidate",
      className: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      shortLabel: "PSA",
    };
  }
  if (item.vaultDestination === "EBAY" || (!item.vaultDestination && item.triageStatus === "EBAY_RAW")) {
    return {
      label: "🛍️ eBay Raw",
      className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      shortLabel: "eBay",
    };
  }
  if (item.vaultDestination === "SHOP_CASE") {
    return {
      label: "🛒 Shop Showcase",
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      shortLabel: "Shop",
    };
  }
  if (item.vaultDestination === "PC") {
    return {
      label: "💎 Vault PC",
      className: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
      shortLabel: "PC",
    };
  }
  if (item.binTier === "BIN_UNDER_4" || item.binTier === "BIN_1" || item.binTier === "BIN_3" || item.binTier === "BIN_4" || item.selectedChannel === "BINS" || item.data?.selectedChannel === "BINS") {
    return {
      label: "📦 <$4 Bins",
      className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      shortLabel: "<$4 Bin",
    };
  }
  if (item.binTier === "PURE_BULK") {
    return {
      label: "📦 Bulk Lot",
      className: "bg-slate-800 text-slate-400 border-slate-700",
      shortLabel: "Bulk",
    };
  }
  if (item.selectedChannel === "GRADE" || item.data?.selectedChannel === "GRADE") {
    return {
      label: "🔬 Tag: Grade",
      className: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      shortLabel: "Grade",
    };
  }
  if (item.selectedChannel === "EBAY" || item.data?.selectedChannel === "EBAY") {
    return {
      label: "🛍️ Tag: eBay",
      className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      shortLabel: "eBay",
    };
  }
  if (item.selectedChannel === "BULK" || item.data?.selectedChannel === "BULK") {
    return {
      label: "📦 Tag: Bulk",
      className: "bg-slate-800 text-slate-300 border-slate-700",
      shortLabel: "Bulk",
    };
  }
  return {
    label: "📥 Inbox",
    className: "bg-slate-800 text-slate-300 border-slate-700",
    shortLabel: "Inbox",
  };
}

export function CollectionTab({
  savedCards,
  removeCard,
  removeCardsBatch,
  clearCollection,
  onInspectCard,
  updateSavedCardDataBatch,
  updateCardTriageStatus,
  renameBatch,
  onListCardsToEbay,
  userSettings,
  subscriptionPlan,
  unlimitedAccess,
  initialBatchId,
  onBatchFilterChange,
  onOpenLedger,
  markCardAsSold,
  updateCardVaultAndBin,
  updateCardsVaultAndBinBatch,
  onNavigateToBins,
  onNavigateToEbay,
  onNavigateToGrading,
  onNavigateToScanner,
  stagedCount = 0,
}: CollectionTabProps) {
  const { currentUser } = useAuth();
  const { canAccess, checkQuota, openPaywall, getGateMode, userPlan, isVipUnlimited } = usePlanPermissions();
  const isFreeOrStarter = (userPlan === "FREE" || userPlan === "STARTER" || String(subscriptionPlan || "").toLowerCase() === "free" || String(subscriptionPlan || "").toLowerCase() === "starter");
  const isDealer = !isFreeOrStarter && (canAccess("dealerMultiBins") || isDealerSubscription(subscriptionPlan, unlimitedAccess));

  // Primary Inventory Mode & Filter State (Active Inventory vs Warehouse vs 4 Triage Piles + Sold)
  const [inventoryMode, setInventoryMode] = useState<"ALL" | "WAREHOUSE" | "EBAY" | "GRADING" | "DOLLAR_BIN" | "BULK" | "SOLD" | "VAULT" | "BINS">("ALL");
  const [vaultChannelFilter, setVaultChannelFilter] = useState<"ALL" | VaultDestination>("ALL");
  const [binTierFilter, setBinTierFilter] = useState<"ALL" | BinTier>("ALL");
  const [ebayBinFilter, setEbayBinFilter] = useState<string>("ALL");

  // Derive all sequential eBay physical boxes (e.g. Bin 1, Bin 2)
  const availableEbayBins = useMemo(() => {
    const bins = new Set<string>();
    savedCards.forEach((c) => {
      const b = c.ebayBinNumber || c.data?.ebayBinNumber || (c.locationId?.startsWith("Bin ") ? c.locationId : undefined);
      if (b) bins.add(b);
    });
    if (bins.size === 0 && savedCards.some((c) => c.triageCategory === "EBAY" || c.vaultDestination === "EBAY")) {
      bins.add("Bin 1");
    }
    return Array.from(bins).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  }, [savedCards]);

  // Mark as Sold Modal state
  const [cardToMarkSold, setCardToMarkSold] = useState<SavedCollectionItem | null>(null);
  const [soldPriceInput, setSoldPriceInput] = useState("");
  const [soldPlatformInput, setSoldPlatformInput] = useState<"SHOP" | "EBAY" | "VENDOR_TABLE" | "CASH" | "OTHER">("SHOP");
  const [soldFeesInput, setSoldFeesInput] = useState("");
  const [isSubmittingSold, setIsSubmittingSold] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSport, setSelectedSport] = useState("all");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [selectedTriageStatus, setSelectedTriageStatus] = useState<"ALL" | TriageStatus>("ALL");
  const [filterRookie, setFilterRookie] = useState(false);
  const [filterAuto, setFilterAuto] = useState(false);
  const [filterMem, setFilterMem] = useState(false);
  const [filterKeyUncomped, setFilterKeyUncomped] = useState(false);
  const [filterPotentialNumbered, setFilterPotentialNumbered] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Sync initialBatchId when provided from external tab/navigation
  useEffect(() => {
    if (initialBatchId && initialBatchId !== "all") {
      setSelectedBatchId(initialBatchId);
      setInventoryMode("ALL");
      setVaultChannelFilter("ALL");
      setBinTierFilter("ALL");
    } else if (!initialBatchId || initialBatchId === "all") {
      setSelectedBatchId("all");
    }
  }, [initialBatchId]);

  // Portfolio snapshots for Robinhood graph
  const [showAnalyticsDrawer, setShowAnalyticsDrawer] = useState(false);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [isRefreshingMarket, setIsRefreshingMarket] = useState(false);

  useEffect(() => {
    getPortfolioSnapshots(currentUser?.uid).then((snaps) => {
      setSnapshots(snaps);
    });
  }, [currentUser?.uid]);

  // Sorting State (Default: Highest Price First!)
  const [sortBy, setSortBy] = useState<SortField>("price");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Multi-select & Range selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isTabHeld, setIsTabHeld] = useState(false);

  // Track most recently updated/priced card to prevent sudden disappearance and provide visual highlight
  const [lastUpdatedCardId, setLastUpdatedCardId] = useState<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    const recentlyUpdated = savedCards.find((c) => {
      const updatedTime = c.data?.valueLastUpdated ? new Date(c.data.valueLastUpdated).getTime() : 0;
      return now - updatedTime < 15000;
    });
    if (recentlyUpdated) {
      setLastUpdatedCardId(recentlyUpdated.id);
      const timer = setTimeout(() => setLastUpdatedCardId(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [savedCards]);

  // Keydown / Keyup listener to track Tab / Shift modifier keys for multi-selection
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setIsTabHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        setIsTabHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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

  // Batch Rename Modal & Notification State
  const [renamingBatch, setRenamingBatch] = useState<{
    batchId: string;
    currentName: string;
    count: number;
  } | null>(null);
  const [renameInputVal, setRenameInputVal] = useState("");
  const [isRenamingSubmitting, setIsRenamingSubmitting] = useState(false);
  const [renameNotice, setRenameNotice] = useState<string | null>(null);

  // Variation Matcher from eBay State
  const [isVariationMatcherOpen, setIsVariationMatcherOpen] = useState(false);
  const [variationMatcherCard, setVariationMatcherCard] = useState<SavedCollectionItem | null>(null);

  const handleApplyVariationFromMatcher = async (
    cardId: string,
    updates: Partial<CDPCardSchema>,
    recomp?: boolean
  ) => {
    const targetCard = savedCards.find((c) => c.id === cardId);
    if (!targetCard) return;

    const updatedData: CDPCardSchema = {
      ...targetCard.data,
      ...updates,
    };

    if (updateSavedCardDataBatch) {
      updateSavedCardDataBatch([{ id: cardId, data: updatedData }]);
    }

    const priceText = updates.estimatedValue ? ` & market value updated to $${updates.estimatedValue.toFixed(2)}` : "";
    setBulkSummaryMessage(`✨ Card updated to "${updates.subsetParallel}"${priceText}!`);
    setTimeout(() => setBulkSummaryMessage(null), 5000);

    const updatedItem: SavedCollectionItem = {
      ...targetCard,
      data: updatedData,
    };

    // Open/leave the inspector view open so user can make changes if needed then save
    if (onInspectCard) {
      onInspectCard(updatedItem);
    }

    if (recomp) {
      await handleRunBulkComps([updatedItem]);
    }
  };

  const handleOpenRename = (batchId: string, currentName: string, count: number) => {
    setRenamingBatch({ batchId, currentName, count });
    setRenameInputVal(currentName);
  };

  const handleConfirmRename = async () => {
    if (!renamingBatch || !renameInputVal.trim() || !renameBatch) return;
    const newName = renameInputVal.trim();
    if (newName === renamingBatch.currentName) {
      setRenamingBatch(null);
      return;
    }
    setIsRenamingSubmitting(true);
    try {
      const ok = await renameBatch(renamingBatch.batchId, newName);
      if (ok) {
        setRenameNotice(`Batch successfully renamed to "${newName}"`);
        setTimeout(() => setRenameNotice(null), 3500);
      }
      setRenamingBatch(null);
    } catch (err) {
      console.error("Failed to rename batch:", err);
    } finally {
      setIsRenamingSubmitting(false);
    }
  };

  // Mark as Sold Modal Handlers
  const handleOpenMarkSold = (card: SavedCollectionItem) => {
    setCardToMarkSold(card);
    const est = card.data.estimatedValue || 0;
    setSoldPriceInput(est > 0 ? est.toFixed(2) : "");
    if (card.vaultDestination === "EBAY" || card.data.ebayListingStatus === "ACTIVE") {
      setSoldPlatformInput("EBAY");
      setSoldFeesInput(est > 0 ? (est * 0.1325).toFixed(2) : "0.00");
    } else if (card.vaultDestination === "VENDOR_TABLE") {
      setSoldPlatformInput("VENDOR_TABLE");
      setSoldFeesInput("0.00");
    } else {
      setSoldPlatformInput("SHOP");
      setSoldFeesInput("0.00");
    }
  };

  const handleConfirmMarkSold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToMarkSold || !markCardAsSold) return;
    const price = parseFloat(soldPriceInput);
    if (isNaN(price) || price < 0) return;
    const fees = parseFloat(soldFeesInput) || 0;

    setIsSubmittingSold(true);
    try {
      const ok = await markCardAsSold(cardToMarkSold.id, {
        soldPrice: price,
        soldPlatform: soldPlatformInput,
        soldFees: fees,
        soldDate: new Date().toISOString(),
      });
      if (ok) {
        setBulkSummaryMessage(`🎉 Card marked as sold for $${price.toFixed(2)}! Vault slot has been freed.`);
        setTimeout(() => setBulkSummaryMessage(null), 4000);
      }
      setCardToMarkSold(null);
      setSoldPriceInput("");
      setSoldFeesInput("");
    } catch (err) {
      console.error("Failed to mark card as sold:", err);
    } finally {
      setIsSubmittingSold(false);
    }
  };

  // Threshold for active sales inventory (defaults to $4.00 or user custom threshold)
  const minActiveThreshold = userSettings?.minEbayRawThreshold ?? 4.0;

  // Statistics calculation including Vault, Dollar Bins, and Realized Sold Profit
  const stats = useMemo(() => {
    const total = savedCards.length;
    const rookies = savedCards.filter((c) => c.data.isRookie).length;
    const autos = savedCards.filter((c) => c.data.isAutographed).length;
    const mems = savedCards.filter((c) => c.data.isMemorabilia).length;

    const vaultCards = savedCards.filter((c) => isCardInVault(c, minActiveThreshold));
    const binCards = savedCards.filter((c) => !c.isSold && (!!c.binTier || !!c.isBulk || c.triageStatus === "DOLLAR_BIN"));
    const soldCards = savedCards.filter((c) => !!c.isSold);

    const valuedCards = savedCards.filter(
      (c) => c.data.estimatedValue !== undefined && c.data.estimatedValue > 0
    );
    const portfolioValue = valuedCards.reduce((sum, c) => sum + (c.data.estimatedValue || 0), 0);

    const vaultPortfolioValue = vaultCards.reduce(
      (sum, c) => sum + (c.data.estimatedValue || 0),
      0
    );

    const binPortfolioValue = binCards.reduce((sum, c) => {
      if (c.data.estimatedValue && c.data.estimatedValue > 0) return sum + c.data.estimatedValue;
      if (c.binTier === "BIN_UNDER_4") return sum + 2;
      if (c.binTier === "BIN_1") return sum + 1;
      if (c.binTier === "BIN_3") return sum + 3;
      if (c.binTier === "BIN_4") return sum + 4;
      return sum + 0.5;
    }, 0);

    const totalRealizedProfit = soldCards.reduce(
      (sum, c) => sum + (c.soldNetProfit || 0),
      0
    );
    const totalSalesVolume = soldCards.reduce(
      (sum, c) => sum + (c.soldPrice || 0),
      0
    );

    // Unpriced cards strictly in The Vault (excluding bulk and dollar bins)
    const unpricedCount = vaultCards.filter(
      (c) => c.data.estimatedValue === undefined || c.data.estimatedValue <= 0
    ).length;

    // Commercial Channel counts in Vault
    const shopCount = vaultCards.filter((c) => c.vaultDestination === "SHOP_CASE").length;
    const ebayCount = vaultCards.filter(
      (c) => c.vaultDestination === "EBAY" || (!c.vaultDestination && c.triageStatus === "EBAY_RAW")
    ).length;
    const vendorCount = vaultCards.filter((c) => c.vaultDestination === "VENDOR_TABLE").length;
    const psaCount = vaultCards.filter(
      (c) => c.vaultDestination === "PSA_GRADING" || (!c.vaultDestination && c.triageStatus === "GRADE_CANDIDATE")
    ).length;
    const pcCount = vaultCards.filter(
      (c) => c.vaultDestination === "PC" || (!c.vaultDestination && (c.triageStatus === "INBOX" || !c.triageStatus))
    ).length;

    // Multi-Bin counts
    const binUnder4Count = binCards.filter(
      (c) => c.binTier === "BIN_UNDER_4" || c.binTier === "BIN_1" || c.binTier === "BIN_3" || c.binTier === "BIN_4" || (!c.binTier && c.triageStatus === "DOLLAR_BIN" && !c.isBulk)
    ).length;
    const bin1Count = binCards.filter((c) => c.binTier === "BIN_1").length;
    const bin3Count = binCards.filter((c) => c.binTier === "BIN_3").length;
    const bin4Count = binCards.filter((c) => c.binTier === "BIN_4").length;
    const bulkCount = binCards.filter(
      (c) => c.binTier === "PURE_BULK" || !!c.isBulk || (!c.binTier && c.triageStatus === "DOLLAR_BIN" && !!c.isBulk)
    ).length;

    const ebayCards = savedCards.filter(
      (c) => !c.isSold && (c.triageCategory === "EBAY" || c.vaultDestination === "EBAY" || (!c.vaultDestination && c.triageStatus === "EBAY_RAW"))
    );
    const ebayPortfolioValue = ebayCards.reduce((sum, c) => sum + (c.data?.estimatedValue || 0), 0);

    const psaCards = savedCards.filter(
      (c) => !c.isSold && (c.triageCategory === "GRADING" || c.vaultDestination === "PSA_GRADING" || (!c.vaultDestination && c.triageStatus === "GRADE_CANDIDATE"))
    );
    const psaPortfolioValue = psaCards.reduce((sum, c) => sum + (c.data?.estimatedValue || 0), 0);

    const dollarBinCards = savedCards.filter(
      (c) =>
        !c.isSold &&
        !c.isBulk &&
        c.triageCategory !== "BULK" &&
        c.binTier !== "PURE_BULK" &&
        (c.triageCategory === "DOLLAR_BIN" || !!c.binTier || c.triageStatus === "DOLLAR_BIN")
    );
    const dollarBinPortfolioValue = dollarBinCards.reduce((sum, c) => {
      if (c.data?.estimatedValue && c.data.estimatedValue > 0) return sum + c.data.estimatedValue;
      if (c.binTier === "BIN_UNDER_4") return sum + 2;
      if (c.binTier === "BIN_4") return sum + 4;
      if (c.binTier === "BIN_3") return sum + 3;
      return sum + 1;
    }, 0);

    const bulkCards = savedCards.filter(
      (c) =>
        !c.isSold &&
        (c.triageCategory === "BULK" || c.binTier === "PURE_BULK" || !!c.isBulk || c.data?.triageCategory === "BULK" || (c.data as any)?.isBulk)
    );
    const bulkPortfolioValue = bulkCards.reduce((sum, c) => sum + (c.data?.estimatedValue || 0.5), 0);

    const pcCards = vaultCards.filter(
      (c) => c.vaultDestination === "PC" || (!c.vaultDestination && (c.triageStatus === "INBOX" || !c.triageStatus))
    );
    const pcPortfolioValue = pcCards.reduce((sum, c) => sum + (c.data?.estimatedValue || 0), 0);

    const shopCards = vaultCards.filter((c) => c.vaultDestination === "SHOP_CASE");
    const shopPortfolioValue = shopCards.reduce((sum, c) => sum + (c.data?.estimatedValue || 0), 0);

    // Active Vault collection cost basis & unrealized profit computation (strictly cards in The Vault: eBay singles & PSA grading)
    const activeCards = vaultCards;
    const totalInvested = activeCards.reduce((sum, c) => {
      const p = c.purchasePrice ?? (c.data as any)?.purchasePrice ?? 0;
      return sum + p;
    }, 0);
    const activePortfolioValue = vaultPortfolioValue;
    const unrealizedGain = activePortfolioValue - totalInvested;
    const unrealizedRoiPct = totalInvested > 0 ? (unrealizedGain / totalInvested) * 100 : 0;
    const cardsWithCostBasis = activeCards.filter(
      (c) => (c.purchasePrice ?? (c.data as any)?.purchasePrice) !== undefined && (c.purchasePrice ?? (c.data as any)?.purchasePrice) > 0
    ).length;

    return {
      total,
      rookies,
      autos,
      mems,
      portfolioValue: activePortfolioValue,
      totalWarehouseValue: portfolioValue,
      activePortfolioValue,
      totalInvested,
      unrealizedGain,
      unrealizedRoiPct,
      cardsWithCostBasis,
      activeCount: activeCards.length,
      vaultPortfolioValue,
      binPortfolioValue: dollarBinPortfolioValue,
      ebayPortfolioValue,
      psaPortfolioValue,
      pcPortfolioValue,
      shopPortfolioValue,
      dollarBinPortfolioValue,
      bulkPortfolioValue,
      totalRealizedProfit,
      totalSalesVolume,
      vaultCount: vaultCards.length,
      binCount: dollarBinCards.length,
      dollarBinCount: dollarBinCards.length,
      soldCount: soldCards.length,
      valuedCount: valuedCards.length,
      unpricedCount,
      shopCount,
      ebayCount: ebayCards.length,
      vendorCount,
      psaCount: psaCards.length,
      pcCount,
      binUnder4Count,
      bin1Count,
      bin3Count,
      bin4Count,
      bulkCount: bulkCards.length,
    };
  }, [savedCards]);

  // Triage Status counts for tab filtering badges
  const triageCounts = useMemo(() => {
    const counts: Record<"ALL" | TriageStatus, number> = {
      ALL: savedCards.length,
      INBOX: 0,
      GRADE_CANDIDATE: 0,
      EBAY_RAW: 0,
      DOLLAR_BIN: 0,
      HOLD: 0,
      PC: 0,
    };
    savedCards.forEach((c) => {
      const status = getCardTriageStatus(c);
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });
    return counts;
  }, [savedCards]);

  // Key Uncomped Cards for quick filter & count
  const keyUncompedCards = useMemo(() => {
    return savedCards.filter((c) => getKeyCardFlags(c).isKeyUncomped);
  }, [savedCards]);
  const keyUncompedCount = keyUncompedCards.length;

  const handleToggleKeyUncomped = () => {
    setFilterKeyUncomped((prev) => {
      const next = !prev;
      if (next && selectedTriageStatus !== "ALL" && selectedTriageStatus !== "INBOX") {
        setSelectedTriageStatus("ALL");
      }
      return next;
    });
  };

  // Potential Numbered / Colored Parallels for quick filter & count
  const potentialNumberedCards = useMemo(() => {
    return savedCards.filter((c) => checkPotentialNumberedParallel(c).isPotentialNumbered);
  }, [savedCards]);
  const potentialNumberedCount = potentialNumberedCards.length;

  const handleTogglePotentialNumbered = () => {
    setFilterPotentialNumbered((prev) => {
      const next = !prev;
      if (next && selectedTriageStatus !== "ALL" && selectedTriageStatus !== "INBOX") {
        setSelectedTriageStatus("ALL");
      }
      return next;
    });
  };

  // Unique sports list for filter dropdown
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    savedCards.forEach((c) => {
      if (c.data.sport) set.add(c.data.sport);
    });
    return Array.from(set).sort();
  }, [savedCards]);

  // Unique Batches list grouped by batchId
  const availableBatches = useMemo(() => {
    const batchMap = new Map<string, { batchId: string; batchName: string; count: number; dateAdded: string }>();
    savedCards.forEach((c) => {
      const bId = c.batchId || "legacy_batch";
      const bName = c.batchName || "Initial Saved Batch";
      const existing = batchMap.get(bId);
      if (existing) {
        existing.count += 1;
      } else {
        batchMap.set(bId, {
          batchId: bId,
          batchName: bName,
          count: 1,
          dateAdded: c.dateAdded,
        });
      }
    });
    return Array.from(batchMap.values()).sort(
      (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
    );
  }, [savedCards]);

  // Active batch stats for the selected batch
  const activeBatchStats = useMemo(() => {
    if (selectedBatchId === "all") return null;
    const cards = savedCards.filter(
      (c) => (c.batchId || "legacy_batch") === selectedBatchId
    );
    const vault = cards.filter((c) => isCardInVault(c)).length;
    const bins = cards.filter((c) => !c.isSold && (!!c.binTier || !!c.isBulk || getCardTriageStatus(c) === "DOLLAR_BIN")).length;
    return { total: cards.length, vault, bins };
  }, [savedCards, selectedBatchId]);

  // Select all cards belonging to a specific batch
  const selectBatchCards = (batchId: string) => {
    setSelectedBatchId(batchId);
    if (onBatchFilterChange) {
      onBatchFilterChange(batchId);
    }
    if (batchId === "all") {
      setSelectedIds(new Set());
    } else {
      setInventoryMode("ALL");
      setVaultChannelFilter("ALL");
      setBinTierFilter("ALL");
      const targetCards = savedCards.filter((c) => (c.batchId || "legacy_batch") === batchId);
      setSelectedIds(new Set(targetCards.map((c) => c.id)));
    }
  };

  // Filtered and Sorted collection list
  const filteredCards = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const searchTokens = term.split(/\s+/).filter(Boolean);

    const toStr = (val: any): string => (val !== null && val !== undefined ? String(val).toLowerCase() : "");

    const filtered = savedCards.filter((item) => {
      const card = item.data;
      if (!card) return false;

      const currentTriage = getCardTriageStatus(item);

      // Primary Inventory Mode filter:
      // "ALL" = Complete Active Inventory (eBay Singles, Grading, PC, Shop Case, unclassified collection cards)
      // "WAREHOUSE" = Complete collection across all piles (Bulk, Dollar Bins, Vault)
      let matchesInventoryMode = true;
      if (inventoryMode === "ALL") {
        matchesInventoryMode =
          !item.isSold &&
          !item.isPurged &&
          !item.isDraftOffline &&
          (!item.isBulk && item.binTier !== "PURE_BULK" && item.triageCategory !== "BULK");
      } else if (inventoryMode === "WAREHOUSE") {
        matchesInventoryMode = !item.isSold;
      } else if (inventoryMode === "EBAY") {
        matchesInventoryMode =
          !item.isSold &&
          (item.triageCategory === "EBAY" ||
            item.vaultDestination === "EBAY" ||
            item.selectedChannel === "EBAY" ||
            item.data?.selectedChannel === "EBAY" ||
            (!item.vaultDestination && currentTriage === "EBAY_RAW"));
        if (matchesInventoryMode && ebayBinFilter !== "ALL") {
          const itemBin = item.ebayBinNumber || item.data?.ebayBinNumber || item.locationId;
          matchesInventoryMode = itemBin === ebayBinFilter;
        }
      } else if (inventoryMode === "GRADING") {
        matchesInventoryMode =
          !item.isSold &&
          (item.triageCategory === "GRADING" ||
            item.vaultDestination === "PSA_GRADING" ||
            item.selectedChannel === "GRADE" ||
            item.data?.selectedChannel === "GRADE" ||
            (!item.vaultDestination && currentTriage === "GRADE_CANDIDATE"));
      } else if (inventoryMode === "DOLLAR_BIN") {
        matchesInventoryMode =
          !item.isSold &&
          (item.triageCategory === "DOLLAR_BIN" ||
            item.selectedChannel === "BINS" ||
            item.data?.selectedChannel === "BINS" ||
            (!!item.binTier && item.binTier !== "PURE_BULK") ||
            currentTriage === "DOLLAR_BIN");
        if (matchesInventoryMode && binTierFilter !== "ALL") {
          if (binTierFilter === "BIN_UNDER_4") {
            matchesInventoryMode = item.binTier === "BIN_UNDER_4" || item.binTier === "BIN_1" || item.binTier === "BIN_3" || item.binTier === "BIN_4" || (!item.binTier && item.triageCategory === "DOLLAR_BIN");
          } else {
            matchesInventoryMode = item.binTier === binTierFilter;
          }
        }
      } else if (inventoryMode === "BULK") {
        matchesInventoryMode =
          !item.isSold &&
          (item.triageCategory === "BULK" ||
            item.selectedChannel === "BULK" ||
            item.data?.selectedChannel === "BULK" ||
            item.binTier === "PURE_BULK" ||
            !!item.isBulk);
      } else if (inventoryMode === "VAULT") {
        matchesInventoryMode = isCardInVault(item);
        if (matchesInventoryMode && vaultChannelFilter !== "ALL") {
          if (vaultChannelFilter === "EBAY") {
            matchesInventoryMode =
              item.triageCategory === "EBAY" ||
              item.vaultDestination === "EBAY" ||
              (!item.vaultDestination && currentTriage === "EBAY_RAW");
            if (matchesInventoryMode && ebayBinFilter !== "ALL") {
              const itemBin = item.ebayBinNumber || item.data?.ebayBinNumber || item.locationId;
              matchesInventoryMode = itemBin === ebayBinFilter;
            }
          } else if (vaultChannelFilter === "PSA_GRADING") {
            matchesInventoryMode =
              item.triageCategory === "GRADING" ||
              item.vaultDestination === "PSA_GRADING" ||
              (!item.vaultDestination && currentTriage === "GRADE_CANDIDATE");
          } else if (vaultChannelFilter === "PC") {
            matchesInventoryMode =
              item.vaultDestination === "PC" ||
              (!item.vaultDestination && (currentTriage === "INBOX" || !item.triageStatus));
          } else {
            matchesInventoryMode = item.vaultDestination === vaultChannelFilter;
          }
        }
      } else if (inventoryMode === "BINS") {
        matchesInventoryMode =
          !item.isSold &&
          (item.triageCategory === "DOLLAR_BIN" ||
            item.triageCategory === "BULK" ||
            !!item.binTier ||
            !!item.isBulk ||
            currentTriage === "DOLLAR_BIN");
        if (matchesInventoryMode && binTierFilter !== "ALL") {
          if (binTierFilter === "PURE_BULK") {
            matchesInventoryMode =
              item.triageCategory === "BULK" ||
              item.binTier === "PURE_BULK" ||
              !!item.isBulk ||
              (!item.binTier && currentTriage === "DOLLAR_BIN");
          } else {
            matchesInventoryMode = item.binTier === binTierFilter;
          }
        }
      } else if (inventoryMode === "SOLD") {
        matchesInventoryMode = !!item.isSold;
      }

      const playerName = toStr(card.playerName || (card as any).subject || (card as any).player);
      const brand = toStr(card.brand);
      const setName = toStr(card.setName);
      const team = toStr(card.team);
      const cardNumber = toStr(card.cardNumber);
      const cleanNum = cardNumber.replace(/#/g, "");
      const subsetParallel = toStr(card.subsetParallel);
      const sport = toStr(card.sport);
      const year = toStr(card.year);
      const prefix = toStr(item.prefix);
      const fullTitle = toStr(generateCdpTitle(card));

      const searchableText = `${fullTitle} ${playerName} ${brand} ${setName} ${team} ${cardNumber} ${cleanNum} #${cleanNum} ${subsetParallel} ${sport} ${year} ${prefix}`;
      const matchesSearch =
        searchTokens.length === 0 ||
        searchTokens.every((token) => {
          const cleanToken = token.replace(/^[#]/, "");
          return searchableText.includes(token) || (cleanToken.length > 0 && searchableText.includes(cleanToken));
        });

      const matchesSport = selectedSport === "all" || sport === selectedSport.toLowerCase();
      const matchesBatch =
        selectedBatchId === "all" ||
        item.batchId === selectedBatchId ||
        (!item.batchId && selectedBatchId === "legacy_batch");
      const matchesRookie = !filterRookie || card.isRookie;
      const matchesAuto = !filterAuto || card.isAutographed;
      const matchesMem = !filterMem || card.isMemorabilia;
      const matchesKeyUncomped = !filterKeyUncomped || getKeyCardFlags(item).isKeyUncomped || item.id === lastUpdatedCardId;
      const matchesPotentialNumbered = !filterPotentialNumbered || checkPotentialNumberedParallel(item).isPotentialNumbered;
      const matchesTriage = selectedTriageStatus === "ALL" || currentTriage === selectedTriageStatus;

      return (
        matchesInventoryMode &&
        matchesSearch &&
        matchesSport &&
        matchesBatch &&
        matchesRookie &&
        matchesAuto &&
        matchesMem &&
        matchesTriage &&
        matchesKeyUncomped &&
        matchesPotentialNumbered
      );
    });

    // Sort by active field and direction
    return filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "price") {
        const valA = a.data?.estimatedValue || 0;
        const valB = b.data?.estimatedValue || 0;
        comparison = valA - valB;
      } else if (sortBy === "player") {
        comparison = (a.data?.playerName || "").localeCompare(b.data?.playerName || "");
      } else if (sortBy === "title") {
        comparison = generateCdpTitle(a.data).localeCompare(generateCdpTitle(b.data));
      } else if (sortBy === "year") {
        const yearA = parseInt(String(a.data?.year || 0), 10) || 0;
        const yearB = parseInt(String(b.data?.year || 0), 10) || 0;
        comparison = yearA - yearB;
      } else if (sortBy === "dateAdded") {
        comparison = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      } else if (sortBy === "needsConfirmation") {
        const aNeeds = checkPotentialNumberedParallel(a).isPotentialNumbered ? 1 : 0;
        const bNeeds = checkPotentialNumberedParallel(b).isPotentialNumbered ? 1 : 0;
        comparison = aNeeds - bNeeds;
        if (comparison === 0) {
          comparison = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
        }
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [
    savedCards,
    inventoryMode,
    vaultChannelFilter,
    binTierFilter,
    searchTerm,
    selectedSport,
    selectedBatchId,
    filterRookie,
    filterAuto,
    filterMem,
    filterKeyUncomped,
    filterPotentialNumbered,
    selectedTriageStatus,
    sortBy,
    sortOrder,
    lastUpdatedCardId,
  ]);

  // Count matches across ALL batches regardless of selectedBatchId (to warn user if active batch hides results)
  const totalMatchesAcrossAllBatches = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    const term = searchTerm.toLowerCase().trim();
    const searchTokens = term.split(/\s+/).filter(Boolean);
    const toStr = (val: any): string => (val !== null && val !== undefined ? String(val).toLowerCase() : "");

    return savedCards.filter((item) => {
      const card = item.data;
      if (!card) return false;
      const playerName = toStr(card.playerName || (card as any).subject || (card as any).player);
      const brand = toStr(card.brand);
      const setName = toStr(card.setName);
      const team = toStr(card.team);
      const cardNumber = toStr(card.cardNumber);
      const cleanNum = cardNumber.replace(/#/g, "");
      const subsetParallel = toStr(card.subsetParallel);
      const sport = toStr(card.sport);
      const year = toStr(card.year);
      const prefix = toStr(item.prefix);
      const fullTitle = toStr(generateCdpTitle(card));

      const searchableText = `${fullTitle} ${playerName} ${brand} ${setName} ${team} ${cardNumber} ${cleanNum} #${cleanNum} ${subsetParallel} ${sport} ${year} ${prefix}`;
      return searchTokens.every((token) => {
        const cleanToken = token.replace(/^[#]/, "");
        return searchableText.includes(token) || (cleanToken.length > 0 && searchableText.includes(cleanToken));
      });
    }).length;
  }, [savedCards, searchTerm]);

  // Sort Handler
  const handleHeaderSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(
        field === "price" || field === "year" || field === "dateAdded" || field === "needsConfirmation"
          ? "desc"
          : "asc"
      );
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40 group-hover:opacity-100" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1 text-cyan-400 font-bold" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1 text-cyan-400 font-bold" />
    );
  };

  const handleUpdateStatus = async (cardId: string, newStatus: TriageStatus) => {
    if (updateCardTriageStatus) {
      await updateCardTriageStatus(cardId, newStatus);
    }
  };

  const getCardDecision = (item: SavedCollectionItem): 'GRADE' | 'SELL' | 'HOLD' | 'PC' | null => {
    const triage = item.triageStatus || (item.data as any)?.triageStatus;
    const dest = item.vaultDestination || (item.data as any)?.vaultDestination;

    if (triage === 'GRADE_CANDIDATE' || dest === 'PSA_GRADING') {
      return 'GRADE';
    }
    if (triage === 'EBAY_RAW' || dest === 'EBAY') {
      return 'SELL';
    }
    if (triage === 'HOLD') {
      return 'HOLD';
    }
    if (triage === 'PC') {
      return 'PC';
    }
    return null;
  };

  const handleSetDecision = async (itemId: string, decision: 'GRADE' | 'SELL' | 'HOLD' | 'PC') => {
    const item = savedCards.find((c) => c.id === itemId);
    if (!item) return;

    const current = getCardDecision(item);
    // Clicking the already selected decision toggles it back to undecided (INBOX)
    const targetDecision = current === decision ? null : decision;

    if (!targetDecision) {
      if (updateCardVaultAndBin) {
        await updateCardVaultAndBin(itemId, {
          isVaulted: true,
          vaultDestination: 'PC',
          triageStatus: 'INBOX',
          binTier: undefined,
          isBulk: false,
        });
      } else if (updateCardTriageStatus) {
        await updateCardTriageStatus(itemId, 'INBOX');
      }
      return;
    }

    if (targetDecision === 'GRADE') {
      if (item.dontGrade || item.data?.dontGrade) {
        const reason =
          GRADING_REJECT_REASON_LABELS[((item.gradingRejectReason || item.data?.gradingRejectReason) as GradingRejectReason)] ||
          item.gradingRejectReason ||
          item.data?.gradingRejectReason ||
          "Condition / Value Flaw";
        const notes = item.gradingRejectNotes || item.data?.gradingRejectNotes || "No notes recorded";
        const confirmed = window.confirm(
          `⚠️ DO NOT GRADE WARNING:\n\nThis card was previously marked DO NOT GRADE due to:\n${reason}\n\nInspector Notes:\n"${notes}"\n\nDo you still want to send this card to Grading for re-evaluation?`
        );
        if (!confirmed) return;
      }

      if (updateCardVaultAndBin) {
        await updateCardVaultAndBin(itemId, {
          isVaulted: true,
          vaultDestination: 'PSA_GRADING',
          triageStatus: 'GRADE_CANDIDATE',
          binTier: undefined,
          isBulk: false,
          dontGrade: false,
          gradingStage: 'CHECK_ROI' as GradingStage,
        });
      } else if (updateCardTriageStatus) {
        await updateCardTriageStatus(itemId, 'GRADE_CANDIDATE');
      }
    } else if (targetDecision === 'SELL') {
      if (updateCardVaultAndBin) {
        await updateCardVaultAndBin(itemId, {
          isVaulted: true,
          vaultDestination: 'EBAY',
          triageStatus: 'EBAY_RAW',
          binTier: undefined,
          isBulk: false,
        });
      } else if (updateCardTriageStatus) {
        await updateCardTriageStatus(itemId, 'EBAY_RAW');
      }
    } else if (targetDecision === 'HOLD') {
      if (updateCardVaultAndBin) {
        await updateCardVaultAndBin(itemId, {
          isVaulted: true,
          vaultDestination: 'PC',
          triageStatus: 'HOLD',
          binTier: undefined,
          isBulk: false,
        });
      } else if (updateCardTriageStatus) {
        await updateCardTriageStatus(itemId, 'HOLD');
      }
    } else if (targetDecision === 'PC') {
      if (updateCardVaultAndBin) {
        await updateCardVaultAndBin(itemId, {
          isVaulted: true,
          vaultDestination: 'PC',
          triageStatus: 'PC',
          binTier: undefined,
          isBulk: false,
        });
      } else if (updateCardTriageStatus) {
        await updateCardTriageStatus(itemId, 'PC');
      }
    }
  };

  // Selection Handlers (Supports Tab / Shift Range Selection)
  const toggleSelectCard = (id: string, e?: React.MouseEvent) => {
    const isMultiOrRange = e && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTabHeld);

    if (isMultiOrRange && lastSelectedId && lastSelectedId !== id) {
      const idx1 = filteredCards.findIndex((c) => c.id === lastSelectedId);
      const idx2 = filteredCards.findIndex((c) => c.id === id);

      if (idx1 >= 0 && idx2 >= 0) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const rangeIds = filteredCards.slice(start, end + 1).map((c) => c.id);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rId) => next.add(rId));
          return next;
        });
        setLastSelectedId(id);
        return;
      }
    }

    // Standard toggle
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
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
    // Strictly select unpriced Vault singles
    const unpricedVault = savedCards.filter(
      (c) => isCardInVault(c) && (c.data.estimatedValue === undefined || c.data.estimatedValue <= 0)
    );
    setSelectedIds(new Set(unpricedVault.map((c) => c.id)));
  };

  // Cards in collection that qualify for grading but haven't been comped out yet
  const uncompedGradingCards = useMemo(() => {
    return savedCards.filter((c) => {
      const status = getCardTriageStatus(c);
      const isGradingCandidate = status === "GRADE_CANDIDATE" || c.vaultDestination === "PSA_GRADING";
      const isUncomped =
        c.data.estimatedValue === undefined ||
        c.data.estimatedValue <= 0 ||
        !c.data.gradingAnalysis?.psa10Value ||
        !c.data.gradingAnalysis?.lastEvaluated;
      return isGradingCandidate && isUncomped && isCardInVault(c);
    });
  }, [savedCards]);

  // Unmatched cards in Vault that need auto-adjustment to find comps (needs_review or unpriced)
  const unmatchedVaultCards = useMemo(() => {
    return savedCards.filter((c) => {
      if (!isCardInVault(c)) return false;
      const isUnpriced = !c.data.estimatedValue || c.data.estimatedValue <= 0;
      const isNeedsReview = c.data.compStatus === "needs_review";
      return isUnpriced || isNeedsReview;
    });
  }, [savedCards]);

  // 1-Click Auto-Adjust & Match Single Card
  const [autoAdjustingCardId, setAutoAdjustingCardId] = useState<string | null>(null);

  const handleAutoAdjustSingleCard = async (cardItem: SavedCollectionItem) => {
    if (autoAdjustingCardId || isBulkRunning) return;
    setAutoAdjustingCardId(cardItem.id);
    const cardTitle = sanitizeCompQuery(cardItem.data) || generateCdpTitle(cardItem.data);
    const waterfall = generateWaterfallQueries(cardItem.data);
    const autoQuery =
      waterfall.autoAdjustTiers.find((t) => t.id === "auto_adjust_all")?.query ||
      waterfall.playerParallelQuery ||
      waterfall.dropNumberQuery ||
      cardTitle;

    setBulkSummaryMessage(`⚡ Auto-adjusting title & finding comps for ${cardItem.data.playerName || "card"}...`);

    try {
      const res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: autoQuery, cardData: cardItem.data, fast: false }),
      });

      if (res.ok) {
        const compsData = await res.json();
        const estVal = compsData.price || compsData.estimatedMarketValue || compsData.medianPrice || 0;
        if (estVal > 0) {
          const oldVal = cardItem.data.estimatedValue || 0;
          const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
          const deltaPct = oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

          const updatedData: CDPCardSchema = {
            ...cardItem.data,
            previousEstimatedValue: oldVal > 0 ? oldVal : cardItem.data.previousEstimatedValue,
            estimatedValue: estVal,
            rawEstimatedValue: estVal,
            compStatus: "success",
            compIsBaseEstimate: !!compsData.compIsBaseEstimate,
            autoAdjusted: true,
            matchedStage: compsData.matchedStage || "auto_adjust_all",
            adjustedFields: compsData.adjustedFields,
            priceChange: deltaDollar,
            priceChangePercentage: deltaPct,
            valueLastUpdated: new Date().toISOString(),
            lastPriceRefreshedAt: new Date().toISOString(),
            lastCompDate: new Date().toISOString(),
          };

          if (updateSavedCardDataBatch) {
            updateSavedCardDataBatch([{ id: cardItem.id, data: updatedData }]);
          }

          setBulkSummaryMessage(
            `✓ Auto-adjusted! Found market value $${estVal.toFixed(2)} for ${cardItem.data.playerName || "card"} (${compsData.adjustmentReason || "Title adjusted"})`
          );
          setTimeout(() => setBulkSummaryMessage(null), 5000);
          return;
        }
      }
      setBulkSummaryMessage(`Could not find active comps even with auto-adjust for ${cardItem.data.playerName || "card"}.`);
      setTimeout(() => setBulkSummaryMessage(null), 4000);
    } catch (err) {
      console.error("Auto-adjust failed:", err);
      setBulkSummaryMessage("Auto-adjust lookup failed. Please check connection and retry.");
      setTimeout(() => setBulkSummaryMessage(null), 4000);
    } finally {
      setAutoAdjustingCardId(null);
    }
  };

  const handleExportCSV = () => {
    const quota = checkQuota("csvExportBatchLimit", filteredCards.length);
    if (!quota.allowed) {
      openPaywall(
        `Your plan allows exporting up to ${quota.max} cards per CSV batch (${filteredCards.length} currently selected). Upgrade to export unlimited collections without limits.`,
        "STARTER"
      );
      return;
    }
    exportSavedCollectionToCSV(filteredCards, `my_card_collection_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Compute gainers & fallers for widget
  const { gainers, fallers, hasPriceHistory } = useMemo(() => {
    return computeGainersAndFallers(savedCards.filter((c) => isCardInVault(c)));
  }, [savedCards]);

  // Inventory Separation State & Handler
  const [isSeparating, setIsSeparating] = useState(false);

  const handleExecuteInventorySeparation = async () => {
    if (savedCards.length === 0 || isSeparating) return;
    setIsSeparating(true);
    try {
      const result = await separateInventory(savedCards, userSettings, currentUser?.uid);
      if (updateCardsVaultAndBinBatch) {
        await updateCardsVaultAndBinBatch(result.updates);
      }
      setBulkSummaryMessage(
        `⚡ Inventory Separated! ${result.stats.vaultCount} cards kept in The Vault (eBay: ${result.stats.ebaySinglesCount}, PSA: ${result.stats.gradingCount}, PC: ${result.stats.pcCount}) • ${result.stats.totalBinsCount} cards moved to Value Bins & Bulk ($1: ${result.stats.bin1Count}, $3: ${result.stats.bin3Count}, $4+: ${result.stats.bin4Count}, Bulk: ${result.stats.bulkCount}). Rerunning comps now strictly evaluates Vault singles.`
      );
      setTimeout(() => setBulkSummaryMessage(null), 9000);
    } catch (err) {
      console.error("Failed to separate inventory:", err);
      setBulkSummaryMessage("Failed to separate inventory. Please check connection and retry.");
      setTimeout(() => setBulkSummaryMessage(null), 5000);
    } finally {
      setIsSeparating(false);
    }
  };

  // Rate-limited Bulk Comps Execution Engine with Price Delta Tracking
  // STRICTLY EVALUATES CARDS ACTIVE IN THE VAULT (eBay singles, PSA Grading, PC)
  const handleRunBulkComps = async (customCards?: SavedCollectionItem[] | any) => {
    const validCustom = Array.isArray(customCards) ? customCards : undefined;
    let targetPool = validCustom || savedCards.filter((c) => selectedIds.has(c.id));

    // If no cards were specifically selected or passed in, auto-target unpriced Vault cards (or all Vault cards if all priced)
    if (targetPool.length === 0) {
      const unpriced = filteredCards.filter((c) => isCardInVault(c) && (!c.data.estimatedValue || c.data.estimatedValue === 0));
      targetPool = unpriced.length > 0 ? unpriced : filteredCards.filter((c) => isCardInVault(c));
    }

    // CRITICAL: Rerun comps ONLY on cards active in The Vault
    const cardsToValuate = targetPool.filter((c) => isCardInVault(c));
    if (cardsToValuate.length === 0) {
      if (targetPool.length > 0) {
        setBulkSummaryMessage(
          "Sales comps rerun exclusively on Vault cards (eBay Singles, PSA Grading, and PC). Selected cards are in Value Bins / Bulk and excluded from market comps."
        );
        setTimeout(() => setBulkSummaryMessage(null), 6000);
      } else {
        setBulkSummaryMessage("No Vault cards found to comp in current view.");
        setTimeout(() => setBulkSummaryMessage(null), 4000);
      }
      return;
    }
    if (isBulkRunning) return;

    setIsBulkRunning(true);
    setBulkCancelRequested(false);
    setBulkSummaryMessage(null);

    const total = cardsToValuate.length;
    let pricedSuccessfully = 0;
    const pendingUpdates: { id: string; data: CDPCardSchema }[] = [];
    const BATCH_CONCURRENCY = 4;

    for (let i = 0; i < total; i += BATCH_CONCURRENCY) {
      if (bulkCancelRequested) break;

      const chunk = cardsToValuate.slice(i, i + BATCH_CONCURRENCY);
      const leadItem = chunk[0];
      const leadTitle = sanitizeCompQuery(leadItem.data) || generateCdpTitle(leadItem.data);

      setBulkProgress({
        current: Math.min(i + chunk.length, total),
        total,
        currentTitle: leadTitle,
        pricedCount: pricedSuccessfully,
      });

      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const cardTitle = sanitizeCompQuery(item.data) || generateCdpTitle(item.data);
          try {
            const res = await fetch("/api/comps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: cardTitle, cardData: item.data, fast: true }),
            });

            if (res.ok) {
              const compsData = await res.json();
              let finalCompsData = compsData;
              let status = finalCompsData.status || (finalCompsData.price > 0 ? "success" : "needs_review");
              let estVal = finalCompsData.price || finalCompsData.estimatedMarketValue || finalCompsData.medianPrice || 0;

              // Automated Auto-Adjust Retry: If 0 comps were found, automatically retry with auto_adjust_all query to get a match!
              if (estVal === 0) {
                const waterfall = generateWaterfallQueries(item.data);
                const autoQuery =
                  waterfall.autoAdjustTiers.find((t) => t.id === "auto_adjust_all")?.query ||
                  waterfall.playerParallelQuery ||
                  waterfall.dropNumberQuery;
                if (autoQuery && autoQuery !== cardTitle) {
                  try {
                    const retryRes = await fetch("/api/comps", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ query: autoQuery, cardData: item.data, fast: true }),
                    });
                    if (retryRes.ok) {
                      const retryData = await retryRes.json();
                      const retryVal = retryData.price || retryData.estimatedMarketValue || retryData.medianPrice || 0;
                      if (retryVal > 0) {
                        finalCompsData = retryData;
                        status = "success";
                        estVal = retryVal;
                      }
                    }
                  } catch {
                    // Fallthrough to needs_review
                  }
                }
              }

              if (status === "success" && estVal > 0) {
                const oldVal = item.data.estimatedValue || 0;
                const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
                const deltaPct =
                  oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

                const updatedData: CDPCardSchema = {
                  ...item.data,
                  previousEstimatedValue: oldVal > 0 ? oldVal : item.data.previousEstimatedValue,
                  estimatedValue: estVal,
                  rawEstimatedValue: estVal,
                  compStatus: "success",
                  compIsBaseEstimate: !!finalCompsData.compIsBaseEstimate,
                  autoAdjusted: !!finalCompsData.autoAdjusted,
                  matchedStage: finalCompsData.matchedStage,
                  adjustedFields: finalCompsData.adjustedFields,
                  priceChange: deltaDollar,
                  priceChangePercentage: deltaPct,
                  valueLastUpdated: new Date().toISOString(),
                  lastPriceRefreshedAt: new Date().toISOString(),
                  lastCompDate: new Date().toISOString(),
                };
                return { id: item.id, data: updatedData, success: true };
              } else {
                // status === 'needs_review' or 0 comps found
                const updatedData: CDPCardSchema = {
                  ...item.data,
                  estimatedValue: 0,
                  rawEstimatedValue: 0,
                  compStatus: "needs_review",
                  compIsBaseEstimate: false,
                  valueLastUpdated: new Date().toISOString(),
                  lastPriceRefreshedAt: new Date().toISOString(),
                };
                return { id: item.id, data: updatedData, success: false };
              }
            }
          } catch (err) {
            console.error(`Failed to fetch comps for ${cardTitle}:`, err);
          }
          return null;
        })
      );

      // Optimistic row updates: apply updates for this batch immediately!
      const validChunk = chunkResults.filter(Boolean) as {
        id: string;
        data: CDPCardSchema;
        success: boolean;
      }[];

      if (validChunk.length > 0) {
        for (const res of validChunk) {
          pendingUpdates.push({ id: res.id, data: res.data });
          if (res.success) pricedSuccessfully++;
        }
        if (updateSavedCardDataBatch) {
          updateSavedCardDataBatch(validChunk.map((c) => ({ id: c.id, data: c.data })));
        }
      }

      setBulkProgress({
        current: Math.min(i + chunk.length, total),
        total,
        currentTitle: leadTitle,
        pricedCount: pricedSuccessfully,
      });
    }

    if (pendingUpdates.length > 0) {
      // Record snapshot strictly for Vault cards
      const vaultCards = savedCards.filter((c) => isCardInVault(c));
      const newTotal = vaultCards.reduce((sum, c) => {
        const matching = pendingUpdates.find((u) => u.id === c.id);
        return sum + (matching ? matching.data.estimatedValue || 0 : c.data.estimatedValue || 0);
      }, 0);

      recordPortfolioSnapshot(
        currentUser?.uid,
        newTotal,
        vaultCards.length,
        pendingUpdates.length,
        "Vault Comps Refresh"
      ).then((snap) => {
        setSnapshots((prev) => [...prev, snap]);
      });
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    setBulkSummaryMessage(
      `Completed valuation! Applied market values to ${pricedSuccessfully} of ${total} Vault singles.`
    );
    setTimeout(() => setBulkSummaryMessage(null), 5000);
  };

  // Batch Move Selected Cards to any Destination (eBay, PSA, PC, Shop Case, Bins, Bulk)
  const handleBatchMoveSelected = async (targetDest: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let updates: {
      id: string;
      vaultDestination?: VaultDestination;
      binTier?: BinTier;
      isVaulted?: boolean;
      isBulk?: boolean;
      triageStatus?: TriageStatus;
    }[] = [];

    if (targetDest === "EBAY") {
      updates = ids.map((id) => ({
        id,
        vaultDestination: "EBAY",
        binTier: undefined,
        isVaulted: true,
        isBulk: false,
        triageStatus: "EBAY_RAW",
      }));
    } else if (targetDest === "PSA_GRADING") {
      const rejectedCards = savedCards.filter(
        (c) => ids.includes(c.id) && (c.dontGrade || c.data?.dontGrade)
      );
      if (rejectedCards.length > 0) {
        const confirmed = window.confirm(
          `⚠️ DO NOT GRADE WARNING:\n\n${rejectedCards.length} of the ${ids.length} selected cards were previously marked DO NOT GRADE due to physical condition flaws or low margins.\n\nDo you still want to send them to Grading for re-evaluation?`
        );
        if (!confirmed) return;
      }

      updates = ids.map((id) => ({
        id,
        vaultDestination: "PSA_GRADING",
        binTier: undefined,
        isVaulted: true,
        isBulk: false,
        triageStatus: "GRADE_CANDIDATE",
        gradingStage: "CHECK_ROI",
        dontGrade: false,
      }));
    } else if (targetDest === "PC") {
      updates = ids.map((id) => ({
        id,
        vaultDestination: "PC",
        binTier: undefined,
        isVaulted: true,
        isBulk: false,
        triageStatus: "INBOX",
      }));
    } else if (targetDest === "SHOP_CASE") {
      updates = ids.map((id) => ({
        id,
        vaultDestination: "SHOP_CASE",
        binTier: undefined,
        isVaulted: true,
        isBulk: false,
        triageStatus: "INBOX",
      }));
    } else if (targetDest.startsWith("BIN_") || targetDest === "PURE_BULK") {
      const tier = targetDest as BinTier;
      updates = ids.map((id) => ({
        id,
        vaultDestination: undefined,
        binTier: tier,
        isVaulted: false,
        isBulk: tier === "PURE_BULK",
        triageStatus: "DOLLAR_BIN",
      }));
    }

    try {
      if (updateCardsVaultAndBinBatch) {
        await updateCardsVaultAndBinBatch(updates);
      } else if (updateCardVaultAndBin) {
        for (const u of updates) {
          await updateCardVaultAndBin(u.id, u);
        }
      }

      const destLabel =
        targetDest === "EBAY"
          ? "eBay Singles Queue"
          : targetDest === "PSA_GRADING"
          ? "PSA Grading Queue"
          : targetDest === "PC"
          ? "Personal Collection (PC)"
          : targetDest === "SHOP_CASE"
          ? "Shop Showcase"
          : targetDest === "BIN_UNDER_4" || targetDest === "BIN_1" || targetDest === "BIN_3" || targetDest === "BIN_4"
          ? "<$4 Bins (Value Bins)"
          : "Bulk Box Desk";

      setBulkSummaryMessage(`Moved ${ids.length} card${ids.length === 1 ? "" : "s"} to ${destLabel}!`);
      setTimeout(() => setBulkSummaryMessage(null), 4000);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Batch move error:", err);
      setBulkSummaryMessage("Failed to move selected cards. Please try again.");
      setTimeout(() => setBulkSummaryMessage(null), 4000);
    }
  };

  // Dedicated Full Portfolio Market Refresh Handler (Weekly / Monthly Sync)
  // STRICTLY REFRESHES ACTIVE VAULT SINGLES
  const handleRefreshPortfolioPrices = async () => {
    if (savedCards.length === 0 || isRefreshingMarket) return;

    // CRITICAL: Comps rerun strictly on cards active in The Vault
    const vaultCards = savedCards.filter((c) => isCardInVault(c));
    if (vaultCards.length === 0) {
      setBulkSummaryMessage("No active Vault singles found to refresh. Value Bins and Bulk cards are excluded from comps.");
      setTimeout(() => setBulkSummaryMessage(null), 5000);
      return;
    }

    setIsRefreshingMarket(true);
    setBulkSummaryMessage("Syncing latest eBay market comps for Vault singles (eBay, Grading, PC)...");

    const cardsToRefresh = vaultCards.slice(0, 25); // Refresh top 25 Vault singles
    const pendingUpdates: { id: string; data: CDPCardSchema }[] = [];
    const BATCH_CONCURRENCY = 4;

    for (let i = 0; i < cardsToRefresh.length; i += BATCH_CONCURRENCY) {
      const chunk = cardsToRefresh.slice(i, i + BATCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const cardTitle = sanitizeCompQuery(item.data) || generateCdpTitle(item.data);
          try {
            const res = await fetch("/api/comps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: cardTitle, cardData: item.data, fast: true }),
            });

            if (res.ok) {
              const compsData = await res.json();
              const status = compsData.status || (compsData.price > 0 ? "success" : "needs_review");
              const estVal = compsData.price || compsData.estimatedMarketValue || compsData.medianPrice || 0;

              if (status === "success" && estVal > 0) {
                const oldVal = item.data.estimatedValue || 0;
                const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
                const deltaPct =
                  oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

                const updatedData: CDPCardSchema = {
                  ...item.data,
                  previousEstimatedValue: oldVal > 0 ? oldVal : item.data.previousEstimatedValue,
                  estimatedValue: estVal,
                  rawEstimatedValue: estVal,
                  compStatus: "success",
                  priceChange: deltaDollar,
                  priceChangePercentage: deltaPct,
                  valueLastUpdated: new Date().toISOString(),
                  lastPriceRefreshedAt: new Date().toISOString(),
                  lastCompDate: new Date().toISOString(),
                };
                return { id: item.id, data: updatedData };
              } else {
                const updatedData: CDPCardSchema = {
                  ...item.data,
                  estimatedValue: 0,
                  rawEstimatedValue: 0,
                  compStatus: "needs_review",
                  valueLastUpdated: new Date().toISOString(),
                  lastPriceRefreshedAt: new Date().toISOString(),
                };
                return { id: item.id, data: updatedData };
              }
            }
          } catch {
            // Continue
          }
          return null;
        })
      );

      const validChunk = chunkResults.filter(Boolean) as { id: string; data: CDPCardSchema }[];
      for (const res of validChunk) {
        pendingUpdates.push(res);
      }
      if (validChunk.length > 0 && updateSavedCardDataBatch) {
        updateSavedCardDataBatch(validChunk);
      }
    }

    if (pendingUpdates.length > 0 && updateSavedCardDataBatch) {
      updateSavedCardDataBatch(pendingUpdates);

      const newTotal = vaultCards.reduce((sum, c) => {
        const matching = pendingUpdates.find((u) => u.id === c.id);
        return sum + (matching ? matching.data.estimatedValue || 0 : c.data.estimatedValue || 0);
      }, 0);

      recordPortfolioSnapshot(
        currentUser?.uid,
        newTotal,
        vaultCards.length,
        pendingUpdates.length,
        "Periodic Vault Comps Refresh"
      ).then((snap) => {
        setSnapshots((prev) => [...prev, snap]);
      });
    }

    setIsRefreshingMarket(false);
    setBulkSummaryMessage("Vault market comps updated successfully!");
    setTimeout(() => setBulkSummaryMessage(null), 4000);
  };

  // Instant Simulation of Market Movement (Test Weekly/Monthly Gains & Drops)
  const handleSimulatePriceUpdate = () => {
    if (savedCards.length === 0) {
      setBulkSummaryMessage("Scan or add cards in the Batch Scanner to track portfolio value and market gainers!");
      setTimeout(() => setBulkSummaryMessage(null), 4000);
      return;
    }

    const pendingUpdates: { id: string; data: CDPCardSchema }[] = [];

    savedCards.forEach((c, idx) => {
      const current = c.data.estimatedValue || 25.0;
      // Alternate between gainers and fallers
      // Cards at idx % 2 === 0 gain +6% to +28%
      // Cards at idx % 2 === 1 dip -4% to -18%
      let variance = 0.05;
      if (idx % 2 === 0) {
        variance = 0.08 + (idx % 4) * 0.05; // +8%, +13%, +18%, +23%
      } else {
        variance = -(0.05 + (idx % 3) * 0.04); // -5%, -9%, -13%
      }

      const newPrice = Math.max(1, Math.round(current * (1 + variance) * 100) / 100);
      const deltaDollar = Math.round((newPrice - current) * 100) / 100;
      const deltaPct = Math.round(((newPrice - current) / current) * 1000) / 10;

      pendingUpdates.push({
        id: c.id,
        data: {
          ...c.data,
          previousEstimatedValue: current,
          estimatedValue: newPrice,
          priceChange: deltaDollar,
          priceChangePercentage: deltaPct,
          valueLastUpdated: new Date().toISOString(),
          lastPriceRefreshedAt: new Date().toISOString(),
          lastCompDate: new Date().toISOString(),
        },
      });
    });

    if (updateSavedCardDataBatch) {
      updateSavedCardDataBatch(pendingUpdates);
    }

    const newTotal = pendingUpdates.reduce(
      (sum, p) => sum + (p.data.estimatedValue || 0),
      0
    );

    recordPortfolioSnapshot(
      currentUser?.uid,
      newTotal,
      savedCards.length,
      pendingUpdates.length,
      "Simulated Market Movement"
    ).then((snap) => {
      setSnapshots((prev) => [...prev, snap]);
    });

    setBulkSummaryMessage(
      `Market movement simulated! Updated prices across ${pendingUpdates.length} cards with top gainers & fallers.`
    );
    setTimeout(() => setBulkSummaryMessage(null), 5000);
  };

  return (
    <div className="space-y-8">
      {/* DEALER WORKFLOW PIPELINE: Ingest > Master Collection > Workbench (eBay, Grading, Bulk, Bins) */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900/95 via-cyan-950/20 to-slate-900/95 p-4 sm:p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                Dealer Workflow Architecture
              </span>
              <span className="text-xs text-slate-300 font-bold">
                1. Ingest ➔ 2. Master Collection ➔ 3. Workbench Desks
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              <strong className="text-white">The Vault</strong> strictly counts cards categorized under{" "}
              <strong className="text-cyan-300">eBay Singles Desk</strong> and{" "}
              <strong className="text-purple-300">PSA Grading Desk</strong> (which receive active live pricing &amp; market comps).{" "}
              <strong className="text-amber-300">Show Bins</strong> and{" "}
              <strong className="text-rose-300">Bulk Box</strong> do <em className="text-white not-italic font-bold">not</em> count towards the Vault — they are sorted physically and only removed from the platform once sorted.
            </p>
          </div>

          {/* Quick Desk Navigation Jumpers */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {onNavigateToScanner && (
              <button
                type="button"
                onClick={onNavigateToScanner}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                title="Go to Ingest / Batch Scanner"
              >
                <span>1. Ingest</span>
              </button>
            )}
            <div className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 text-xs font-mono font-bold text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5">
              <span>2. Master Collection</span>
            </div>
            {onNavigateToEbay && (
              <button
                type="button"
                onClick={onNavigateToEbay}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-xs font-mono font-bold text-indigo-300 border border-indigo-500/30 transition flex items-center gap-1 cursor-pointer"
                title="Open eBay Singles Desk (The Vault • Live Auto-Comps)"
              >
                <span>🏷️ eBay Desk</span>
              </button>
            )}
            {onNavigateToGrading && (
              <button
                type="button"
                onClick={onNavigateToGrading}
                className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-xs font-mono font-bold text-purple-300 border border-purple-500/30 transition flex items-center gap-1 cursor-pointer"
                title="Open PSA Grading Desk (The Vault • ROI Engine)"
              >
                <span>🔬 Grading Desk</span>
              </button>
            )}
            {onNavigateToBins && (
              <button
                type="button"
                onClick={onNavigateToBins}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-xs font-mono font-bold text-amber-300 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer"
                title="Open Show Bins & Bulk Outflow (0 Vault Quota • Sort & Remove)"
              >
                <span>📦 Bins &amp; Bulk</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* ACTIVE STAGED BATCH BANNER: Alerts user when cards are sitting in Scanner awaiting checkoff */}
      {stagedCount > 0 && (
        <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/50 via-slate-900/90 to-amber-950/50 p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-xl animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-amber-200">
                  {stagedCount} Card{stagedCount > 1 ? "s" : ""} Staged in Batch Scanner
                </h4>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {isFreeOrStarter ? "Ready to Add" : "Awaiting Review & Route"}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {isFreeOrStarter
                  ? "Uploaded cards are identified and ready to be saved directly to your Personal Collection."
                  : "Uploaded cards remain in the Scanner intake desk until confirmed. Complete batch routing to move them into Master Inventory."}
              </p>
            </div>
          </div>
          {onNavigateToScanner && (
            <button
              type="button"
              onClick={onNavigateToScanner}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/25 transition active:scale-95 shrink-0 cursor-pointer"
            >
              <span>
                {isFreeOrStarter
                  ? `Add to Collection (${stagedCount}) →`
                  : `Go to Batch Scanner & Route (${stagedCount}) →`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* SECTION 1: MARKET PERFORMANCE & VALUATION DRAWER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl transition hover:border-slate-700 shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAnalyticsDrawer(!showAnalyticsDrawer)}
          className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                  Market Performance &amp; Portfolio History
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  ${stats.vaultPortfolioValue.toFixed(2)} Hits Value
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Robinhood-style valuation graph, market comps simulation, and gainers &amp; fallers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-400 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl hover:bg-cyan-500/10 hover:border-cyan-500/40 transition">
            <span>{showAnalyticsDrawer ? "Collapse Graph ▲" : "Expand Graph & Gainers ▼"}</span>
          </div>
        </button>

        {showAnalyticsDrawer && (
          <div className="p-4 pt-2 space-y-6 border-t border-slate-800/80 animate-in fade-in">
            <FeatureGate
              feature="portfolioHistoricalCharts"
              targetPlan="STARTER"
              customLockedTitle="Unlock Historical Portfolio Timeline"
              customBlurredDescription="Reveals multi-timeframe portfolio performance curves, value trajectories, and price trendlines."
            >
              <PortfolioChart
                totalValue={stats.portfolioValue}
                cardCount={stats.total}
                pricedCount={stats.valuedCount}
                snapshots={snapshots}
                onRefreshPrices={handleRefreshPortfolioPrices}
                onSimulatePriceUpdate={handleSimulatePriceUpdate}
                isRefreshing={isRefreshingMarket}
              />
            </FeatureGate>

            <FeatureGate
              feature="gainersFallersWidget"
              targetPlan="STARTER"
              customLockedTitle="Unlock Top Gainers & Fallers Radar"
              customBlurredDescription="Track biggest market percentage gainers and daily declining cards in real-time."
            >
              <GainersFallersWidget
                gainers={gainers}
                fallers={fallers}
                hasPriceHistory={hasPriceHistory}
                onInspectCard={onInspectCard}
                onSimulatePriceUpdate={handleSimulatePriceUpdate}
              />
            </FeatureGate>
          </div>
        )}
      </div>

      {/* SECTION 1.5: INVENTORY SEPARATION GATEWAY (GATED FOR DEALERS) */}
      {getGateMode("tabBins") !== "hidden" && (
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/70 via-slate-900/90 to-purple-950/70 p-4 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-white tracking-wide">
                  Inventory Separation Gateway
                </h3>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  The Vault vs. Value Bins &amp; Bulk
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {stats.vaultCount} Vault Hits • {stats.binCount} in Bins &amp; Bulk
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Strictly keeps <strong className="text-white">eBay Singles</strong>, <strong className="text-white">PSA Grading</strong>, and <strong className="text-white">PC</strong> in The Vault. Moves all other cards over to <strong className="text-cyan-300">Value Bins &amp; Bulk</strong>. Rerunning comps evaluates <strong className="text-amber-300">only cards in your Vault</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
            {onNavigateToBins && (
              <button
                type="button"
                onClick={onNavigateToBins}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <Box className="h-3.5 w-3.5 text-cyan-400" />
                <span>View Bins &amp; Bulk ({stats.binCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExecuteInventorySeparation}
              disabled={isSeparating || savedCards.length === 0}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Separate all cards now: eBay singles, PSA grading, and PC stay in Vault; others move to Bins & Bulk"
            >
              <Zap className="h-4 w-4 fill-amber-300 text-amber-300" />
              <span>{isSeparating ? "Separating Inventory..." : "Separate Inventory Now"}</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1.7: COLLECTION VALUE & FINANCIAL TRACKER */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-slate-950 p-4 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-black uppercase tracking-wider text-cyan-400">
                Collection Valuation &amp; P&amp;L Performance
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" title="Active curated Vault collection">
                {isDealer || getGateMode("tabBins") !== "hidden" ? `${stats.activeCount} Active Vault Cards` : `${stats.total} Total Cards Tracked`}
              </span>
              {stats.binCount > 0 && getGateMode("tabBins") !== "hidden" && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Value Show Bins ($1, $3, $4) - Unmetered physical show stock">
                  {stats.binCount} Dollar Bins (~${stats.binPortfolioValue.toFixed(2)})
                </span>
              )}
              {stats.bulkCount > 0 && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20" title="Bulk Commons (< $1.00) - 0 Vault Quota Consumed">
                  {stats.bulkCount} {isDealer ? "Bulk (Boxed Outflow)" : "Bulk Stash"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Live comps vs. purchase cost basis. Mark cards as sold to log realized flip profits.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {/* Total Market Value */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5">
              <p className="text-[10px] font-mono uppercase text-slate-400">Collection Value</p>
              <p className="text-base font-black font-mono text-cyan-300">
                ${stats.portfolioValue.toFixed(2)}
              </p>
            </div>

            {/* Total Invested */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5">
              <p className="text-[10px] font-mono uppercase text-slate-400">Cost Basis (Bought)</p>
              <p className="text-base font-black font-mono text-slate-200">
                ${stats.totalInvested.toFixed(2)}
              </p>
            </div>

            {/* Unrealized Profit */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5">
              <p className="text-[10px] font-mono uppercase text-slate-400">Unrealized Gain</p>
              <p className={`text-base font-black font-mono ${stats.unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {stats.unrealizedGain >= 0 ? "+" : ""}${stats.unrealizedGain.toFixed(2)}
                <span className="text-[10px] font-normal text-slate-400 block sm:inline sm:ml-1">
                  ({stats.unrealizedGain >= 0 ? "+" : ""}{stats.unrealizedRoiPct.toFixed(1)}%)
                </span>
              </p>
            </div>

            {/* Realized Sold Profit */}
            <div
              onClick={() => setInventoryMode(inventoryMode === "SOLD" ? "ALL" : "SOLD")}
              className={`rounded-xl border p-2.5 cursor-pointer transition ${
                inventoryMode === "SOLD"
                  ? "bg-emerald-950/60 border-emerald-500/70 ring-1 ring-emerald-500/50"
                  : "bg-slate-950 border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-950/20"
              }`}
              title="Click to toggle Sold Cards view"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-emerald-400">Realized Profit</p>
                <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded">
                  {stats.soldCount} Sold
                </span>
              </div>
              <p className="text-base font-black font-mono text-emerald-400">
                +${stats.totalRealizedProfit.toFixed(2)}
              </p>
            </div>
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
              className="text-xs font-mono font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
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
          <button onClick={() => setBulkSummaryMessage(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            Dismiss ✕
          </button>
        </div>
      )}

      {/* SECTION 2: SMART VIEWS & WAREHOUSE CHANNELS */}
      {getGateMode("channelNavigationFilters") !== "hidden" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 px-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-slate-300">
                Smart Views &amp; Channels
              </h3>
              <span className="text-[10px] font-mono text-slate-500">
                ({stats.total} total items)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setInventoryMode("VAULT");
                  setVaultChannelFilter("ALL");
                  setBinTierFilter("ALL");
                }}
                className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                  inventoryMode === "VAULT" && vaultChannelFilter === "ALL"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Show all active Vault singles"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>All Vault Hits ({stats.vaultCount}) • ${stats.vaultPortfolioValue.toFixed(2)}</span>
              </button>
              {(inventoryMode !== "ALL" || vaultChannelFilter !== "ALL" || binTierFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setInventoryMode("ALL");
                    setVaultChannelFilter("ALL");
                    setBinTierFilter("ALL");
                  }}
                  className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Reset View ✕
                </button>
              )}
            </div>
          </div>

          {/* Unified Channel Navigation Bar with Metrics */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl shadow-xl">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin flex-1">
              {[
                {
                  id: "ALL",
                  label: isDealer || getGateMode("tabBins") !== "hidden"
                    ? `Active Vault`
                    : `Personal Collection`,
                  count: isDealer || getGateMode("tabBins") !== "hidden" ? stats.activeCount : stats.total,
                  subvalue: `$${stats.portfolioValue.toFixed(0)}`,
                  icon: isDealer || getGateMode("tabBins") !== "hidden" ? ShieldCheck : Star,
                  activeClass: "bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black shadow-md shadow-blue-500/20",
                  inactiveClass: "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60",
                  visible: true,
                  onClick: () => {
                    setInventoryMode("ALL");
                    setVaultChannelFilter("ALL");
                    setBinTierFilter("ALL");
                  },
                  isActive: inventoryMode === "ALL",
                },
                {
                  id: "EBAY",
                  label: "eBay Singles",
                  count: stats.ebayCount,
                  subvalue: `$${stats.ebayPortfolioValue.toFixed(0)}`,
                  icon: Tag,
                  activeClass: "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-black shadow-md shadow-cyan-500/20",
                  inactiveClass: "text-cyan-400/80 hover:text-cyan-200 hover:bg-slate-800/60",
                  visible: getGateMode("tabEbay") !== "hidden",
                  onClick: () => {
                    setInventoryMode("EBAY");
                    setVaultChannelFilter("EBAY");
                  },
                  isActive: inventoryMode === "EBAY" || (inventoryMode === "VAULT" && vaultChannelFilter === "EBAY"),
                },
                {
                  id: "GRADING",
                  label: "PSA Grading",
                  count: stats.psaCount,
                  subvalue: `$${stats.psaPortfolioValue.toFixed(0)}`,
                  icon: Award,
                  activeClass: "bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black shadow-md shadow-purple-500/20",
                  inactiveClass: "text-purple-400/80 hover:text-purple-200 hover:bg-slate-800/60",
                  visible: getGateMode("tabGrading") !== "hidden",
                  onClick: () => {
                    setInventoryMode("GRADING");
                    setVaultChannelFilter("PSA_GRADING");
                  },
                  isActive: inventoryMode === "GRADING" || (inventoryMode === "VAULT" && vaultChannelFilter === "PSA_GRADING"),
                },
                {
                  id: "DOLLAR_BIN",
                  label: "<$4 Bins",
                  count: stats.dollarBinCount || stats.binCount,
                  subvalue: `~$${stats.dollarBinPortfolioValue.toFixed(0)}`,
                  icon: Box,
                  activeClass: "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-md shadow-amber-500/20",
                  inactiveClass: "text-amber-400/80 hover:text-amber-200 hover:bg-slate-800/60",
                  visible: getGateMode("tabBins") !== "hidden",
                  onClick: () => {
                    setInventoryMode("DOLLAR_BIN");
                    setBinTierFilter("ALL");
                  },
                  isActive: inventoryMode === "DOLLAR_BIN",
                },
                {
                  id: "BULK",
                  label: isDealer ? "Bulk Outflow" : "Bulk Stash",
                  count: stats.bulkCount,
                  subvalue: "0 Quota",
                  icon: Trash2,
                  activeClass: "bg-gradient-to-r from-rose-500 to-red-600 text-white font-black shadow-md shadow-rose-500/20",
                  inactiveClass: "text-rose-400/80 hover:text-rose-200 hover:bg-slate-800/60",
                  visible: true,
                  onClick: () => {
                    setInventoryMode("BULK");
                    setBinTierFilter("PURE_BULK");
                  },
                  isActive: inventoryMode === "BULK",
                },
                {
                  id: "PC",
                  label: "PC Showcase",
                  count: stats.pcCount,
                  subvalue: `$${stats.pcPortfolioValue.toFixed(0)}`,
                  icon: Star,
                  activeClass: "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black shadow-md shadow-amber-500/20",
                  inactiveClass: "text-amber-400/80 hover:text-amber-200 hover:bg-slate-800/60",
                  visible: true,
                  onClick: () => {
                    setInventoryMode("VAULT");
                    setVaultChannelFilter("PC");
                  },
                  isActive: inventoryMode === "VAULT" && vaultChannelFilter === "PC",
                },
                {
                  id: "SHOP_CASE",
                  label: "Shop Case",
                  count: stats.shopCount,
                  subvalue: `$${stats.shopPortfolioValue.toFixed(0)}`,
                  icon: Store,
                  activeClass: "bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-black shadow-md shadow-teal-500/20",
                  inactiveClass: "text-teal-400/80 hover:text-teal-200 hover:bg-slate-800/60",
                  visible: getGateMode("commercialVaultChannels") !== "hidden",
                  onClick: () => {
                    setInventoryMode("VAULT");
                    setVaultChannelFilter("SHOP_CASE");
                  },
                  isActive: inventoryMode === "VAULT" && vaultChannelFilter === "SHOP_CASE",
                },
                {
                  id: "WAREHOUSE",
                  label: "All Warehouse",
                  count: stats.total,
                  subvalue: "All",
                  icon: Database,
                  activeClass: "bg-gradient-to-r from-slate-700 to-slate-800 text-cyan-300 font-black shadow-md shadow-slate-700/30 border border-slate-700",
                  inactiveClass: "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60",
                  visible: getGateMode("barcodeSkuSequencing") !== "hidden" || isDealer,
                  onClick: () => {
                    setInventoryMode("WAREHOUSE");
                    setVaultChannelFilter("ALL");
                    setBinTierFilter("ALL");
                  },
                  isActive: inventoryMode === "WAREHOUSE",
                },
                {
                  id: "SOLD",
                  label: "Sold Archive",
                  count: stats.soldCount,
                  subvalue: `+$${stats.totalRealizedProfit.toFixed(0)}`,
                  icon: DollarSign,
                  activeClass: "bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black shadow-md shadow-emerald-600/20",
                  inactiveClass: "text-emerald-400/70 hover:text-emerald-200 hover:bg-slate-800/60",
                  visible: true,
                  onClick: () => {
                    setInventoryMode("SOLD");
                  },
                  isActive: inventoryMode === "SOLD",
                },
              ]
                .filter((tab) => tab.visible)
                .map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={tab.onClick}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 cursor-pointer ${
                        tab.isActive ? tab.activeClass : tab.inactiveClass
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{tab.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          tab.isActive ? "bg-black/20 text-white" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {tab.count}
                      </span>
                      {tab.subvalue && (
                        <span className={`text-[10px] font-mono opacity-80 hidden md:inline`}>
                          ({tab.subvalue})
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            <div className="hidden lg:flex items-center gap-2 pr-2 text-xs font-mono text-slate-400 shrink-0">
              <span>Showing <span className="text-white font-bold">{filteredCards.length}</span> cards</span>
            </div>
          </div>

          {/* Sequential Physical eBay Box Locator Sub-Bar */}
          {(inventoryMode === "EBAY" || (inventoryMode === "VAULT" && vaultChannelFilter === "EBAY")) && (
            <div className="flex items-center justify-between gap-3 bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-2.5 shadow-md flex-wrap animate-fade-in">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-indigo-300 text-xs font-bold font-mono pl-1">
                  <Box className="h-4 w-4 text-indigo-400" />
                  <span>Physical eBay Box:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setEbayBinFilter("ALL")}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                      ebayBinFilter === "ALL"
                        ? "bg-indigo-600 text-white font-black shadow-md shadow-indigo-500/20"
                        : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    All Bins ({stats.ebayCount})
                  </button>
                  {availableEbayBins.map((bin) => {
                    const binCardCount = savedCards.filter(
                      (c) =>
                        !c.isSold &&
                        (c.triageCategory === "EBAY" || c.vaultDestination === "EBAY" || c.triageStatus === "EBAY_RAW") &&
                        (c.ebayBinNumber === bin || c.data?.ebayBinNumber === bin || c.locationId === bin)
                    ).length;
                    return (
                      <button
                        key={bin}
                        type="button"
                        onClick={() => setEbayBinFilter(bin)}
                        className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          ebayBinFilter === bin
                            ? "bg-indigo-600 text-white font-black shadow-md shadow-indigo-500/20"
                            : "bg-slate-950 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-950/40"
                        }`}
                      >
                        <span>📦 {bin}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            ebayBinFilter === bin
                              ? "bg-white/20 text-white"
                              : "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                          }`}
                        >
                          {binCardCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {onNavigateToEbay && (
                <button
                  type="button"
                  onClick={onNavigateToEbay}
                  className="text-xs font-mono font-bold text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/40 rounded-xl px-3 py-1.5 transition flex items-center gap-1.5 cursor-pointer ml-auto"
                  title="Open dedicated eBay Singles Workbench Desk"
                >
                  <span>Open eBay Desk</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* <$4 Bins Sub-Bar */}
          {inventoryMode === "DOLLAR_BIN" && (
            <div className="flex items-center justify-between gap-3 bg-slate-900/90 border border-amber-500/30 rounded-2xl p-2.5 shadow-md flex-wrap animate-fade-in">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold font-mono pl-1">
                  <Box className="h-4 w-4 text-amber-400" />
                  <span>Consolidated &lt;$4 Bins:</span>
                </div>
                <div className="text-xs text-amber-200/80 font-mono">
                  All singles under $4 cataloged for show value bins & quick cash turnover (0 Vault Quota)
                </div>
              </div>

              {onNavigateToBins && (
                <button
                  type="button"
                  onClick={onNavigateToBins}
                  className="text-xs font-mono font-bold text-amber-300 hover:text-white bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 rounded-xl px-3 py-1.5 transition flex items-center gap-1.5 cursor-pointer ml-auto"
                  title="Open dedicated <$4 Bins & Bulk Workbench Desk"
                >
                  <span>Open &lt;$4 Bins Desk</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* PSA Grading Sub-Bar */}
          {(inventoryMode === "GRADING" || (inventoryMode === "VAULT" && vaultChannelFilter === "PSA_GRADING")) && onNavigateToGrading && (
            <div className="flex items-center justify-between gap-3 bg-slate-900/90 border border-purple-500/30 rounded-2xl p-2.5 shadow-md flex-wrap animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-mono text-purple-300">
                <Award className="h-4 w-4 text-purple-400" />
                <span>PSA Grading Queue: <strong className="text-white">{stats.psaCount}</strong> cards (${stats.psaPortfolioValue.toFixed(2)} Raw Value)</span>
              </div>
              <button
                type="button"
                onClick={onNavigateToGrading}
                className="text-xs font-mono font-bold text-purple-300 hover:text-white bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/40 rounded-xl px-3 py-1.5 transition flex items-center gap-1.5 cursor-pointer ml-auto"
                title="Open dedicated PSA Grading Workbench Desk"
              >
                <span>Open PSA Grading Desk</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: BATCH SELECTION BAR (When multiple batches exist) */}
      {availableBatches.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl shadow-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                Batch:
              </span>
            </div>

            <select
              value={selectedBatchId}
              onChange={(e) => selectBatchCards(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="all">📁 All Batches ({savedCards.length} cards)</option>
              {availableBatches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  📁 {b.batchName} ({b.count} cards)
                </option>
              ))}
            </select>

            {selectedBatchId !== "all" && (
              <div className="flex items-center gap-2">
                {renameBatch && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = availableBatches.find((b) => b.batchId === selectedBatchId);
                      if (target) {
                        handleOpenRename(target.batchId, target.batchName, target.count);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    title="Rename active batch"
                  >
                    <Edit3 className="h-3 w-3 text-cyan-400" />
                    <span>Rename</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => selectBatchCards("all")}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  Clear Filter ✕
                </button>
              </div>
            )}
          </div>

          {selectedBatchId !== "all" && (
            <button
              onClick={handleRunBulkComps}
              disabled={isBulkRunning || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Runs comps strictly on Vault hits (eBay Singles, Grading, PC) in this batch"
            >
              <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
              <span>Run Vault Comps for Batch</span>
            </button>
          )}
        </div>
      )}

      {/* Toolbar & Filter Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by player, set, team, brand, or number..."
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs font-mono text-slate-100 focus:outline-none"
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

          {/* Action Controls Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary Run Comps Button */}
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size > 0) {
                  handleRunBulkComps();
                } else {
                  const unpriced = filteredCards.filter((c) => isCardInVault(c) && (!c.data.estimatedValue || c.data.estimatedValue === 0));
                  const toRun = unpriced.length > 0 ? unpriced : filteredCards.filter((c) => isCardInVault(c));
                  handleRunBulkComps(toRun);
                }
              }}
              disabled={isBulkRunning}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/25 transition active:scale-95 cursor-pointer"
              title={
                selectedIds.size > 0
                  ? `Run market sales comps on ${selectedIds.size} selected Vault cards`
                  : stats.unpricedCount > 0
                  ? `Run market sales comps on ${stats.unpricedCount} unpriced Vault cards`
                  : "Run market sales comps on Vault cards"
              }
            >
              <Zap className="h-3.5 w-3.5 fill-slate-950 text-slate-950" />
              <span>
                {isBulkRunning
                  ? (bulkProgress ? `Comping (${bulkProgress.current}/${bulkProgress.total})...` : "Comping...")
                  : selectedIds.size > 0
                  ? `Run Comps (${selectedIds.size})`
                  : stats.unpricedCount > 0
                  ? `⚡ Run Comps (${stats.unpricedCount} Unpriced)`
                  : "⚡ Run Vault Comps"}
              </span>
            </button>

            {/* Quick Filter Shortcuts */}

            {/* Select Unpriced Shortcut */}
            {stats.unpricedCount > 0 && (
              <button
                onClick={selectUnpricedOnly}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 transition"
              >
                <CheckSquare className="h-3.5 w-3.5" /> Select Unpriced Vault Hits ({stats.unpricedCount})
              </button>
            )}

            {/* Auto-Adjust All Unmatched Cards Button */}
            {unmatchedVaultCards.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  setSelectedIds(new Set(unmatchedVaultCards.map((c) => c.id)));
                  await handleRunBulkComps(unmatchedVaultCards);
                }}
                disabled={isBulkRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95 cursor-pointer"
                title={`Auto-adjust search titles and rerun comps for ${unmatchedVaultCards.length} unmatched/unpriced Vault cards to get matches`}
              >
                <Sparkles className="h-3.5 w-3.5 fill-slate-950 text-slate-950" />
                <span>⚡ Auto-Adjust All ({unmatchedVaultCards.length})</span>
              </button>
            )}

            {/* Run Comps on Uncomped Grading Cards Shortcut */}
            {uncompedGradingCards.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  setSelectedIds(new Set(uncompedGradingCards.map((c) => c.id)));
                  await handleRunBulkComps(uncompedGradingCards);
                }}
                disabled={isBulkRunning}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition active:scale-95 animate-pulse"
                title={`Run comps on ${uncompedGradingCards.length} uncomped card${uncompedGradingCards.length === 1 ? '' : 's'} in the PSA Grading Queue`}
              >
                <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> Comp Grading Cards ({uncompedGradingCards.length})
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

            {/* Export Collection CSV Button (Hidden on Free and Starter) */}
            {!isFreeOrStarter && (
              <button
                onClick={handleExportCSV}
                disabled={filteredCards.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white transition shadow-lg shadow-emerald-600/20"
              >
                <Download className="h-4 w-4" /> Export CSV ({filteredCards.length})
              </button>
            )}

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

        {/* Filters & Sort bar */}
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

          {/* Quick Filter: Needs Research / Key Uncomped (Hidden on Free & Starter) */}
          {!isFreeOrStarter && (
            <button
              onClick={handleToggleKeyUncomped}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                filterKeyUncomped
                  ? "bg-amber-500/25 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/40"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-amber-300 hover:border-amber-500/40"
              }`}
              title="Filter cards that lack comps but have key attributes"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span>⚠️ Needs Research / Key Uncomped</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                {keyUncompedCount}
              </span>
            </button>
          )}

          {/* Quick Filter: Colored Parallels / Check Serial # (Hidden on Free & Starter) */}
          {!isFreeOrStarter && (
            <button
              onClick={handleTogglePotentialNumbered}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                filterPotentialNumbered
                  ? "bg-amber-500/25 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/40"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-amber-300 hover:border-amber-500/40"
              }`}
              title="Filter cards with unverified colors or finishes that need confirmation"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span>Needs Confirmation</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                {potentialNumberedCount}
              </span>
            </button>
          )}

          {/* SORT BY DROPDOWN FOR GRID & TABLE VIEWS */}
          <div className="flex items-center gap-1.5 text-slate-400 border-l border-slate-800 pl-3">
            <ArrowUpDown className="h-3.5 w-3.5 text-cyan-400" />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split("-") as [SortField, "asc" | "desc"];
                setSortBy(field);
                setSortOrder(order);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
            >
              <option value="needsConfirmation-desc">Sort: ⚠️ Needs Confirmation First</option>
              <option value="price-desc">Sort: Highest Price ($↓)</option>
              <option value="price-asc">Sort: Lowest Price ($↑)</option>
              <option value="dateAdded-desc">Sort: Newest Saved</option>
              <option value="dateAdded-asc">Sort: Oldest Saved</option>
              <option value="player-asc">Sort: Player (A-Z)</option>
              <option value="year-desc">Sort: Release Year (Newest)</option>
              <option value="year-asc">Sort: Release Year (Oldest)</option>
              <option value="title-asc">Sort: CDP Title (A-Z)</option>
            </select>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2 ml-auto font-mono"
            >
              Deselect All ({selectedIds.size})
            </button>
          )}

          {(searchTerm || selectedSport !== "all" || filterRookie || filterAuto || filterMem || filterKeyUncomped || filterPotentialNumbered) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedSport("all");
                setFilterRookie(false);
                setFilterAuto(false);
                setFilterMem(false);
                setFilterKeyUncomped(false);
                setFilterPotentialNumbered(false);
              }}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Notice if search query matches cards in other batches */}
        {selectedBatchId !== "all" && searchTerm.trim() && totalMatchesAcrossAllBatches > filteredCards.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs animate-in fade-in">
            <span className="text-cyan-300 flex items-center gap-2">
              <Search className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>
                Showing {filteredCards.length} in this batch. Found <strong className="text-white font-bold">{totalMatchesAcrossAllBatches}</strong> total matching card{totalMatchesAcrossAllBatches === 1 ? "" : "s"} across all batches.
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedBatchId("all")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition active:scale-95 shadow-sm"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Show All Batches ({totalMatchesAcrossAllBatches})</span>
            </button>
          </div>
        )}
      </div>

      {/* Collection Content View */}
      {filteredCards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
            {selectedBatchId !== "all" && searchTerm.trim() && totalMatchesAcrossAllBatches > 0 ? (
              <Search className="h-8 w-8 text-cyan-400" />
            ) : (
              <Layers className="h-8 w-8" />
            )}
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            {selectedBatchId !== "all" && searchTerm.trim() && totalMatchesAcrossAllBatches > 0 ? (
              <>
                <h4 className="text-base font-bold text-slate-100">
                  Player Found in Other Batches!
                </h4>
                <p className="text-xs text-slate-300">
                  There {totalMatchesAcrossAllBatches === 1 ? "is" : "are"}{" "}
                  <strong className="text-cyan-400">{totalMatchesAcrossAllBatches}</strong> matching card{totalMatchesAcrossAllBatches === 1 ? "" : "s"} in your collection, but outside the currently filtered batch.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBatchId("all")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Search Across All Batches ({totalMatchesAcrossAllBatches})</span>
                  </button>
                </div>
              </>
            ) : selectedBatchId !== "all" && activeBatchStats && activeBatchStats.total > 0 ? (
              <>
                <h4 className="text-base font-bold text-slate-200">
                  No Cards in Current Sub-Filter
                </h4>
                <p className="text-xs text-slate-400">
                  This batch contains <strong className="text-cyan-400">{activeBatchStats.total} cards</strong> ({activeBatchStats.vault} Vault, {activeBatchStats.bins} Bins), but none match your current inventory filter ({inventoryMode}).
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInventoryMode("ALL");
                      setVaultChannelFilter("ALL");
                      setBinTierFilter("ALL");
                      setSearchTerm("");
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition active:scale-95"
                  >
                    <span>Show All {activeBatchStats.total} Batch Cards</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h4 className="text-base font-bold text-slate-200">
                  {savedCards.length === 0
                    ? stagedCount > 0
                      ? `${stagedCount} Card${stagedCount > 1 ? "s" : ""} Waiting in Batch Scanner`
                      : "Your Online Collection is Empty"
                    : "No Cards Match Your Filters"}
                </h4>
                <p className="text-xs text-slate-400">
                  {savedCards.length === 0 ? (
                    stagedCount > 0 ? (
                      `You have ${stagedCount} card(s) staged in the Batch Scanner tab awaiting reconciliation. Click below to review & route them into your Master Inventory!`
                    ) : (
                      "Identify sports trading cards in the Batch Scanner tab and click 'Save to Collection' or 'Review & Route Batch (Checkoff)' to build your persistent online portfolio."
                    )
                  ) : (
                    "Try resetting your search term or active attribute filters to view all saved items."
                  )}
                </p>
                {savedCards.length === 0 && stagedCount > 0 && onNavigateToScanner && (
                  <button
                    type="button"
                    onClick={onNavigateToScanner}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/25 transition active:scale-95 cursor-pointer"
                  >
                    <Layers className="h-4 w-4 text-slate-950" />
                    <span>Go to Batch Scanner &amp; Review Batch ({stagedCount}) →</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredCards.map((item) => {
            const card = item.data;
            const isSelected = selectedIds.has(item.id);
            const currentStatus = getCardTriageStatus(item);
            const currentDecision = getCardDecision(item);
            const keyEval = getKeyCardFlags(item);
            const parallelEval = checkPotentialNumberedParallel(item);
            return (
              <div
                key={item.id}
                className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden shadow-xl flex flex-col justify-between ${
                  isSelected
                    ? "border-cyan-500 bg-slate-900 ring-2 ring-cyan-500/50"
                    : item.id === lastUpdatedCardId
                    ? "border-emerald-500 bg-slate-900 ring-2 ring-emerald-500/70 shadow-emerald-500/20"
                    : parallelEval.isPotentialNumbered
                    ? "border-amber-500/60 bg-slate-900/80 hover:border-amber-400 hover:bg-slate-900 ring-1 ring-amber-500/30"
                    : keyEval.isKeyUncomped
                    ? "border-amber-500/50 bg-slate-900/80 hover:border-amber-400 hover:bg-slate-900 ring-1 ring-amber-500/20"
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
                      onClick={(e) => toggleSelectCard(item.id, e)}
                      className="rounded-md bg-slate-950/90 border border-slate-800 p-1 text-cyan-300 hover:bg-cyan-500 hover:text-white transition"
                    >
                      {isSelected ? <CheckSquare className="h-4 w-4 text-cyan-400" /> : <Square className="h-4 w-4 text-slate-500" />}
                    </button>
                    <span className="rounded-md bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">
                      #{card.cardNumber || item.prefix}
                    </span>
                    {(item.ebayBinNumber || item.data?.ebayBinNumber || (item.locationId && item.locationId.startsWith("Bin "))) && (
                      <span className="rounded-md bg-cyan-950/95 border border-cyan-500/60 px-1.5 py-0.5 text-[9px] font-mono font-bold text-cyan-300 shadow flex items-center gap-1" title="Physical eBay Box Locator">
                        <Box className="h-2.5 w-2.5 text-cyan-400" />
                        <span>{item.ebayBinNumber || item.data?.ebayBinNumber || item.locationId}</span>
                      </span>
                    )}
                    {/* Clean Status Pill */}
                    {item.id === lastUpdatedCardId && (
                      <span className="rounded-md bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 text-[9px] font-mono shadow animate-pulse">
                        SAVED
                      </span>
                    )}
                    {(() => {
                      const badge = getCardStatusBadge(item);
                      return (
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[9px] font-mono font-bold shadow-sm ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                    {card.estimatedValue !== undefined && card.estimatedValue > 0 ? (
                      <span
                        data-tour="comp-waterfall"
                        className="rounded-md bg-emerald-500/90 border border-emerald-500/50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 shadow flex items-center gap-1"
                      >
                        <span>${card.estimatedValue.toFixed(2)}</span>
                        {card.compIsBaseEstimate && (
                          <span className="text-[8px] px-1 py-0.2 rounded bg-amber-400 text-slate-950 font-black">
                            BASE EST
                          </span>
                        )}
                      </span>
                    ) : card.compStatus === "needs_review" ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={autoAdjustingCardId === item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoAdjustSingleCard(item);
                          }}
                          className="rounded-md bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 px-2 py-0.5 text-[10px] font-mono font-black text-slate-950 shadow flex items-center gap-1 cursor-pointer transition active:scale-95 disabled:opacity-50"
                          title="1-Click Auto-Adjust: Drops card #, year, and set fluff to find active matches immediately"
                        >
                          <Sparkles className={`h-3 w-3 fill-slate-950 text-slate-950 ${autoAdjustingCardId === item.id ? "animate-spin" : ""}`} />
                          <span>{autoAdjustingCardId === item.id ? "MATCHING..." : "AUTO-ADJUST"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVariationMatcherCard(item);
                            setIsVariationMatcherOpen(true);
                          }}
                          className="rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 transition"
                          title="Needs Review: Click to match exact variation on eBay"
                        >
                          Match
                        </button>
                      </div>
                    ) : parallelEval.isPotentialNumbered ? (
                      <span
                        data-tour="comp-waterfall"
                        className="rounded-md bg-amber-500/95 border border-amber-400 px-1.5 py-0.5 text-[10px] font-mono font-black text-slate-950 shadow flex items-center gap-1"
                      >
                        ⚠️ CHECK SERIAL #
                      </span>
                    ) : keyEval.isKeyUncomped ? (
                      <span
                        data-tour="comp-waterfall"
                        className="rounded-md bg-amber-500/95 border border-amber-400 px-1.5 py-0.5 text-[10px] font-mono font-black text-slate-950 shadow flex items-center gap-1 animate-pulse"
                      >
                        ⚠️ UNCOMPED
                      </span>
                    ) : (
                      <span
                        data-tour="comp-waterfall"
                        className="rounded-md bg-slate-800/90 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                      >
                        Comps
                      </span>
                    )}
                  </div>

                  {/* Top Right: Clean Overflow Menu */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                    <CardActionsMenu
                      card={item}
                      onInspect={onInspectCard}
                      onUpdateVaultAndBin={updateCardVaultAndBin}
                      onUpdateTriageStatus={updateCardTriageStatus}
                      onMarkSold={handleOpenMarkSold}
                      onListToEbay={(c) => onListCardsToEbay?.([c])}
                      canListToEbay={!isFreeOrStarter && canAccess("directEbayListingApi")}
                      onMatchVariation={(c) => {
                        setVariationMatcherCard(c);
                        setIsVariationMatcherOpen(true);
                      }}
                      onDelete={removeCard}
                      align="right"
                    />
                  </div>
                </div>

                {/* Metadata Body */}
                <div
                  onClick={() => onInspectCard && onInspectCard(item)}
                  className="p-4 space-y-3 flex-1 flex flex-col justify-between cursor-pointer hover:bg-slate-900/90 transition"
                  title="Click to inspect full CDP card details"
                >
                  <div>
                    {/* Potential Numbered / Parallel Alert: Little Yellow Triangle Button to open editor */}
                    {parallelEval.isPotentialNumbered && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectCard && onInspectCard(item);
                        }}
                        className="w-full mb-3 flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold transition cursor-pointer hover:border-amber-400 group/warn shadow-xs"
                        title="⚠️ Unverified color/parallel detected without verified serial #. Click to fix in card editor."
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 fill-amber-400/20 group-hover/warn:scale-110 transition-transform" />
                          <span>Needs Confirmation</span>
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase shrink-0">
                          {parallelEval.detectedType || card.subsetParallel || "Fix"}
                        </span>
                      </button>
                    )}

                    {/* Prominent Warning Tag & Badge Chips for Uncomped Key Cards */}
                    {keyEval.isKeyUncomped && (
                      <div className="mb-3 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/20 p-2.5 space-y-2 shadow-md">
                        <div className="flex items-center justify-between gap-1 text-xs font-black text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm">⚠️</span>
                            <span>Uncomped Key Card</span>
                          </span>
                          {onInspectCard && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectCard(item);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-mono font-black transition active:scale-95 shadow"
                            >
                              Manual Price / Research →
                            </button>
                          )}
                        </div>
                        {/* Triggered Condition Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {keyEval.badges.map((badge) => (
                            <span
                              key={badge}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider border shadow-sm ${
                                badge === "RC"
                                  ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50"
                                  : badge.startsWith("Numbered")
                                  ? "bg-purple-500/25 text-purple-300 border-purple-500/50"
                                  : badge === "Autograph"
                                  ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
                                  : "bg-rose-500/25 text-rose-300 border-rose-500/50"
                              }`}
                            >
                              [{badge}]
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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

                    {(item.dontGrade || item.data?.dontGrade) && (
                      <div className="mt-2">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-help shadow-sm"
                          title={`🚫 DO NOT GRADE:\nReason: ${GRADING_REJECT_REASON_LABELS[(item.gradingRejectReason || item.data?.gradingRejectReason) as GradingRejectReason] || item.gradingRejectReason || item.data?.gradingRejectReason || "Condition issue"}\nNotes: "${item.gradingRejectNotes || item.data?.gradingRejectNotes || "No notes recorded"}"`}
                        >
                          <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />
                          Don&apos;t Grade: {GRADING_REJECT_REASON_LABELS[(item.gradingRejectReason || item.data?.gradingRejectReason) as GradingRejectReason] || item.gradingRejectReason || item.data?.gradingRejectReason || "Condition Flaw"}
                        </span>
                      </div>
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

                  {/* Financial Cost Basis & Profit Line */}
                  <div className="flex items-center justify-between text-[11px] font-mono pt-1.5 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Paid:</span>
                      <span className="font-bold text-slate-200">
                        {(item.purchasePrice !== undefined || (item.data as any)?.purchasePrice !== undefined)
                          ? `$${(item.purchasePrice ?? (item.data as any)?.purchasePrice).toFixed(2)}`
                          : <span className="text-slate-500 font-normal italic">Unset</span>}
                      </span>
                    </div>
                    {card.estimatedValue !== undefined && card.estimatedValue > 0 && (
                      <div className="flex items-center gap-1 text-[10px]">
                        {(() => {
                          const cost = item.purchasePrice ?? (item.data as any)?.purchasePrice ?? 0;
                          const diff = card.estimatedValue - cost;
                          if (cost <= 0) return null;
                          return (
                            <span className={`font-bold ${diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {diff >= 0 ? "+" : ""}${diff.toFixed(2)} ({diff >= 0 ? "+" : ""}{((diff / cost) * 100).toFixed(0)}%)
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Clean Card Footer */}
                  <div className="pt-2.5 border-t border-slate-800/80 mt-1 flex items-center justify-between text-[11px] font-mono" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {card.compStatus === "needs_review" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setVariationMatcherCard(item);
                            setIsVariationMatcherOpen(true);
                          }}
                          className="py-1 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold transition flex items-center gap-1 shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                          title="Needs Review: Click to match exact variation on eBay"
                        >
                          <Sparkles className="h-3 w-3 text-amber-400" />
                          <span>Match Variation</span>
                        </button>
                      ) : keyEval.isKeyUncomped && onInspectCard ? (
                        <button
                          type="button"
                          onClick={() => onInspectCard(item)}
                          className="py-1 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold transition flex items-center gap-1 shadow-sm"
                        >
                          <Search className="h-3 w-3 text-amber-400" />
                          <span>Price Research</span>
                        </button>
                      ) : item.isSold ? (
                        <span className="text-emerald-400 font-bold text-[10px]">
                          Sold: ${item.soldPrice?.toFixed(2)} (+${item.soldNetProfit?.toFixed(2)} Net)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">
                          Routing: <strong className="text-slate-200">{getCardStatusBadge(item).shortLabel}</strong>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onInspectCard && onInspectCard(item)}
                      className="text-cyan-400 hover:text-cyan-300 font-bold text-[10px] flex items-center gap-1 hover:underline transition"
                    >
                      <span>Inspect</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW WITH INTERACTIVE SORTABLE HEADERS */
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

                  {/* Sortable CDP Title Header */}
                  <th
                    onClick={() => handleHeaderSort("title")}
                    className="p-3 min-w-[220px] cursor-pointer hover:text-cyan-300 transition group select-none"
                  >
                    CDP Title {renderSortIndicator("title")}
                  </th>

                  {/* Sortable Value ($) Header */}
                  <th
                    onClick={() => handleHeaderSort("price")}
                    className="p-3 font-mono font-bold text-emerald-400 cursor-pointer hover:text-emerald-300 transition group select-none"
                  >
                    Value ($) {renderSortIndicator("price")}
                  </th>

                  {/* Sortable Player Name Header */}
                  <th
                    onClick={() => handleHeaderSort("player")}
                    className="p-3 cursor-pointer hover:text-cyan-300 transition group select-none"
                  >
                    Player Name {renderSortIndicator("player")}
                  </th>

                  {/* Sortable Year Header */}
                  <th
                    onClick={() => handleHeaderSort("year")}
                    className="p-3 cursor-pointer hover:text-cyan-300 transition group select-none"
                  >
                    Year / Brand / Set {renderSortIndicator("year")}
                  </th>

                  <th className="p-3">Card #</th>
                  <th className="p-3">Team / Sport</th>
                  {/* Sortable Parallel / Subset Header */}
                  <th
                    onClick={() => handleHeaderSort("needsConfirmation")}
                    className="p-3 cursor-pointer hover:text-amber-300 transition group select-none"
                    title="Click to sort cards needing parallel/variation confirmation"
                  >
                    Parallel / Subset {renderSortIndicator("needsConfirmation")}
                  </th>

                  {/* Sortable Date Saved Header */}
                  <th
                    onClick={() => handleHeaderSort("dateAdded")}
                    className="p-3 cursor-pointer hover:text-cyan-300 transition group select-none"
                  >
                    Date Saved {renderSortIndicator("dateAdded")}
                  </th>

                  <th className="p-3 min-w-[270px]">Decision</th>

                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredCards.map((item) => {
                  const card = item.data;
                  const isSelected = selectedIds.has(item.id);
                  const currentStatus = getCardTriageStatus(item);
                  const currentDecision = getCardDecision(item);
                  const keyEval = getKeyCardFlags(item);
                  const parallelEval = checkPotentialNumberedParallel(item);

                  return (
                    <tr
                      key={item.id}
                      onClick={(e) => {
                        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTabHeld) {
                          toggleSelectCard(item.id, e);
                        }
                      }}
                      className={`transition ${
                        isSelected
                          ? "bg-cyan-500/10 font-medium"
                          : item.id === lastUpdatedCardId
                          ? "bg-emerald-500/20 font-medium ring-1 ring-emerald-500/50"
                          : parallelEval.isPotentialNumbered
                          ? "bg-amber-500/10 hover:bg-amber-500/15"
                          : keyEval.isKeyUncomped
                          ? "bg-amber-500/5 hover:bg-amber-500/10"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectCard(item.id, e as any)}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(item.frontPreview || null);
                              }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(item.backPreview || null);
                              }}
                            />
                          )}
                        </div>
                      </td>
                      {/* Interactive Title: Click to inspect & edit */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectCard && onInspectCard(item);
                        }}
                        className="p-3 font-mono font-bold text-cyan-300 max-w-[280px] cursor-pointer hover:underline hover:text-cyan-200 transition group/title"
                        title="Click to view & edit card details"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1 truncate">
                            {item.id === lastUpdatedCardId && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-mono font-black uppercase shrink-0 animate-pulse">
                                SAVED
                              </span>
                            )}
                            <span className="truncate">{generateCdpTitle(card) || "-"}</span>
                            <Eye className="h-3 w-3 shrink-0 opacity-0 group-hover/title:opacity-100 transition text-cyan-400" />
                          </span>

                          {/* Potential Numbered / Parallel Alert: Little Yellow Triangle Button to open editor */}
                          {parallelEval.isPotentialNumbered && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectCard && onInspectCard(item);
                              }}
                              className="inline-flex items-center gap-1.5 self-start mt-1 px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold transition cursor-pointer hover:border-amber-400 group/warn shadow-xs"
                              title="⚠️ Unverified color/parallel detected without verified serial #. Click to fix in editor."
                            >
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 fill-amber-400/20 group-hover/warn:scale-110 transition-transform" />
                              <span>Needs Confirmation</span>
                              {parallelEval.detectedType && (
                                <span className="text-[9px] text-amber-300/80 font-normal">
                                  ({parallelEval.detectedType})
                                </span>
                              )}
                            </button>
                          )}
                          {keyEval.isKeyUncomped && (
                            <div className="flex flex-col gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black">
                                  ⚠️ Uncomped Key Card
                                </span>
                                {onInspectCard && (
                                  <button
                                    type="button"
                                    onClick={() => onInspectCard(item)}
                                    className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[9px] font-mono font-black transition shadow"
                                  >
                                    Manual Price / Research →
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {keyEval.badges.map((badge) => (
                                  <span
                                    key={badge}
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black border ${
                                      badge === "RC"
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                        : badge.startsWith("Numbered")
                                        ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                        : badge === "Autograph"
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                        : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                    }`}
                                  >
                                    [{badge}]
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-black text-emerald-400">
                        {card.estimatedValue !== undefined && card.estimatedValue > 0 ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>${card.estimatedValue.toFixed(2)}</span>
                              {card.compIsBaseEstimate && (
                                <span className="text-[8px] px-1 py-0.2 rounded bg-amber-400 text-slate-950 font-black">
                                  BASE EST
                                </span>
                              )}
                            </div>
                            {(card.purchasePrice !== undefined || (item as any).purchasePrice !== undefined) && (
                              <span className="text-[10px] text-cyan-300 font-mono font-normal">
                                Paid: ${(card.purchasePrice ?? (item as any).purchasePrice).toFixed(2)}
                              </span>
                            )}
                          </div>
                        ) : (card.compStatus === "needs_review" || keyEval.isKeyUncomped) ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <button
                                type="button"
                                disabled={autoAdjustingCardId === item.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAutoAdjustSingleCard(item);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-mono font-bold text-[9px] shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title="1-Click Auto-Adjust: Drops card #, year, and set fluff to find active matches immediately"
                              >
                                <Sparkles className={`h-2.5 w-2.5 fill-slate-950 text-slate-950 ${autoAdjustingCardId === item.id ? "animate-spin" : ""}`} />
                                <span>{autoAdjustingCardId === item.id ? "Matching..." : "Auto-Adjust"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVariationMatcherCard(item);
                                  setIsVariationMatcherOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[9px] font-mono transition cursor-pointer"
                                title="Needs Review: Click to match exact variation on eBay"
                              >
                                <span>Match</span>
                              </button>
                            </div>
                            {(card.purchasePrice !== undefined || (item as any).purchasePrice !== undefined) && (
                              <span className="text-[10px] text-cyan-300 font-mono font-normal">
                                Paid: ${(card.purchasePrice ?? (item as any).purchasePrice).toFixed(2)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span>-</span>
                            {(card.purchasePrice !== undefined || (item as any).purchasePrice !== undefined) && (
                              <span className="text-[10px] text-cyan-300 font-mono font-normal">
                                Paid: ${(card.purchasePrice ?? (item as any).purchasePrice).toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Interactive Player Name: Click to inspect & edit */}
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectCard && onInspectCard(item);
                        }}
                        className="p-3 font-bold text-white cursor-pointer hover:underline hover:text-cyan-300 transition"
                        title="Click to view & edit card details"
                      >
                        {card.playerName || (card as any).subject || "Unknown"}
                      </td>
                      <td className="p-3">
                        {card.year} {card.brand} {card.setName}
                      </td>
                      <td className="p-3 font-mono text-cyan-300">{card.cardNumber}</td>
                      <td className="p-3">
                        {card.team} <span className="text-slate-500">({card.sport})</span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {parallelEval.isPotentialNumbered && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectCard && onInspectCard(item);
                              }}
                              className="text-amber-400 hover:text-amber-300 transition hover:scale-110 cursor-pointer"
                              title="⚠️ Needs Confirmation: Unverified color/parallel. Click to fix in editor."
                            >
                              <AlertTriangle className="h-3.5 w-3.5 fill-amber-400/20" />
                            </button>
                          )}
                          <span>{card.subsetParallel || "-"}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVariationMatcherCard(item);
                              setIsVariationMatcherOpen(true);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-400 hover:border-cyan-400 border border-slate-700 text-[9px] font-mono transition cursor-pointer"
                            title="Match variation on eBay"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                          </button>
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
                        <div>{new Date(item.dateAdded).toLocaleDateString()}</div>
                        {(card.lastCompDate || card.lastPriceRefreshedAt || card.valueLastUpdated) && (
                          <div className="text-[10px] text-slate-500" title="Last Comp Date">
                            Comp: {new Date(card.lastCompDate || card.lastPriceRefreshedAt || card.valueLastUpdated!).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5">
                          {item.isSold ? (
                            <div className="flex flex-col gap-0.5 p-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40">
                              <span className="text-[10px] font-mono font-bold text-slate-300">
                                Sold ({item.soldPlatform || "Shop"}): <strong className="text-white">${item.soldPrice?.toFixed(2)}</strong>
                              </span>
                              <span className="text-[10px] font-mono font-black text-emerald-400">
                                +${item.soldNetProfit?.toFixed(2)} Net Profit
                              </span>
                            </div>
                          ) : (
                            <>
                              {parallelEval.isPotentialNumbered && (
                                <div className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-[9px] font-mono font-black text-amber-300 text-center shadow-sm">
                                  ⚠️ Needs Serial # Review
                                </div>
                              )}
                              {keyEval.isKeyUncomped && onInspectCard && (
                                <button
                                  type="button"
                                  onClick={() => onInspectCard(item)}
                                  className="w-full py-0.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-bold transition flex items-center justify-center gap-1 shadow-sm"
                                >
                                  <Search className="h-3 w-3 text-amber-400" />
                                  <span>Research Comps</span>
                                </button>
                              )}
                              <div className="flex items-center gap-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleSetDecision(item.id, 'GRADE')}
                                  title="Decision: Grade (Send to PSA)"
                                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border whitespace-nowrap active:scale-95 cursor-pointer ${
                                    currentDecision === 'GRADE'
                                      ? "bg-purple-600 text-white border-purple-400 shadow-sm shadow-purple-600/30 font-extrabold"
                                      : "bg-slate-950/80 text-purple-400 border-purple-500/25 hover:bg-purple-500/15 hover:border-purple-500/50"
                                  }`}
                                >
                                  Grade
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetDecision(item.id, 'SELL')}
                                  title="Decision: Sell (eBay Raw Singles)"
                                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border whitespace-nowrap active:scale-95 cursor-pointer ${
                                    currentDecision === 'SELL'
                                      ? "bg-blue-600 text-white border-blue-400 shadow-sm shadow-blue-500/30 font-extrabold"
                                      : "bg-slate-950/80 text-blue-400 border-blue-500/25 hover:bg-blue-500/15 hover:border-blue-500/50"
                                  }`}
                                >
                                  Sell
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetDecision(item.id, 'HOLD')}
                                  title="Decision: Hold (Hold for market growth)"
                                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border whitespace-nowrap active:scale-95 cursor-pointer ${
                                    currentDecision === 'HOLD'
                                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm shadow-amber-500/30 font-extrabold"
                                      : "bg-slate-950/80 text-amber-400 border-amber-500/25 hover:bg-amber-500/15 hover:border-amber-500/50"
                                  }`}
                                >
                                  Hold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSetDecision(item.id, 'PC')}
                                  title="Decision: Personal Collection (PC)"
                                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border whitespace-nowrap active:scale-95 cursor-pointer ${
                                    currentDecision === 'PC'
                                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm shadow-cyan-500/30 font-extrabold"
                                      : "bg-slate-950/80 text-cyan-400 border-cyan-500/25 hover:bg-cyan-500/15 hover:border-cyan-500/50"
                                  }`}
                                >
                                  PC
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenMarkSold(item)}
                                  title="Mark as Sold"
                                  className="px-1.5 py-1 rounded-lg text-[10px] font-mono font-bold transition border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 whitespace-nowrap flex items-center gap-0.5 shadow-sm active:scale-95 cursor-pointer ml-auto"
                                >
                                  <DollarSign className="h-3 w-3 text-emerald-400" />
                                  <span>Sold</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {item.data.ebayListingStatus === "ACTIVE" && (
                            <a
                              href={item.data.ebayListingUrl || `https://www.ebay.com/itm/${item.data.ebayItemId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:text-blue-300 transition"
                              title="View active listing on eBay"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {onInspectCard && (
                            <button
                              type="button"
                              onClick={() => onInspectCard(item)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition cursor-pointer"
                              title="Inspect & Edit Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <CardActionsMenu
                            card={item}
                            onInspect={onInspectCard}
                            onUpdateVaultAndBin={updateCardVaultAndBin}
                            onUpdateTriageStatus={updateCardTriageStatus}
                            onMarkSold={handleOpenMarkSold}
                            onListToEbay={(c) => onListCardsToEbay?.([c])}
                            canListToEbay={!isFreeOrStarter && canAccess("directEbayListingApi")}
                            onMatchVariation={(c) => {
                              setVariationMatcherCard(c);
                              setIsVariationMatcherOpen(true);
                            }}
                            onDelete={removeCard}
                            align="right"
                          />
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

      {/* Rename Batch Modal */}
      {renamingBatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Tag className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Rename Batch</h3>
                  <p className="text-xs text-slate-400">
                    Will update <span className="text-cyan-400 font-semibold">{renamingBatch.count}</span> {renamingBatch.count === 1 ? "card" : "cards"} in this batch
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenamingBatch(null)}
                disabled={isRenamingSubmitting}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmRename();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Batch Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={renameInputVal}
                  onChange={(e) => setRenameInputVal(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  disabled={isRenamingSubmitting}
                  placeholder="e.g. 1996 Topps Chrome Blaster"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl text-sm font-medium text-slate-100 placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingBatch(null)}
                  disabled={isRenamingSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenamingSubmitting || !renameInputVal.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-cyan-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  {isRenamingSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Save Name</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark as Sold Modal */}
      {cardToMarkSold && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Mark Card as Sold</h3>
                  <p className="text-xs text-emerald-400/90 font-medium">
                    Logs realized profit & permanently frees 1 Vault slot
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCardToMarkSold(null)}
                disabled={isSubmittingSold}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Target Card Mini Preview */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              {cardToMarkSold.frontPreview ? (
                <img
                  src={cardToMarkSold.frontPreview}
                  alt="Card Thumb"
                  className="h-12 w-10 object-cover rounded-lg border border-slate-800 shrink-0"
                />
              ) : (
                <div className="h-12 w-10 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center text-[9px] text-slate-500 shrink-0">
                  Card
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {generateCdpTitle(cardToMarkSold.data)}
                </p>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-0.5">
                  <span>
                    Est. Market:{" "}
                    <strong className="text-cyan-300">
                      ${(cardToMarkSold.data.estimatedValue || 0).toFixed(2)}
                    </strong>
                  </span>
                  {(cardToMarkSold.data.purchasePrice !== undefined || (cardToMarkSold as any).purchasePrice !== undefined) && (
                    <span>
                      Paid:{" "}
                      <strong className="text-slate-200">
                        ${(cardToMarkSold.data.purchasePrice ?? (cardToMarkSold as any).purchasePrice).toFixed(2)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sale Form */}
            <form onSubmit={handleConfirmMarkSold} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sale Price */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Sale Price ($) *
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-emerald-400 pointer-events-none" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      autoFocus
                      value={soldPriceInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSoldPriceInput(val);
                        if (soldPlatformInput === "EBAY") {
                          const p = parseFloat(val) || 0;
                          setSoldFeesInput(p > 0 ? (p * 0.1325).toFixed(2) : "0.00");
                        }
                      }}
                      placeholder="0.00"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-sm font-mono font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Sales Platform */}
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Sales Channel / Platform
                  </label>
                  <select
                    value={soldPlatformInput}
                    onChange={(e) => {
                      const plat = e.target.value as any;
                      setSoldPlatformInput(plat);
                      if (plat === "EBAY") {
                        const p = parseFloat(soldPriceInput) || 0;
                        setSoldFeesInput(p > 0 ? (p * 0.1325).toFixed(2) : "0.00");
                      } else if (soldFeesInput === "0.00" || soldFeesInput === "") {
                        setSoldFeesInput("0.00");
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-xs font-mono font-bold text-slate-200 focus:outline-none"
                  >
                    <option value="SHOP">🛒 Shop Showcase / Walk-in</option>
                    <option value="EBAY">🌐 eBay Store / Online</option>
                    <option value="VENDOR_TABLE">🎪 Card Show / Vendor Table</option>
                    <option value="CASH">💵 Cash / In-Person Deal</option>
                    <option value="OTHER">📦 Other Channel</option>
                  </select>
                </div>
              </div>

              {/* Fees & Shipping */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Platform Fees & Shipping ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={soldFeesInput}
                    onChange={(e) => setSoldFeesInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm font-mono text-white focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  {soldPlatformInput === "EBAY" ? "Estimated 13.25% eBay final value fees & transaction charge" : "Payment processing, table fees, or shipping costs"}
                </p>
              </div>

              {/* Live Profit Calculation Card */}
              {(() => {
                const salePrice = parseFloat(soldPriceInput) || 0;
                const fees = parseFloat(soldFeesInput) || 0;
                const costBasis =
                  cardToMarkSold.data.purchasePrice ??
                  (cardToMarkSold as any).purchasePrice ??
                  0;
                const netProfit = salePrice - fees - costBasis;
                const roiPct = costBasis > 0 ? (netProfit / costBasis) * 100 : null;

                return (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>Gross Sale: <strong className="text-white">${salePrice.toFixed(2)}</strong></span>
                      <span>Fees: <strong className="text-rose-400">-${fees.toFixed(2)}</strong></span>
                      {costBasis > 0 && (
                        <span>Paid: <strong className="text-slate-300">-${costBasis.toFixed(2)}</strong></span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Net Realized Profit:</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-base font-black font-mono ${
                            netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {netProfit >= 0 ? `+$${netProfit.toFixed(2)}` : `-$${Math.abs(netProfit).toFixed(2)}`}
                        </span>
                        {roiPct !== null && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                              roiPct >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {roiPct >= 0 ? `+${roiPct.toFixed(1)}% ROI` : `${roiPct.toFixed(1)}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Quota Release Info Banner */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                <Store className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  This card will be archived to your <strong>Sold Log</strong> and immediately <strong>free 1 slot in your Vault quota</strong>.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCardToMarkSold(null)}
                  disabled={isSubmittingSold}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSold || !soldPriceInput || parseFloat(soldPriceInput) < 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingSold ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving Sale...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Confirm Sale & Free Slot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Multi-Select Action Dock */}
      <FloatingActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredCards.length}
        onClearSelection={() => setSelectedIds(new Set())}
        onMoveSelected={handleBatchMoveSelected}
        onRunComps={handleRunBulkComps}
        isComping={isBulkRunning}
        onListToEbay={() => {
          const targetCards = savedCards.filter((c) => selectedIds.has(c.id));
          if (targetCards.length > 0 && onListCardsToEbay) {
            onListCardsToEbay(targetCards);
          }
        }}
        canListToEbay={!isFreeOrStarter && canAccess("directEbayListingApi")}
        onMarkSold={() => {
          const first = savedCards.find((c) => selectedIds.has(c.id));
          if (first) handleOpenMarkSold(first);
        }}
        onExportCsv={() => {
          const targetCards = savedCards.filter((c) => selectedIds.has(c.id));
          if (targetCards.length > 0) {
            exportSavedCollectionToCSV(targetCards);
          }
        }}
        onDeleteSelected={() => {
          if (window.confirm(`Are you sure you want to delete ${selectedIds.size} selected card(s)?`)) {
            const idsToDelete = Array.from(selectedIds);
            if (removeCardsBatch) {
              removeCardsBatch(idsToDelete);
            } else {
              idsToDelete.forEach((id) => removeCard(id));
            }
            setSelectedIds(new Set());
          }
        }}
      />

      {/* Variation Matcher from eBay Modal */}
      {variationMatcherCard && isVariationMatcherOpen && (
        <VariationMatcherModal
          isOpen={isVariationMatcherOpen}
          onClose={() => {
            setIsVariationMatcherOpen(false);
            setVariationMatcherCard(null);
          }}
          card={variationMatcherCard}
          onApplyVariation={handleApplyVariationFromMatcher}
        />
      )}
    </div>
  );
}
