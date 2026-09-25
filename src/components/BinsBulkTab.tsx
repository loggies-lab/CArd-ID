"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Package,
  Layers,
  DollarSign,
  TrendingUp,
  Plus,
  Minus,
  Search,
  Trash2,
  Sparkles,
  RefreshCw,
  Edit2,
  Check,
  X,
  ArrowUpRight,
  Tag,
  Filter,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  ShoppingBag,
  Store,
  Calendar,
  Eye,
  Archive,
  AlertCircle,
  CheckSquare,
  AlertTriangle,
  CheckCheck,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  BatchRecord,
  BinsInventorySummary,
  DEFAULT_BINS_SUMMARY,
  getBatchRecords,
  getBinsSummary,
  updateBinsSummary,
} from "@/lib/batchLedgerService";
import {
  SavedCollectionItem,
  BinTier,
  VaultDestination,
  TriageStatus,
  TriageCategory,
  UserSettings,
  isCardInVault,
  CDPCardSchema,
} from "@/types/card";
import { generateCdpTitle } from "@/lib/titleGenerator";
import { sanitizeCompQuery } from "@/lib/compSanitizer";
import { separateInventory } from "@/lib/inventorySeparationService";

interface BinsBulkTabProps {
  savedCards: SavedCollectionItem[];
  userId?: string;
  userSettings?: UserSettings;
  onInspectCard?: (card: SavedCollectionItem) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema; [key: string]: any }[]) => Promise<any> | void;
  updateCardVaultAndBin?: (
    id: string,
    updates: {
      vaultDestination?: VaultDestination;
      binTier?: BinTier;
      isVaulted?: boolean;
      isBulk?: boolean;
      triageCategory?: TriageCategory;
      isSorted?: boolean;
      sortedAt?: string;
      sortedDestination?: string;
      sortedNotes?: string;
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
      isSorted?: boolean;
      sortedAt?: string;
      sortedDestination?: string;
      sortedNotes?: string;
    }[]
  ) => Promise<boolean>;
  updateCardTriageStatus?: (id: string, triageStatus: TriageStatus) => Promise<void> | void;
  markCardAsSold?: (
    id: string,
    soldData: {
      soldPrice: number;
      soldPlatform?: "SHOP" | "EBAY" | "VENDOR_TABLE" | "CASH" | "OTHER";
      soldFees?: number;
      soldDate?: string;
    }
  ) => Promise<boolean>;
  removeCard?: (id: string) => void;
  removeCardsBatch?: (ids: string[]) => Promise<void> | void;
  markCardsSortedBatch?: (ids: string[], isSorted: boolean, sortedDestination?: string) => Promise<boolean>;
  initialSubFilter?: "ALL" | "SHOW_BINS" | "PURE_BULK";
  onNavigateToScanner?: () => void;
  onNavigateToCollection?: () => void;
}

