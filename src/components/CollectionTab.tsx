"use client";

import React, { useState, useMemo, useEffect } from "react";
import { SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { exportSavedCollectionToCSV } from "@/lib/csvExport";
import { generateCdpTitle } from "@/lib/titleGenerator";
import { useAuth } from "@/context/AuthContext";
import { PortfolioChart } from "@/components/PortfolioChart";
import { GainersFallersWidget } from "@/components/GainersFallersWidget";
import { PortfolioSnapshot } from "@/types/portfolio";
import {
  getPortfolioSnapshots,
  recordPortfolioSnapshot,
  computeGainersAndFallers,
} from "@/lib/portfolioHistory";
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit3,
  Check,
} from "lucide-react";

interface CollectionTabProps {
  savedCards: SavedCollectionItem[];
  removeCard: (id: string) => void;
  clearCollection: () => void;
  onInspectCard?: (card: SavedCollectionItem) => void;
  updateSavedCardDataBatch?: (updates: { id: string; data: CDPCardSchema }[]) => void;
  renameBatch?: (batchId: string, newBatchName: string) => Promise<boolean>;
}

type SortField = "price" | "dateAdded" | "title" | "player" | "year";

export function CollectionTab({
  savedCards,
  removeCard,
  clearCollection,
  onInspectCard,
  updateSavedCardDataBatch,
  renameBatch,
}: CollectionTabProps) {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSport, setSelectedSport] = useState("all");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [filterRookie, setFilterRookie] = useState(false);
  const [filterAuto, setFilterAuto] = useState(false);
  const [filterMem, setFilterMem] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Portfolio snapshots for Robinhood graph
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

  // Select all cards belonging to a specific batch
  const selectBatchCards = (batchId: string) => {
    setSelectedBatchId(batchId);
    if (batchId === "all") {
      setSelectedIds(new Set());
    } else {
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

      return matchesSearch && matchesSport && matchesBatch && matchesRookie && matchesAuto && matchesMem;
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
        comparison = (a.data?.year || 0) - (b.data?.year || 0);
      } else if (sortBy === "dateAdded") {
        comparison = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [savedCards, searchTerm, selectedSport, selectedBatchId, filterRookie, filterAuto, filterMem, sortBy, sortOrder]);

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
      setSortOrder(field === "price" || field === "year" || field === "dateAdded" ? "desc" : "asc");
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
    const unpriced = savedCards.filter(
      (c) => c.data.estimatedValue === undefined || c.data.estimatedValue === 0
    );
    setSelectedIds(new Set(unpriced.map((c) => c.id)));
  };

  const handleExportCSV = () => {
    exportSavedCollectionToCSV(filteredCards, `my_card_collection_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Compute gainers & fallers for widget
  const { gainers, fallers, hasPriceHistory } = useMemo(() => {
    return computeGainersAndFallers(savedCards);
  }, [savedCards]);

  // Rate-limited Bulk Comps Execution Engine with Price Delta Tracking
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
            const oldVal = item.data.estimatedValue || 0;
            const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
            const deltaPct =
              oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

            const updatedData: CDPCardSchema = {
              ...item.data,
              previousEstimatedValue: oldVal > 0 ? oldVal : item.data.previousEstimatedValue,
              estimatedValue: estVal,
              priceChange: deltaDollar,
              priceChangePercentage: deltaPct,
              valueLastUpdated: new Date().toISOString(),
              lastPriceRefreshedAt: new Date().toISOString(),
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

      // Record snapshot
      const newTotal = savedCards.reduce((sum, c) => {
        const matching = pendingUpdates.find((u) => u.id === c.id);
        return sum + (matching ? matching.data.estimatedValue || 0 : c.data.estimatedValue || 0);
      }, 0);

      recordPortfolioSnapshot(
        currentUser?.uid,
        newTotal,
        savedCards.length,
        pendingUpdates.length,
        "Market Valuation Refresh"
      ).then((snap) => {
        setSnapshots((prev) => [...prev, snap]);
      });
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    setBulkSummaryMessage(
      `Completed valuation! Applied market values to ${pricedSuccessfully} of ${total} selected card${total > 1 ? "s" : ""}.`
    );
    setTimeout(() => setBulkSummaryMessage(null), 5000);
  };

  // Dedicated Full Portfolio Market Refresh Handler (Weekly / Monthly Sync)
  const handleRefreshPortfolioPrices = async () => {
    if (savedCards.length === 0 || isRefreshingMarket) return;

    setIsRefreshingMarket(true);
    setBulkSummaryMessage("Syncing latest eBay market comps for your collection...");

    const cardsToRefresh = savedCards.slice(0, 15); // Refresh top 15 cards in batch
    const pendingUpdates: { id: string; data: CDPCardSchema }[] = [];

    for (const item of cardsToRefresh) {
      const cardTitle = generateCdpTitle(item.data);
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
            const oldVal = item.data.estimatedValue || 0;
            const deltaDollar = oldVal > 0 ? Math.round((estVal - oldVal) * 100) / 100 : 0;
            const deltaPct =
              oldVal > 0 ? Math.round(((estVal - oldVal) / oldVal) * 1000) / 10 : 0;

            const updatedData: CDPCardSchema = {
              ...item.data,
              previousEstimatedValue: oldVal > 0 ? oldVal : item.data.previousEstimatedValue,
              estimatedValue: estVal,
              priceChange: deltaDollar,
              priceChangePercentage: deltaPct,
              valueLastUpdated: new Date().toISOString(),
              lastPriceRefreshedAt: new Date().toISOString(),
            };
            pendingUpdates.push({ id: item.id, data: updatedData });
          }
        }
      } catch (e) {
        // Continue
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (pendingUpdates.length > 0 && updateSavedCardDataBatch) {
      updateSavedCardDataBatch(pendingUpdates);

      const newTotal = savedCards.reduce((sum, c) => {
        const matching = pendingUpdates.find((u) => u.id === c.id);
        return sum + (matching ? matching.data.estimatedValue || 0 : c.data.estimatedValue || 0);
      }, 0);

      recordPortfolioSnapshot(
        currentUser?.uid,
        newTotal,
        savedCards.length,
        pendingUpdates.length,
        "Periodic Portfolio Refresh"
      ).then((snap) => {
        setSnapshots((prev) => [...prev, snap]);
      });
    }

    setIsRefreshingMarket(false);
    setBulkSummaryMessage(`Refreshed live eBay market prices across ${pendingUpdates.length} cards!`);
    setTimeout(() => setBulkSummaryMessage(null), 5000);
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
      {/* SECTION 1: ROBINHOOD-STYLE PORTFOLIO VALUATION GRAPH */}
      <PortfolioChart
        totalValue={stats.portfolioValue}
        cardCount={stats.total}
        pricedCount={stats.valuedCount}
        snapshots={snapshots}
        onRefreshPrices={handleRefreshPortfolioPrices}
        onSimulatePriceUpdate={handleSimulatePriceUpdate}
        isRefreshing={isRefreshingMarket}
      />

      {/* SECTION 2: TOP GAINERS & TOP FALLERS */}
      <GainersFallersWidget
        gainers={gainers}
        fallers={fallers}
        hasPriceHistory={hasPriceHistory}
        onInspectCard={onInspectCard}
        onSimulatePriceUpdate={handleSimulatePriceUpdate}
      />

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

      {/* Batch Grouping & Batch Comps Selector Bar */}
      {availableBatches.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-4 backdrop-blur-xl space-y-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                Upload Batches ({availableBatches.length})
              </h4>
            </div>

            {selectedBatchId !== "all" && (
              <button
                onClick={() => selectBatchCards("all")}
                className="text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Show All Batches ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => selectBatchCards("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedBatchId === "all"
                  ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>All Batches</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px]">
                {savedCards.length}
              </span>
            </button>

            {availableBatches.map((b) => (
              <div
                key={b.batchId}
                className={`group flex items-center rounded-xl transition shrink-0 overflow-hidden ${
                  selectedBatchId === b.batchId
                    ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-black shadow-md shadow-indigo-500/30 ring-1 ring-cyan-400"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectBatchCards(b.batchId)}
                  className="px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 focus:outline-none"
                >
                  <Tag className={`h-3 w-3 ${selectedBatchId === b.batchId ? "text-cyan-200" : "text-cyan-400"}`} />
                  <span className="max-w-[180px] truncate">{b.batchName}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    selectedBatchId === b.batchId
                      ? "bg-black/30 text-white"
                      : "bg-slate-800 text-cyan-300"
                  }`}>
                    {b.count} cards
                  </span>
                </button>

                {renameBatch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRename(b.batchId, b.batchName, b.count);
                    }}
                    title={`Rename "${b.batchName}"`}
                    className={`pr-2.5 pl-1 py-1.5 transition ${
                      selectedBatchId === b.batchId
                        ? "text-white/80 hover:text-white"
                        : "opacity-40 group-hover:opacity-100 hover:text-cyan-300"
                    }`}
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {selectedBatchId !== "all" && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="text-slate-300 font-medium">
                  Active Batch:{" "}
                  <strong className="text-cyan-400">
                    {availableBatches.find((b) => b.batchId === selectedBatchId)?.batchName}
                  </strong>{" "}
                  <span className="text-slate-400">({selectedIds.size} cards selected)</span>
                </span>

                {renameBatch && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = availableBatches.find((b) => b.batchId === selectedBatchId);
                      if (target) {
                        handleOpenRename(target.batchId, target.batchName, target.count);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-cyan-300 transition text-[11px] font-semibold border border-slate-700 active:scale-95 shadow-sm"
                    title="Rename this batch"
                  >
                    <Edit3 className="h-3 w-3 text-cyan-400" />
                    <span>Rename Batch</span>
                  </button>
                )}
              </div>

              <button
                onClick={handleRunBulkComps}
                disabled={isBulkRunning || selectedIds.size === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 px-4 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                <span>Run Sales Comps for Entire Batch ({selectedIds.size})</span>
              </button>
            </div>
          )}

          {renameNotice && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-in fade-in">
              <Check className="h-3.5 w-3.5" />
              <span>{renameNotice}</span>
            </div>
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
            ) : (
              <>
                <h4 className="text-base font-bold text-slate-200">
                  {savedCards.length === 0 ? "Your Online Collection is Empty" : "No Cards Match Your Filters"}
                </h4>
                <p className="text-xs text-slate-400">
                  {savedCards.length === 0
                    ? "Identify sports trading cards in the Batch Scanner tab and click 'Save to Collection' to build your persistent online portfolio."
                    : "Try resetting your search term or active attribute filters to view all saved items."}
                </p>
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
                      onClick={(e) => toggleSelectCard(item.id, e)}
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
                  <th className="p-3">Parallel / Subset</th>
                  <th className="p-3">Flags</th>

                  {/* Sortable Date Saved Header */}
                  <th
                    onClick={() => handleHeaderSort("dateAdded")}
                    className="p-3 cursor-pointer hover:text-cyan-300 transition group select-none"
                  >
                    Date Saved {renderSortIndicator("dateAdded")}
                  </th>

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
                      onClick={(e) => {
                        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTabHeld) {
                          toggleSelectCard(item.id, e);
                        }
                      }}
                      className={`transition ${
                        isSelected ? "bg-cyan-500/10 font-medium" : "hover:bg-slate-800/40"
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
                        className="p-3 font-mono font-bold text-cyan-300 max-w-[240px] truncate cursor-pointer hover:underline hover:text-cyan-200 transition group/title"
                        title="Click to view & edit card details"
                      >
                        <span className="flex items-center gap-1 truncate">
                          <span className="truncate">{generateCdpTitle(card) || "-"}</span>
                          <Eye className="h-3 w-3 shrink-0 opacity-0 group-hover/title:opacity-100 transition text-cyan-400" />
                        </span>
                      </td>
                      <td className="p-3 font-mono font-black text-emerald-400">
                        {card.estimatedValue !== undefined && card.estimatedValue > 0
                          ? `$${card.estimatedValue.toFixed(2)}`
                          : "-"}
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
    </div>
  );
}