export function BinsBulkTab({
  savedCards,
  userId,
  userSettings,
  onInspectCard,
  updateSavedCardDataBatch,
  updateCardVaultAndBin,
  updateCardsVaultAndBinBatch,
  updateCardTriageStatus,
  markCardAsSold,
  removeCard,
  removeCardsBatch,
  markCardsSortedBatch,
  initialSubFilter = "ALL",
  onNavigateToScanner,
  onNavigateToCollection,
}: BinsBulkTabProps) {
  const [summary, setSummary] = useState<BinsInventorySummary>(DEFAULT_BINS_SUMMARY);
  const [records, setRecords] = useState<BatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // On-Demand Comps State
  const [compingCardIds, setCompingCardIds] = useState<Set<string>>(new Set());
  const [isBulkComping, setIsBulkComping] = useState(false);
  const [bulkCompProgress, setBulkCompProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [sleeperAlert, setSleeperAlert] = useState<{ card: SavedCollectionItem; compPrice: number } | null>(null);

  // Quick Sell-Down & Stock Adjustment modal state
  const [editingBinKey, setEditingBinKey] = useState<"binUnder4" | "bin1" | "bin3" | "bin4" | "bulk" | null>(null);
  const [editCountValue, setEditCountValue] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Inventory Separation State
  const [isSeparating, setIsSeparating] = useState(false);
  const [selectedBinCardIds, setSelectedBinCardIds] = useState<Set<string>>(new Set());
  const [lastSelectedBinCardId, setLastSelectedBinCardId] = useState<string | null>(null);

  // Market FMV Sorting State: "none" | "desc" | "asc"
  const [valueSortOrder, setValueSortOrder] = useState<"none" | "desc" | "asc">("none");

  // Quick Sell-Down Register State
  const [sellBinChoice, setSellBinChoice] = useState<"binUnder4" | "bulk">("binUnder4");
  const [sellQty, setSellQty] = useState<number>(10);
  const [isSellingDown, setIsSellingDown] = useState(false);

  // Filter & Search for Individual Bin Singles in savedCards
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBinTierFilter, setSelectedBinTierFilter] = useState<"ALL" | "BIN_UNDER_4" | "PURE_BULK" | "BIN_1" | "BIN_3" | "BIN_4">(
    initialSubFilter === "SHOW_BINS" ? "BIN_UNDER_4" : initialSubFilter === "PURE_BULK" ? "PURE_BULK" : "ALL"
  );
  const [sortStatusFilter, setSortStatusFilter] = useState<"ALL" | "UNSORTED" | "SORTED">("ALL");

  // Removal & Sorting Confirmation Modals
  const [isRemoveSortedModalOpen, setIsRemoveSortedModalOpen] = useState(false);
  const [isRemovingSorted, setIsRemovingSorted] = useState(false);
  const [keepCountInLedger, setKeepCountInLedger] = useState(true);
  const [cardToConfirmUnsortedRemove, setCardToConfirmUnsortedRemove] = useState<SavedCollectionItem | null>(null);

  // Load physical ledger data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [recs, sum] = await Promise.all([
          getBatchRecords(userId),
          getBinsSummary(userId),
        ]);
        setRecords(recs);
        setSummary(sum);
      } catch (err) {
        console.warn("Failed to load bins summary:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [userId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Filter individual saved cards that strictly belong to show bins or bulk (0 Vault Quota)
  const binSavedCards = useMemo(() => {
    return savedCards.filter(
      (c) =>
        !c.isSold &&
        !isCardInVault(c) &&
        (c.binTier || c.isBulk || c.triageStatus === "DOLLAR_BIN" || c.triageCategory === "DOLLAR_BIN" || c.triageCategory === "BULK" || c.locationId === "SHOW_BINS" || c.locationId === "BULK_BOX" || c.isVaulted === false)
    );
  }, [savedCards]);

  // Split into Sorted vs Unsorted cards
  const sortedCards = useMemo(() => {
    return binSavedCards.filter((c) => Boolean(c.isSorted || c.data?.isSorted));
  }, [binSavedCards]);

  const unsortedCards = useMemo(() => {
    return binSavedCards.filter((c) => !c.isSorted && !c.data?.isSorted);
  }, [binSavedCards]);

  // Breakdown of sorted cards by bin/bulk
  const binUnder4SortedCount = useMemo(() => sortedCards.filter((c) => c.binTier === "BIN_UNDER_4" || c.binTier === "BIN_1" || c.binTier === "BIN_3" || c.binTier === "BIN_4" || (!c.isBulk && c.triageCategory === "DOLLAR_BIN")).length, [sortedCards]);
  const bulkSortedCount = useMemo(() => sortedCards.filter((c) => c.binTier === "PURE_BULK" || c.isBulk || c.triageCategory === "BULK").length, [sortedCards]);
  const showBinsSortedCount = binUnder4SortedCount;

  const filteredBinCards: SavedCollectionItem[] = useMemo(() => {
    const list = binSavedCards.filter((card) => {
      // 1. Tier Filter
      if (selectedBinTierFilter !== "ALL") {
        if (selectedBinTierFilter === "PURE_BULK") {
          if (card.binTier !== "PURE_BULK" && !card.isBulk && card.triageCategory !== "BULK") return false;
        } else if (selectedBinTierFilter === "BIN_UNDER_4") {
          const isUnder4 =
            card.binTier === "BIN_UNDER_4" ||
            card.binTier === "BIN_1" ||
            card.binTier === "BIN_3" ||
            card.binTier === "BIN_4" ||
            (!card.isBulk && card.triageCategory === "DOLLAR_BIN");
          if (!isUnder4) return false;
        } else {
          if (card.binTier !== selectedBinTierFilter) return false;
        }
      }

      // 2. Sorting Status Filter
      const isCardSorted = Boolean(card.isSorted || card.data?.isSorted);
      if (sortStatusFilter === "SORTED" && !isCardSorted) return false;
      if (sortStatusFilter === "UNSORTED" && isCardSorted) return false;

      // 3. Search Term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const title = generateCdpTitle(card.data).toLowerCase();
        const player = (card.data.playerName || (card.data as any).player || "").toLowerCase();
        const team = (card.data.team || "").toLowerCase();
        const set = (card.data.setName || (card.data as any).set || "").toLowerCase();
        if (!title.includes(q) && !player.includes(q) && !team.includes(q) && !set.includes(q)) {
          return false;
        }
      }

      return true;
    });

    // 4. Sort by Market FMV (if active)
    if (valueSortOrder !== "none") {
      return [...list].sort((a, b) => {
        const valA = a.data?.estimatedValue ?? 0;
        const valB = b.data?.estimatedValue ?? 0;
        if (valA !== valB) {
          return valueSortOrder === "asc" ? valA - valB : valB - valA;
        }
        const nameA = a.data?.playerName || "";
        const nameB = b.data?.playerName || "";
        return nameA.localeCompare(nameB);
      });
    }

    return list;
  }, [binSavedCards, selectedBinTierFilter, sortStatusFilter, searchTerm, valueSortOrder]);

  // Aggregate totals: consolidate all sub-$4 bins into totalBinCards
  const totalBinCards =
    summary.binUnder4Count !== undefined && summary.binUnder4Count > 0
      ? summary.binUnder4Count
      : (summary.bin1Count || 0) + (summary.bin3Count || 0) + (summary.bin4Count || 0);
  const totalBinRetailValue =
    summary.binUnder4Count !== undefined && summary.binUnder4Count > 0
      ? summary.binUnder4Count * 2
      : (summary.bin1Count || 0) * 1 +
        (summary.bin3Count || 0) * 3 +
        (summary.bin4Count || 0) * 4;

  // Save manual stock calibration
  const handleSaveStockCalibration = async () => {
    if (!editingBinKey) return;
    const isUnder4 = editingBinKey === "binUnder4" || editingBinKey === "bin1" || editingBinKey === "bin3" || editingBinKey === "bin4";
    const updated: BinsInventorySummary = {
      ...summary,
      binUnder4Count: isUnder4 ? Math.max(0, editCountValue) : summary.binUnder4Count,
      bin1Count: editingBinKey === "bin1" ? Math.max(0, editCountValue) : summary.bin1Count,
      bin3Count: editingBinKey === "bin3" ? Math.max(0, editCountValue) : summary.bin3Count,
      bin4Count: editingBinKey === "bin4" ? Math.max(0, editCountValue) : summary.bin4Count,
      bulkPackagedCount: editingBinKey === "bulk" ? Math.max(0, editCountValue) : summary.bulkPackagedCount,
      lastUpdated: new Date().toISOString(),
    };
    await updateBinsSummary(updated, userId);
    setSummary(updated);
    setEditingBinKey(null);
    showToast(`Stock count updated successfully!`);
  };

  // Quick Card Show Floor Sell-Down execution
  const handleExecuteSellDown = async (binKey: "binUnder4" | "bin1" | "bin3" | "bin4" | "bulk", countToDeduct: number) => {
    setIsSellingDown(true);
    try {
      const pricePerCard = binKey === "bin1" ? 1 : binKey === "bin3" ? 3 : binKey === "bin4" ? 4 : 2;
      const binName = binKey === "bulk" ? "Bulk Box" : "<$4 Bins";
      const currentStock =
        binKey === "bulk"
          ? summary.bulkPackagedCount
          : (summary.binUnder4Count ?? totalBinCards);

      const actualDeduct = Math.min(currentStock, countToDeduct);
      const totalCashEarned = actualDeduct * pricePerCard;

      const updated: BinsInventorySummary = {
        ...summary,
        binUnder4Count: binKey !== "bulk" ? Math.max(0, (summary.binUnder4Count ?? totalBinCards) - actualDeduct) : summary.binUnder4Count,
        bulkPackagedCount: binKey === "bulk" ? Math.max(0, summary.bulkPackagedCount - actualDeduct) : summary.bulkPackagedCount,
        lastUpdated: new Date().toISOString(),
      };

      await updateBinsSummary(updated, userId);
      setSummary(updated);
      showToast(
        `Sold ${actualDeduct} cards from ${binName}! Cash collected: +$${totalCashEarned.toFixed(2)}`
      );
    } catch (err) {
      console.error("Sell down failed:", err);
    } finally {
      setIsSellingDown(false);
    }
  };

  // 1-Click Inventory Separation Execution
  const handleExecuteSeparation = async () => {
    if (savedCards.length === 0 || isSeparating) return;
    setIsSeparating(true);
    try {
      const result = await separateInventory(savedCards, userSettings, userId);
      if (updateCardsVaultAndBinBatch) {
        await updateCardsVaultAndBinBatch(result.updates);
      }
      setSummary({
        binUnder4Count: result.stats.binUnder4Count,
        bin1Count: result.stats.bin1Count,
        bin3Count: result.stats.bin3Count,
        bin4Count: result.stats.bin4Count,
        bulkPackagedCount: result.stats.bulkCount,
        lastUpdated: new Date().toISOString(),
      });
      showToast(
        `⚡ Separated Inventory! ${result.stats.vaultCount} cards kept in The Vault • ${result.stats.totalBinsCount} cards moved to <$4 Bins & Bulk (<$4 Bins: ${result.stats.binUnder4Count}, Bulk: ${result.stats.bulkCount}). Comps will only run on Vault cards.`
      );
    } catch (err) {
      console.error("Failed to separate inventory:", err);
      showToast("Failed to separate inventory. Please try again.");
    } finally {
      setIsSeparating(false);
    }
  };

  // Toggle Market FMV Sorting Order (desc -> asc -> none)
  const toggleValueSort = () => {
    setValueSortOrder((prev) => {
      if (prev === "none") return "desc";
      if (prev === "desc") return "asc";
      return "none";
    });
  };

  // Selection toggle helpers for bin cards (Supports Shift-Click Range Selection)
  const toggleSelectBinCard = (id: string, isShift: boolean = false) => {
    if (isShift && lastSelectedBinCardId && lastSelectedBinCardId !== id) {
      const idx1 = filteredBinCards.findIndex((c) => c.id === lastSelectedBinCardId);
      const idx2 = filteredBinCards.findIndex((c) => c.id === id);

      if (idx1 >= 0 && idx2 >= 0) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const rangeCards = filteredBinCards.slice(start, end + 1);

        setSelectedBinCardIds((prev) => {
          const next = new Set(prev);
          rangeCards.forEach((c) => next.add(c.id));
          return next;
        });
        setLastSelectedBinCardId(id);
        return;
      }
    }

    // Standard single-card toggle
    setSelectedBinCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setLastSelectedBinCardId(id);
  };

  const toggleSelectAllBinCards = () => {
    if (selectedBinCardIds.size === filteredBinCards.length) {
      setSelectedBinCardIds(new Set());
      setLastSelectedBinCardId(null);
    } else {
      setSelectedBinCardIds(new Set(filteredBinCards.map((c) => c.id)));
      setLastSelectedBinCardId(filteredBinCards[0]?.id || null);
    }
  };

  // Batch Promote Selected Bin Singles to The Vault (eBay / PSA / PC)
  const handleBatchPromoteToVault = async (targetDestination: VaultDestination) => {
    const selectedCards = binSavedCards.filter((c) => selectedBinCardIds.has(c.id));
    if (selectedCards.length === 0) return;

    const targetTriage: TriageStatus =
      targetDestination === "EBAY"
        ? "EBAY_RAW"
        : targetDestination === "PSA_GRADING"
        ? "GRADE_CANDIDATE"
        : "INBOX";

    const updates = selectedCards.map((c) => ({
      id: c.id,
      vaultDestination: targetDestination,
      binTier: undefined,
      isVaulted: true,
      isBulk: false,
      triageStatus: targetTriage,
    }));

    try {
      if (updateCardsVaultAndBinBatch) {
        await updateCardsVaultAndBinBatch(updates);
      } else if (updateCardVaultAndBin) {
        for (const u of updates) {
          await updateCardVaultAndBin(u.id, {
            vaultDestination: u.vaultDestination,
            binTier: u.binTier,
            isVaulted: u.isVaulted,
            isBulk: u.isBulk,
          });
          if (updateCardTriageStatus) {
            await updateCardTriageStatus(u.id, u.triageStatus);
          }
        }
      }

      setSelectedBinCardIds(new Set());
      setLastSelectedBinCardId(null);
      showToast(
        `Promoted ${selectedCards.length} cards to ${targetDestination} in The Vault!`
      );
    } catch (err) {
      console.error("Batch promote failed:", err);
      showToast("Failed to promote selected cards. Please retry.");
    }
  };

  // Promote a single bin card to The Vault (eBay / PSA / PC)
  const handlePromoteToVault = async (card: SavedCollectionItem, targetDestination: VaultDestination) => {
    if (!updateCardVaultAndBin) return;
    try {
      await updateCardVaultAndBin(card.id, {
        isVaulted: true,
        binTier: undefined,
        isBulk: false,
        vaultDestination: targetDestination,
      });
      if (updateCardTriageStatus) {
        const newTriage: TriageStatus =
          targetDestination === "EBAY"
            ? "EBAY_RAW"
            : targetDestination === "PSA_GRADING"
            ? "GRADE_CANDIDATE"
            : "INBOX";
        await updateCardTriageStatus(card.id, newTriage);
      }
      const cardName = card.data.playerName || generateCdpTitle(card.data);
      showToast(
        `Promoted "${cardName}" to ${targetDestination} in The Vault!`
      );
    } catch (err) {
      console.error("Failed to promote card to vault:", err);
    }
  };

  // Quick mark single as sold from physical bin
  const handleMarkBinSingleSold = async (card: SavedCollectionItem, soldPrice: number) => {
    if (!markCardAsSold) return;
    try {
      await markCardAsSold(card.id, {
        soldPrice: soldPrice,
        soldPlatform: "VENDOR_TABLE",
        soldFees: 0,
        soldDate: new Date().toISOString(),
      });
      const cardName = card.data.playerName || generateCdpTitle(card.data);
      showToast(`Sold "${cardName}" for $${soldPrice.toFixed(2)} cash!`);
    } catch (err) {
      console.error("Failed to mark card as sold:", err);
    }
  };

  // Mark single card as sorted into physical box
  const handleMarkCardSorted = async (card: SavedCollectionItem, isSorted: boolean = true) => {
    const dest = card.binTier || (card.isBulk ? "PURE_BULK" : "BIN_1");
    if (updateCardVaultAndBin) {
      await updateCardVaultAndBin(card.id, {
        isSorted,
        sortedAt: isSorted ? new Date().toISOString() : undefined,
        sortedDestination: isSorted ? dest : undefined,
      });
      showToast(
        isSorted
          ? `✓ Card marked as sorted into ${dest === "PURE_BULK" ? "Bulk Box" : dest.replace("_", " $")}!`
          : "Card marked as unsorted."
      );
    }
  };

  // Batch mark selected cards as sorted
  const handleBatchMarkSorted = async (isSorted: boolean = true) => {
    const ids = Array.from(selectedBinCardIds);
    if (ids.length === 0) return;

    if (markCardsSortedBatch) {
      await markCardsSortedBatch(ids, isSorted);
    } else if (updateCardsVaultAndBinBatch) {
      const updates = ids.map((id) => ({
        id,
        isSorted,
        sortedAt: isSorted ? new Date().toISOString() : undefined,
      }));
      await updateCardsVaultAndBinBatch(updates);
    }

    setSelectedBinCardIds(new Set());
    showToast(`✓ Marked ${ids.length} card(s) as ${isSorted ? "sorted" : "unsorted"}!`);
  };

  // 1-Click Sort All in a tier
  const handleSortAllInTier = async (tier: "BIN_1" | "BIN_3" | "BIN_4" | "PURE_BULK" | "ALL") => {
    const targetCards = binSavedCards.filter((c) => {
      if (c.isSorted || c.data?.isSorted) return false;
      if (tier === "ALL") return true;
      if (tier === "PURE_BULK") return c.binTier === "PURE_BULK" || c.isBulk || c.triageCategory === "BULK";
      return c.binTier === tier;
    });

    if (targetCards.length === 0) {
      showToast("All cards in this tier are already marked as sorted!");
      return;
    }

    const ids = targetCards.map((c) => c.id);
    if (markCardsSortedBatch) {
      await markCardsSortedBatch(ids, true, tier);
    } else if (updateCardsVaultAndBinBatch) {
      const updates = ids.map((id) => ({
        id,
        isSorted: true,
        sortedAt: new Date().toISOString(),
        sortedDestination: tier,
      }));
      await updateCardsVaultAndBinBatch(updates);
    }

    const tierName =
      tier === "ALL"
        ? "all unsorted bin & bulk"
        : tier === "PURE_BULK"
        ? "Bulk Box"
        : `${tier.replace("_", " $")} Show Bin`;
    showToast(`✓ Sorted ${targetCards.length} cards into ${tierName}!`);
  };

  // On-demand single card comp lookup
  const handlePullSingleComp = async (card: SavedCollectionItem) => {
    if (compingCardIds.has(card.id)) return;
    setCompingCardIds((prev) => new Set(prev).add(card.id));

    const cardTitle = sanitizeCompQuery(card.data) || generateCdpTitle(card.data);
    try {
      const res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cardTitle, cardData: card.data, fast: true, includeGraded: false }),
      });

      if (!res.ok) {
        showToast(`Could not retrieve comps for "${card.data.playerName || "Card"}".`);
        return;
      }

      const data = await res.json();
      const status = data.status || (data.price > 0 ? "success" : "needs_review");
      const estVal = data.price || data.estimatedMarketValue || data.medianPrice || 0;

      if (estVal > 0) {
        const oldVal = card.data.estimatedValue || 0;
        const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
        const deltaPct = oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

        const updatedData: CDPCardSchema = {
          ...card.data,
          previousEstimatedValue: oldVal > 0 ? oldVal : card.data.previousEstimatedValue,
          estimatedValue: estVal,
          rawEstimatedValue: estVal,
          compStatus: status === "success" ? "success" : "needs_review",
          compIsBaseEstimate: !!data.compIsBaseEstimate,
          priceChange: deltaDollar,
          priceChangePercentage: deltaPct,
          valueLastUpdated: new Date().toISOString(),
          lastPriceRefreshedAt: new Date().toISOString(),
          lastCompDate: new Date().toISOString(),
        };

        if (updateSavedCardDataBatch) {
          await updateSavedCardDataBatch([{ id: card.id, data: updatedData }]);
        }

        const binThreshold =
          card.binTier === "BIN_4" ? 4 : card.binTier === "BIN_3" ? 3 : card.binTier === "BIN_1" ? 1 : 0.5;

        // Check if card is a sleeper hit (e.g. worth $4+ or 1.5x+ bin price)
        if (estVal >= (userSettings?.minEbayRawThreshold || 4.0) && estVal > binThreshold * 1.5) {
          setSleeperAlert({ card: { ...card, data: updatedData }, compPrice: estVal });
          showToast(`🔥 Sleeper Alert: "${card.data.playerName || "Card"}" comps at $${estVal.toFixed(2)}! (Exceeds $${binThreshold} Bin)`);
        } else {
          showToast(`✓ Comps updated: "${card.data.playerName || "Card"}" FMV is $${estVal.toFixed(2)}`);
        }
      } else {
        showToast(`No exact comps found for "${card.data.playerName || "Card"}".`);
      }
    } catch (err: any) {
      console.error("Failed to comp card:", err);
      showToast(`Error fetching comps: ${err.message || "Network error"}`);
    } finally {
      setCompingCardIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }
  };

  // On-demand bulk comp lookup for selected cards in the dollar bin
  const handleBatchPullComps = async () => {
    if (isBulkComping || selectedBinCardIds.size === 0) return;
    const cardsToComp = binSavedCards.filter((c) => selectedBinCardIds.has(c.id));
    if (cardsToComp.length === 0) return;

    setIsBulkComping(true);
    const total = cardsToComp.length;
    let pricedCount = 0;
    let sleepersFound = 0;
    const BATCH_CONCURRENCY = 4;

    for (let i = 0; i < total; i += BATCH_CONCURRENCY) {
      const chunk = cardsToComp.slice(i, i + BATCH_CONCURRENCY);
      setBulkCompProgress({ current: Math.min(i + chunk.length, total), total });

      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const cardTitle = sanitizeCompQuery(item.data) || generateCdpTitle(item.data);
          try {
            const res = await fetch("/api/comps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: cardTitle, cardData: item.data, fast: true, includeGraded: false }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const estVal = data.price || data.estimatedMarketValue || data.medianPrice || 0;
            if (estVal > 0) {
              const oldVal = item.data.estimatedValue || 0;
              const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
              const deltaPct = oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;
              const updatedData: CDPCardSchema = {
                ...item.data,
                previousEstimatedValue: oldVal > 0 ? oldVal : item.data.previousEstimatedValue,
                estimatedValue: estVal,
                rawEstimatedValue: estVal,
                compStatus: "success",
                compIsBaseEstimate: !!data.compIsBaseEstimate,
                priceChange: deltaDollar,
                priceChangePercentage: deltaPct,
                valueLastUpdated: new Date().toISOString(),
                lastPriceRefreshedAt: new Date().toISOString(),
                lastCompDate: new Date().toISOString(),
              };

              const binThreshold =
                item.binTier === "BIN_4" ? 4 : item.binTier === "BIN_3" ? 3 : item.binTier === "BIN_1" ? 1 : 0.5;
              if (estVal >= (userSettings?.minEbayRawThreshold || 4.0) && estVal > binThreshold * 1.5) {
                sleepersFound++;
              }

              return { id: item.id, data: updatedData };
            }
          } catch {
            return null;
          }
          return null;
        })
      );

      const validUpdates = chunkResults.filter(Boolean) as { id: string; data: CDPCardSchema }[];
      if (validUpdates.length > 0 && updateSavedCardDataBatch) {
        await updateSavedCardDataBatch(validUpdates);
        pricedCount += validUpdates.length;
      }
    }

    setIsBulkComping(false);
    setSelectedBinCardIds(new Set());
    if (sleepersFound > 0) {
      showToast(`⚡ Pulled comps for ${pricedCount}/${total} cards. Found ${sleepersFound} potential sleeper hits!`);
    } else {
      showToast(`⚡ Finished comps for ${pricedCount}/${total} cards.`);
    }
  };

  // Execute Remove Sorted from Platform
  const handleConfirmRemoveSorted = async () => {
    const sortedIds = sortedCards.map((c) => c.id);
    if (sortedIds.length === 0) return;

    setIsRemovingSorted(true);
    try {
      if (removeCardsBatch) {
        await removeCardsBatch(sortedIds);
      } else if (removeCard) {
        for (const id of sortedIds) {
          removeCard(id);
        }
      }

      // If user chose to keep count in physical warehouse ledger, update summary counts
      if (keepCountInLedger) {
        const updated: BinsInventorySummary = {
          ...summary,
          binUnder4Count: (summary.binUnder4Count || 0) + binUnder4SortedCount,
          bulkPackagedCount: (summary.bulkPackagedCount || 0) + bulkSortedCount,
          lastUpdated: new Date().toISOString(),
        };
        await updateBinsSummary(updated, userId);
        setSummary(updated);
      }

      setSelectedBinCardIds(new Set());
      setIsRemoveSortedModalOpen(false);
      showToast(`✓ Removed ${sortedIds.length} sorted cards from the entire platform!`);
    } catch (err) {
      console.error("Failed to remove sorted cards:", err);
      showToast("Failed to remove sorted cards. Please try again.");
    } finally {
      setIsRemovingSorted(false);
    }
  };

  // Execute Unsorted Single Card Removal Safeguard
  const handleConfirmUnsortedSingleRemove = async (card: SavedCollectionItem) => {
    if (!removeCard) return;
    try {
      removeCard(card.id);
      setCardToConfirmUnsortedRemove(null);
      showToast(`✓ Removed "${card.data.playerName || "Card"}" from platform.`);
    } catch (err) {
      console.error("Single removal failed:", err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-4 text-xs font-mono font-bold text-emerald-300 shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {onNavigateToCollection && (
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <button
            onClick={onNavigateToCollection}
            className="hover:text-cyan-400 flex items-center gap-1.5 transition cursor-pointer text-slate-300 hover:underline"
          >
            ← Back to Master Inventory
          </button>
          <span>/</span>
          <span className="text-slate-100 font-bold">Show Bins &amp; Bulk Desk</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 text-indigo-400 shadow-inner">
            <Box className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-100 tracking-tight">
                Show Monster Boxes &amp; Bins Manager
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                0 Vault Quota Consumed
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Organize multi-price bargain monster boxes ($1, $3, $4+), bulk wholesale lots, and execute fast card show floor sales.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToScanner && (
            <button
              onClick={onNavigateToScanner}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 px-3.5 py-2 text-xs font-extrabold text-white shadow-lg shadow-red-500/20 transition active:scale-95 cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Intake New Batch</span>
            </button>
          )}

          {onNavigateToCollection && (
            <button
              onClick={onNavigateToCollection}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 px-3.5 py-2 text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>The Vault (Hits) ➜</span>
            </button>
          )}
        </div>
      </div>

      {/* 1-CLICK INVENTORY SEPARATION CONTROLLER BANNER */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/70 via-slate-900/90 to-purple-950/70 p-4 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-white tracking-wide">
                Warehouse Inventory Separation
              </h3>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Auto-Triage Active
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Keeps all <strong className="text-white">eBay Singles</strong>, <strong className="text-white">PSA Grading</strong>, and <strong className="text-white">PC</strong> in The Vault. Moves all remaining cards here into <strong className="text-cyan-300">Value Bins &amp; Bulk</strong>. You can always promote cards back to The Vault below. Comps run strictly on Vault cards.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExecuteSeparation}
          disabled={isSeparating || savedCards.length === 0}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          title="Separate all inventory now"
        >
          <Sparkles className="h-4 w-4 text-amber-300" />
          <span>{isSeparating ? "Separating Inventory..." : "Separate Entire Inventory Now"}</span>
        </button>
      </div>

      {/* SECTION 1: PHYSICAL MONSTER BOXES INVENTORY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* <$4 VALUE BINS (ALL SUB-$4 CARDS) */}
        <div className="relative rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950 p-5 shadow-xl backdrop-blur-xl flex flex-col justify-between overflow-hidden group">
          <div className="absolute top-0 right-0 h-28 w-28 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <Box className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-mono font-black uppercase tracking-wider text-cyan-200">
                    &lt;$4 Value Bins
                  </h3>
                  <p className="text-[10px] text-slate-400">Monster Boxes • All Raw Singles under $4.00</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setEditingBinKey("binUnder4");
                  setEditCountValue(totalBinCards);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition cursor-pointer"
                title="Calibrate count"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white font-mono">
                  {totalBinCards.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">cards</span>
              </div>
              <p className="text-xs font-mono text-cyan-400 font-bold mt-1">
                Estimated Value: ~${totalBinRetailValue.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80">
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
              Quick Show Floor Sell-Down:
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => handleExecuteSellDown("binUnder4", 5)}
                disabled={isSellingDown || totalBinCards < 5}
                className="py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                -5 Cards
              </button>
              <button
                onClick={() => handleExecuteSellDown("binUnder4", 10)}
                disabled={isSellingDown || totalBinCards < 10}
                className="py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                -10 Cards
              </button>
              <button
                onClick={() => handleExecuteSellDown("binUnder4", 25)}
                disabled={isSellingDown || totalBinCards < 25}
                className="py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-xs font-mono font-bold text-slate-300 hover:text-cyan-300 transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                -25 Cards
              </button>
            </div>
          </div>
        </div>

        {/* BULK OUTFLOW LOTS */}
        <div className="relative rounded-3xl border border-rose-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950 p-5 shadow-xl backdrop-blur-xl flex flex-col justify-between overflow-hidden group">
          <div className="absolute top-0 right-0 h-28 w-28 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-mono font-black uppercase tracking-wider text-rose-200">
                    Bulk Commons Outflow
                  </h3>
                  <p className="text-[10px] text-slate-400">Packaged / Wholesale Lots (&lt;$1.00)</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setEditingBinKey("bulk");
                  setEditCountValue(summary.bulkPackagedCount);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:text-rose-300 hover:bg-slate-800/80 transition cursor-pointer"
                title="Calibrate count"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="my-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white font-mono">
                  {summary.bulkPackagedCount.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">cards</span>
              </div>
              <p className="text-xs font-mono text-rose-400 font-bold mt-1">
                ~{Math.floor(summary.bulkPackagedCount / 5000)} Monster Boxes (5k-count)
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Packaged off collection floor</span>
            <button
              onClick={() => {
                const newCount = Math.max(0, summary.bulkPackagedCount - 1000);
                const updated = { ...summary, bulkPackagedCount: newCount, lastUpdated: new Date().toISOString() };
                updateBinsSummary(updated, userId);
                setSummary(updated);
                showToast("Deducted 1,000 bulk commons (Shipped / Donated)");
              }}
              disabled={summary.bulkPackagedCount < 1000}
              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-[11px] font-mono font-bold text-rose-300 transition active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              Ship 1k Lot
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: SHOW REGISTER & SUMMARY BAR */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Total &lt;$4 Bins Stock
            </p>
            <p className="text-2xl font-black text-white font-mono">
              {totalBinCards.toLocaleString()}{" "}
              <span className="text-xs font-normal text-slate-400">physical cards</span>
            </p>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Total Show Retail Worth
            </p>
            <p className="text-2xl font-black text-emerald-400 font-mono">
              ${totalBinRetailValue.toFixed(2)}
            </p>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          <div>
            <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Intake Batches Logged
            </p>
            <p className="text-2xl font-black text-cyan-300 font-mono">
              {records.length}
            </p>
          </div>
        </div>

        {/* Custom Cash Sale Tool */}
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800 w-full md:w-auto">
          <span className="text-xs font-mono font-bold text-slate-300 px-2 shrink-0">
            &lt;$4 Bins Sale:
          </span>

          <input
            type="number"
            min="1"
            max="1000"
            value={sellQty}
            onChange={(e) => setSellQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 rounded-xl border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs font-mono font-bold text-white text-center focus:outline-none focus:border-cyan-500"
          />

          <button
            onClick={() => handleExecuteSellDown("binUnder4", sellQty)}
            disabled={isSellingDown || totalBinCards === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-xs font-extrabold text-slate-950 shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Record Cash +${(sellQty * 2).toFixed(0)}</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: INDIVIDUAL BIN CARDS INVENTORY TABLE (IF ANY DIGITIZED) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-bold text-slate-100">
                Show Bins &amp; Bulk Cards ({filteredBinCards.length})
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                0 Vault Quota
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              These cards do not count towards your Vault. Sort them physically into your boxes/bins, then remove them from the platform once sorted.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {[
                { id: "ALL" as const, label: "All Items" },
                { id: "BIN_UNDER_4" as const, label: "<$4 Bins" },
                { id: "PURE_BULK" as const, label: "Bulk Box" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setSelectedBinTierFilter(pill.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedBinTierFilter === pill.id
                      ? "bg-cyan-500 text-slate-950 font-black shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search bin cards..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44 sm:w-56"
              />
            </div>

            {/* Sort by Market FMV Value Button in toolbar */}
            <button
              type="button"
              onClick={toggleValueSort}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                valueSortOrder !== "none"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/10"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800"
              }`}
              title={
                valueSortOrder === "desc"
                  ? "Market FMV sorted: High → Low (Click for Low → High)"
                  : valueSortOrder === "asc"
                  ? "Market FMV sorted: Low → High (Click to clear sort)"
                  : "Click to sort by Market FMV"
              }
            >
              {valueSortOrder === "desc" ? (
                <>
                  <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                  <span>FMV: High → Low</span>
                </>
              ) : valueSortOrder === "asc" ? (
                <>
                  <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                  <span>FMV: Low → High</span>
                </>
              ) : (
                <>
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  <span>Sort by Value</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SORTING CONTROLS & PLATFORM REMOVAL TOOLBAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl shadow-lg flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-slate-400 font-bold mr-1">Sort State:</span>
            {[
              { id: "ALL" as const, label: "All", count: binSavedCards.length },
              { id: "UNSORTED" as const, label: "🟡 Needs Sorting", count: unsortedCards.length },
              { id: "SORTED" as const, label: "🟢 Sorted", count: sortedCards.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSortStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  sortStatusFilter === tab.id
                    ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <span>{tab.label}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-950 text-slate-300">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Actions & Remove Sorted Button */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Sort Dropdown / Quick buttons */}
            {unsortedCards.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSortAllInTier("ALL")}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-bold border border-slate-700 transition cursor-pointer flex items-center gap-1"
                  title="Mark all unsorted cards as physically sorted"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark All Sorted</span>
                </button>
              </div>
            )}

            {/* DEDICATED REMOVE SORTED BUTTON (ONLY ONCE SORTED) */}
            <button
              onClick={() => setIsRemoveSortedModalOpen(true)}
              disabled={sortedCards.length === 0}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition active:scale-95 cursor-pointer shadow-lg ${
                sortedCards.length > 0
                  ? "bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/20"
                  : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60"
              }`}
              title={
                sortedCards.length > 0
                  ? `Permanently remove ${sortedCards.length} sorted cards from the platform`
                  : "Cards must be sorted into bins/bulk boxes first before removing from platform."
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Sorted from Platform</span>
              {sortedCards.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-white/20 text-white">
                  {sortedCards.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {filteredBinCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-8 text-center space-y-3">
            <Box className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">
              {binSavedCards.length === 0
                ? "No individual bin or bulk cards in your database."
                : "No cards match your filter criteria."}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cards routed to Show Bins ($1, $3, $4) or Bulk Box are managed here. Sort cards into your boxes, then use &quot;Remove Sorted from Platform&quot; once sorted.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* STICKY BATCH PROMOTION TOOLBAR */}
            {selectedBinCardIds.size > 0 && (
              <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur-xl shadow-2xl animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-mono font-black text-white">
                    {selectedBinCardIds.size} Card{selectedBinCardIds.size === 1 ? "" : "s"} Selected
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* On-Demand Batch Pull Comps */}
                  <button
                    onClick={handleBatchPullComps}
                    disabled={isBulkComping}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Pull current eBay market comps for selected cards on-demand"
                  >
                    {isBulkComping ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Comping ({bulkCompProgress.current}/{bulkCompProgress.total})...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" />
                        <span>⚡ Pull Comps ({selectedBinCardIds.size})</span>
                      </>
                    )}
                  </button>

                  <span className="text-slate-600 text-xs">|</span>

                  {/* Mark Selected as Sorted */}
                  <button
                    onClick={() => handleBatchMarkSorted(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Mark selected cards as sorted into physical bins/boxes"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>✓ Mark Sorted</span>
                  </button>

                  <span className="text-slate-600 text-xs">|</span>

                  {/* Vault Promotion buttons */}
                  <button
                    onClick={() => handleBatchPromoteToVault("EBAY")}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Promote to eBay Singles Desk in The Vault"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span>+ To eBay Single</span>
                  </button>

                  <button
                    onClick={() => handleBatchPromoteToVault("PSA_GRADING")}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Promote to PSA Grading Desk in The Vault"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>+ To PSA Grading</span>
                  </button>

                  <button
                    onClick={() => handleBatchPromoteToVault("PC")}
                    className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md shadow-cyan-600/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Store className="h-3.5 w-3.5" />
                    <span>+ To PC</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedBinCardIds(new Set());
                      setLastSelectedBinCardId(null);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* High-Value Sleeper Card Alert */}
            {sleeperAlert && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/50 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-amber-500/10 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                    <Zap className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🔥 High-Value Sleeper Card Found!</span>
                    </div>
                    <div className="text-xs text-slate-200">
                      <strong>{sleeperAlert.card.data.playerName}</strong> comps at{" "}
                      <strong className="text-emerald-400 font-mono text-sm">${sleeperAlert.compPrice.toFixed(2)}</strong> (currently in{" "}
                      {sleeperAlert.card.binTier === "PURE_BULK" || sleeperAlert.card.isBulk
                        ? "Bulk Box"
                        : "<$4 Bins"}
                      ).
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handlePromoteToVault(sleeperAlert.card, "EBAY");
                      setSleeperAlert(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-black shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span>Promote to eBay Raw ($4+)</span>
                  </button>

                  <button
                    onClick={() => {
                      handlePromoteToVault(sleeperAlert.card, "PSA_GRADING");
                      setSleeperAlert(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-black shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Grade at PSA</span>
                  </button>

                  <button
                    onClick={() => setSleeperAlert(null)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                    title="Dismiss alert"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredBinCards.length > 0 && selectedBinCardIds.size === filteredBinCards.length}
                          onChange={toggleSelectAllBinCards}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Card / Player</th>
                      <th className="py-3 px-4">Desk / Tier</th>
                      <th className="py-3 px-4">Sorting Status</th>
                      <th className="py-3 px-4">Bin Price</th>
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={toggleValueSort}
                          className="inline-flex items-center gap-1.5 hover:text-white transition group cursor-pointer text-[11px] font-mono uppercase tracking-wider text-left"
                          title={
                            valueSortOrder === "desc"
                              ? "Market FMV sorted: High → Low (Click for Low → High)"
                              : valueSortOrder === "asc"
                              ? "Market FMV sorted: Low → High (Click to reset sort)"
                              : "Click to sort by Market FMV value"
                          }
                        >
                          <span className={valueSortOrder !== "none" ? "text-cyan-300 font-bold" : ""}>
                            Market FMV
                          </span>
                          {valueSortOrder === "desc" ? (
                            <span className="inline-flex items-center gap-0.5 text-cyan-400 font-bold bg-cyan-950/80 border border-cyan-500/40 rounded px-1.5 py-0.5 text-[10px] normal-case">
                              <span>high</span>
                              <ArrowDown className="h-3 w-3 inline" />
                            </span>
                          ) : valueSortOrder === "asc" ? (
                            <span className="inline-flex items-center gap-0.5 text-cyan-400 font-bold bg-cyan-950/80 border border-cyan-500/40 rounded px-1.5 py-0.5 text-[10px] normal-case">
                              <span>low</span>
                              <ArrowUp className="h-3 w-3 inline" />
                            </span>
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400 transition" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Box Location</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                    {filteredBinCards.map((card) => {
                      const price =
                        card.binTier === "BIN_1"
                          ? 1
                          : card.binTier === "BIN_3"
                          ? 3
                          : card.binTier === "BIN_4"
                          ? 4
                          : 0;

                      const isCardSorted = Boolean(card.isSorted || card.data?.isSorted);
                      const isSelected = selectedBinCardIds.has(card.id);

                      return (
                        <tr
                          key={card.id}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              const target = e.target as HTMLElement;
                              if (
                                target.closest("button") ||
                                target.closest("select") ||
                                target.closest("input") ||
                                target.closest("a")
                              ) {
                                return;
                              }
                              e.preventDefault();
                              toggleSelectBinCard(card.id, true);
                            }
                          }}
                          className={`transition ${
                            isSelected
                              ? "bg-cyan-500/10 font-medium"
                              : "hover:bg-slate-800/30"
                          }`}
                        >
                          <td
                            className="py-3 px-3 w-10 text-center cursor-pointer select-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                e.preventDefault();
                              }
                              toggleSelectBinCard(card.id, e.shiftKey);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.shiftKey) {
                                  e.preventDefault();
                                }
                                toggleSelectBinCard(card.id, e.shiftKey);
                              }}
                              onChange={() => {}}
                              title={
                                isSelected
                                  ? "Checked (Hold Shift and click another card to select in-between)"
                                  : "Click to select (Hold Shift to select range)"
                              }
                              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer h-4 w-4"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                onClick={() => onInspectCard && onInspectCard(card)}
                                className="h-12 w-9 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer hover:border-cyan-400 transition"
                              >
                                {card.frontPreview ? (
                                  <img
                                    src={card.frontPreview}
                                    alt={card.data.playerName || "Card"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-slate-600">
                                    <Box className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p
                                  onClick={() => onInspectCard && onInspectCard(card)}
                                  className="font-bold text-white hover:text-cyan-300 transition cursor-pointer"
                                >
                                  {card.data.playerName || generateCdpTitle(card.data) || "Untitled Card"}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {[card.data.year, card.data.setName, card.data.cardNumber ? `#${card.data.cardNumber}` : null]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {(() => {
                              const isBulk = card.binTier === "PURE_BULK" || card.isBulk || card.triageCategory === "BULK";
                              return (
                                <select
                                  value={isBulk ? "PURE_BULK" : "BIN_UNDER_4"}
                                  onChange={async (e) => {
                                    const newTier = e.target.value as BinTier;
                                    if (updateCardVaultAndBin) {
                                      await updateCardVaultAndBin(card.id, {
                                        binTier: newTier,
                                        isVaulted: false,
                                        isBulk: newTier === "PURE_BULK",
                                        triageCategory: newTier === "PURE_BULK" ? "BULK" : "DOLLAR_BIN",
                                        vaultDestination: undefined,
                                      });
                                      showToast(
                                        `Updated to ${newTier === "PURE_BULK" ? "Bulk Box" : "<$4 Bins"}!`
                                      );
                                    }
                                  }}
                                  className={`rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold border outline-none cursor-pointer ${
                                    !isBulk
                                      ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/40 hover:border-cyan-400"
                                      : "bg-rose-950/80 text-rose-300 border-rose-500/40 hover:border-rose-400"
                                  }`}
                                  title="Click to change destination box"
                                >
                                  <option value="BIN_UNDER_4">&lt;$4 Bins</option>
                                  <option value="PURE_BULK">Bulk Box</option>
                                </select>
                              );
                            })()}
                          </td>

                          {/* Sorting Status Column */}
                          <td className="py-3 px-4">
                            {isCardSorted ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                  <span>✓ Sorted</span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <span>Needs Sorting</span>
                                </span>
                                <button
                                  onClick={() => handleMarkCardSorted(card, true)}
                                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 transition cursor-pointer"
                                  title="Mark card as sorted into physical box"
                                >
                                  Mark Sorted
                                </button>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-slate-300">
                            ${price > 0 ? price.toFixed(2) : "0.25"}
                          </td>

                          {/* Market FMV / Comps Column */}
                          <td className="py-3 px-4">
                            {compingCardIds.has(card.id) ? (
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Comping...</span>
                              </div>
                            ) : card.data.estimatedValue && card.data.estimatedValue > 0 ? (
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-black text-emerald-400 text-xs">
                                      ${card.data.estimatedValue.toFixed(2)}
                                    </span>
                                    {card.data.estimatedValue >= (userSettings?.minEbayRawThreshold || 4.0) &&
                                      card.data.estimatedValue > (price > 0 ? price * 1.5 : 1.5) && (
                                        <span
                                          className="text-[9px] font-mono font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                          title={`Market FMV ($${card.data.estimatedValue.toFixed(2)}) is higher than this $${price} bin!`}
                                        >
                                          🔥 Sleeper
                                        </span>
                                      )}
                                  </div>
                                  <span className="text-[9px] font-mono text-slate-500 block">
                                    {card.data.lastPriceRefreshedAt
                                      ? `Comped ${new Date(card.data.lastPriceRefreshedAt).toLocaleDateString(undefined, {
                                          month: "numeric",
                                          day: "numeric",
                                        })}`
                                      : "eBay Browse"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handlePullSingleComp(card)}
                                  className="p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition cursor-pointer"
                                  title="Rerun on-demand comp"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePullSingleComp(card)}
                                className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                                title="Pull current eBay market comps for this card"
                              >
                                <Zap className="h-3 w-3" />
                                <span>Check Comps</span>
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-400 text-xs">
                            {card.batchName || "Monster Box 1"}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Promote to Vault Hits */}
                              <button
                                onClick={() => handlePromoteToVault(card, "EBAY")}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                  card.data.estimatedValue &&
                                  card.data.estimatedValue >= (userSettings?.minEbayRawThreshold || 4.0) &&
                                  card.data.estimatedValue > (price > 0 ? price * 1.5 : 1.5)
                                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20"
                                    : "bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 hover:text-white"
                                }`}
                                title="Promote to eBay Queue in The Vault"
                              >
                                {card.data.estimatedValue &&
                                card.data.estimatedValue >= (userSettings?.minEbayRawThreshold || 4.0) &&
                                card.data.estimatedValue > (price > 0 ? price * 1.5 : 1.5)
                                  ? "🔥 Promote to eBay"
                                  : "+ To eBay"}
                              </button>

                              <button
                                onClick={() => handlePromoteToVault(card, "PSA_GRADING")}
                                className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-[11px] font-bold text-purple-300 hover:text-white transition cursor-pointer"
                                title="Promote to PSA Grading in The Vault"
                              >
                                + To PSA
                              </button>

                              <button
                                onClick={() => handlePromoteToVault(card, "PC")}
                                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-[11px] font-bold text-cyan-300 hover:text-white transition cursor-pointer"
                                title="Promote to PC Showcase in The Vault"
                              >
                                + To PC
                              </button>

                              {/* Mark Sold */}
                              <button
                                onClick={() => handleMarkBinSingleSold(card, price > 0 ? price : 1)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 hover:text-white transition cursor-pointer"
                                title="Record cash sale"
                              >
                                Sold ${price > 0 ? price : 1}
                              </button>

                              {/* Delete / Remove Card from platform (Safeguard: must be sorted first) */}
                              {removeCard && (
                                <button
                                  onClick={() => {
                                    if (isCardSorted) {
                                      removeCard(card.id);
                                      showToast(`✓ Removed "${card.data.playerName || "Card"}" from platform.`);
                                    } else {
                                      setCardToConfirmUnsortedRemove(card);
                                    }
                                  }}
                                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                                  title={
                                    isCardSorted
                                      ? "Remove sorted card from platform"
                                      : "Card must be sorted before removal"
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: INTAKE BATCHES HISTORY (PHYSICAL CHECKOFF LOG) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-indigo-400" />
          <h2 className="text-base font-bold text-slate-100">
            Intake Batches &amp; Physical Checkoff History ({records.length})
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 text-center space-y-2">
            <Archive className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-400">
              No completed batch intake records found.
            </p>
            <p className="text-[11px] text-slate-500">
              When you intake a batch via the Batch Scanner and review physical buckets, the checkoff record will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-4">Batch Name</th>
                    <th className="py-3 px-4">Date Ingested</th>
                    <th className="py-3 px-4">Total Cards</th>
                    <th className="py-3 px-4">The Vault (Hits)</th>
                    <th className="py-3 px-4">Show Bins Stocked</th>
                    <th className="py-3 px-4">Bulk Commons</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          <span>{rec.name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(rec.date).toLocaleDateString()} {new Date(rec.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {rec.totalCards}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {rec.hitsCount} hits
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          +{rec.binsCount} cards
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          +{rec.bulkCount} bulk
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          COMPLETED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* STOCK CALIBRATION MODAL */}
      {editingBinKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Calibrate {editingBinKey === "bulk" ? "Bulk Outflow" : "<$4 Value Bins"} Stock
              </h3>
              <button
                onClick={() => setEditingBinKey(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter the exact count of physical cards currently in this box.
            </p>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                Current Count:
              </label>
              <input
                type="number"
                min="0"
                value={editCountValue}
                onChange={(e) => setEditCountValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingBinKey(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStockCalibration}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold shadow-md active:scale-95"
              >
                Save Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REMOVE ALL SORTED CARDS FROM PLATFORM */}
      {isRemoveSortedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Remove Sorted Cards from Platform
                  </h3>
                  <p className="text-xs text-rose-400 font-mono font-bold">
                    {sortedCards.length} Sorted Card{sortedCards.length === 1 ? "" : "s"} Ready for Removal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRemoveSortedModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5 text-xs text-slate-300">
              <p className="font-semibold text-white">
                These show bin and bulk cards have been physically sorted into your physical monster boxes.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-slate-800/80">
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">&lt;$4 Bins:</span>
                  <span className="text-white font-bold text-sm">{showBinsSortedCount} cards</span>
                  <span className="text-[10px] text-slate-500 block">Value singles &lt;$4.00</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Bulk Box:</span>
                  <span className="text-rose-400 font-bold text-sm">{bulkSortedCount} cards</span>
                  <span className="text-[10px] text-slate-500 block">Pure bulk wholesale lots</span>
                </div>
              </div>
              <p className="text-slate-400 text-[11px] pt-1">
                Confirming will permanently delete these {sortedCards.length} sorted cards from the platform database and clear them from your views. (0 Vault slots consumed).
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepCountInLedger}
                onChange={(e) => setKeepCountInLedger(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <span>Preserve total count in physical warehouse stock (+{sortedCards.length} cards)</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRemoveSortedModalOpen(false)}
                disabled={isRemovingSorted}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveSorted}
                disabled={isRemovingSorted}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-xs font-black text-white shadow-lg shadow-rose-600/30 transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isRemovingSorted ? "Removing Cards..." : `Confirm & Remove ${sortedCards.length} Cards`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SAFEGUARD FOR ATTEMPTED REMOVAL OF UNSORTED CARD */}
      {cardToConfirmUnsortedRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Card Is Not Sorted Yet!
                  </h3>
                  <p className="text-xs text-amber-400 font-mono font-bold">
                    Physical Sorting Workflow Safeguard
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCardToConfirmUnsortedRemove(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 text-xs text-slate-300">
              <p className="text-white font-bold">
                {cardToConfirmUnsortedRemove.data.playerName || generateCdpTitle(cardToConfirmUnsortedRemove.data) || "Untitled Card"}
              </p>
              <p className="text-slate-400">
                Destination: <strong className="text-amber-300 font-mono">{cardToConfirmUnsortedRemove.binTier ? cardToConfirmUnsortedRemove.binTier.replace("_", " $") : cardToConfirmUnsortedRemove.isBulk ? "Bulk Box" : "Show Bin"}</strong>
              </p>
              <p className="text-slate-300 pt-1">
                As per your process, show bins and bulk cards must be physically sorted into their monster boxes before removing from the platform.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCardToConfirmUnsortedRemove(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmUnsortedSingleRemove(cardToConfirmUnsortedRemove)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-xs font-black text-white shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Mark Sorted &amp; Remove Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
