"use client";

import React, { useState, useEffect, useMemo } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { FileDropzone } from "@/components/FileDropzone";
import { CardTable } from "@/components/CardTable";
import { CollectionTab } from "@/components/CollectionTab";
import { GradingCandidatesTab } from "@/components/GradingCandidatesTab";
import { GradingSettingsModal } from "@/components/GradingSettingsModal";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { useCollection } from "@/lib/useCollection";
import { fileToOptimizedBase64, compressBase64DataUrl } from "@/lib/imageOptimizer";
import { identifyCardClientSide } from "@/lib/geminiClient";
import { CardItem, SavedCollectionItem, CDPCardSchema, UserGradingSettings } from "@/types/card";
import { Sparkles, Layers, FileSpreadsheet, BookmarkCheck, Zap, Award } from "lucide-react";

const DEFAULT_GRADING_SETTINGS: UserGradingSettings = {
  minRawThreshold: 30.0,
  targetCompany: "PSA",
  estimatedGradingFee: 19.0,
  autoFlagCandidates: true,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<"scanner" | "collection" | "grading">("scanner");
  const [items, setItems] = useState<CardItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKeyState] = useState("");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [inspectingCard, setInspectingCard] = useState<CardItem | SavedCollectionItem | null>(null);

  const [gradingSettings, setGradingSettings] = useState<UserGradingSettings>(DEFAULT_GRADING_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load saved API Key & Grading Settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("CARD_ID_GEMINI_API_KEY");
      if (storedKey) setApiKeyState(storedKey);

      const storedGrading = localStorage.getItem("CARD_ID_GRADING_SETTINGS");
      if (storedGrading) {
        try {
          setGradingSettings(JSON.parse(storedGrading));
        } catch (e) {
          console.warn("Failed to parse stored grading settings");
        }
      }
    }
  }, []);

  const saveGradingSettings = (newSettings: UserGradingSettings) => {
    setGradingSettings(newSettings);
    if (typeof window !== "undefined") {
      localStorage.setItem("CARD_ID_GRADING_SETTINGS", JSON.stringify(newSettings));
    }
  };

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (typeof window !== "undefined") {
      if (key) {
        localStorage.setItem("CARD_ID_GEMINI_API_KEY", key);
      } else {
        localStorage.removeItem("CARD_ID_GEMINI_API_KEY");
      }
    }
  };

  const {
    savedCards,
    saveCard,
    saveBatch,
    updateSavedCardData,
    updateSavedCardDataBatch,
    removeCard,
    clearCollection,
    isSaved,
  } = useCollection();

  // Compute grading candidate count matching min raw threshold
  const candidateCount = useMemo(() => {
    const thresh = gradingSettings.minRawThreshold;
    const scannerCandidates = items.filter((i) => (i.data?.estimatedValue || 0) >= thresh).length;
    const savedCandidates = savedCards.filter((s) => (s.data?.estimatedValue || 0) >= thresh).length;
    return scannerCandidates + savedCandidates;
  }, [items, savedCards, gradingSettings.minRawThreshold]);

  const handleSaveCardDetails = (cardId: string, updatedData: CDPCardSchema) => {
    setItems((prev) =>
      prev.map((item) => (item.id === cardId ? { ...item, data: updatedData } : item))
    );
    updateSavedCardData(cardId, updatedData);
  };

  const processSingleCard = async (item: CardItem): Promise<CardItem> => {
    try {
      let frontBase64: string | null = null;
      let backBase64: string | null = null;

      if (item.frontFile) {
        frontBase64 = await fileToOptimizedBase64(item.frontFile, 800, 0.75);
      } else if (item.frontPreview) {
        frontBase64 = await compressBase64DataUrl(item.frontPreview, 800, 0.75);
      }

      if (item.backFile) {
        backBase64 = await fileToOptimizedBase64(item.backFile, 800, 0.75);
      } else if (item.backPreview) {
        backBase64 = await compressBase64DataUrl(item.backPreview, 800, 0.75);
      }

      // If one image is missing (e.g. single-sided upload), fallback to the available image
      if (frontBase64 && !backBase64) backBase64 = frontBase64;
      if (backBase64 && !frontBase64) frontBase64 = backBase64;

      if (!frontBase64 || !backBase64) {
        throw new Error("No valid image preview found for this card scan.");
      }

      if (apiKey) {
        try {
          const cardData = await identifyCardClientSide(frontBase64, backBase64, apiKey);
          return {
            ...item,
            frontPreview: frontBase64 || item.frontPreview,
            backPreview: backBase64 || item.backPreview,
            status: "success",
            data: cardData,
            errorMessage: undefined,
          };
        } catch (clientErr: any) {
          console.error("Client-side Gemini Vision processing error:", clientErr);
        }
      }

      const callableBody = {
        data: {
          frontBase64,
          backBase64,
          apiKeyOverride: apiKey || undefined,
        },
      };

      const restBody = {
        frontBase64,
        backBase64,
        apiKeyOverride: apiKey || undefined,
      };

      let res = await fetch("/identifyCard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callableBody),
      });

      if (!res.ok) {
        res = await fetch("/api/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(restBody),
        });
      }

      let json: any = null;
      try {
        json = await res.json();
      } catch (parseErr) {
        throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      }

      if (!res.ok || json?.error) {
        let errMessage = "Vision identification failed.";
        if (json?.error) {
          if (typeof json.error === "string") {
            errMessage = json.error;
          } else if (typeof json.error === "object") {
            errMessage = json.error.message || json.error.error?.message || JSON.stringify(json.error);
          }
        } else if (!res.ok) {
          errMessage = `HTTP Error ${res.status}: ${res.statusText}`;
        }
        throw new Error(errMessage);
      }

      const rawCardData = (json.result || json.card || json) as any;
      const player = rawCardData.playerName || rawCardData.subject || rawCardData.player || "";
      const brand = rawCardData.brand || rawCardData.publisher || "";

      const cardData = {
        ...rawCardData,
        playerName: player,
        subject: player,
        brand: brand,
        publisher: brand,
      };

      return {
        ...item,
        frontPreview: frontBase64 || item.frontPreview,
        backPreview: backBase64 || item.backPreview,
        status: "success",
        data: cardData,
        errorMessage: undefined,
      };
    } catch (err: any) {
      return {
        ...item,
        status: "error",
        errorMessage: err.message || "Failed to contact identification API.",
      };
    }
  };

  const handleIdentifyBatch = async () => {
    if (items.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setGlobalError(null);

    const pendingItems = items.filter(
      (i) => i.status === "idle" || i.status === "error" || i.status === "processing"
    );

    if (pendingItems.length === 0) {
      setIsProcessing(false);
      return;
    }

    setItems((prev) =>
      prev.map((i) => (pendingItems.some((p) => p.id === i.id) ? { ...i, status: "processing" } : i))
    );

    const CONCURRENCY_LIMIT = 4;
    let pendingQueueIndex = 0;

    const runWorker = async () => {
      while (pendingQueueIndex < pendingItems.length) {
        const queueIdx = pendingQueueIndex++;
        const current = pendingItems[queueIdx];
        if (!current) break;

        const result = await processSingleCard(current);
        setItems((prev) =>
          prev.map((item) => (item.id === current.id ? result : item))
        );

        if (result.status === "error" && result.errorMessage) {
          setGlobalError(`Card ${current.prefix}: ${result.errorMessage}`);
        }
      }
    };

    const workerCount = Math.min(CONCURRENCY_LIMIT, pendingItems.length);
    const workerPromises = Array.from({ length: workerCount }, () => runWorker());

    await Promise.all(workerPromises);
    setIsProcessing(false);
  };

  const handleReidentifyCard = async (cardId: string) => {
    const target = items.find((i) => i.id === cardId);
    if (!target) return;

    setItems((prev) =>
      prev.map((i) => (i.id === cardId ? { ...i, status: "processing" } : i))
    );

    const updated = await processSingleCard(target);
    setItems((prev) =>
      prev.map((i) => (i.id === cardId ? updated : i))
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans">
      <HeaderBar
        apiKey={apiKey}
        setApiKey={setApiKey}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={savedCards.length}
        candidateCount={candidateCount}
        onOpenGradingSettings={() => setIsSettingsOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
        {/* Banner Section */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-8 shadow-2xl">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none"></div>
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs font-mono font-bold text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" /> Card Dealer Pro (CDP) Standard Engine
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                <Award className="h-3.5 w-3.5 text-amber-400" /> {gradingSettings.targetCompany} Grading ROI Rules Engine
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {activeTab === "scanner"
                ? "AI Sports Card Identification & Cataloging"
                : activeTab === "collection"
                ? "My Saved Online Trading Card Collection"
                : "Grading ROI Candidates & PSA Market Comps"}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {activeTab === "scanner"
                ? "Batch upload trading card front and back scans. Our vision pipeline extracts player names, manufacturer brands, set releases, card numbers, parallel finishes, and rookie/auto flags with 100% CDP schema compliance."
                : activeTab === "collection"
                ? "View, filter, search, and manage your persistent online collection of identified trading cards. Export your portfolio to CDP CSV at any time."
                : `Inspect high-value trading cards worth sending for ${gradingSettings.targetCompany} grading based on estimated raw market values (\ge \$${gradingSettings.minRawThreshold.toFixed(2)}) and graded market sales comps.`}
            </p>
          </div>
        </div>

        {/* Global Error Banner */}
        {globalError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-mono text-rose-300 flex items-center justify-between">
            <span>⚠️ {globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="text-rose-400 font-bold hover:text-rose-200"
            >
              Dismiss ✕
            </button>
          </div>
        )}

        {/* TAB 1: BATCH SCANNER */}
        {activeTab === "scanner" && (
          <>
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Layers className="h-5 w-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-slate-100">Step 1: Batch Dropzone & Prefix Pairing</h3>
              </div>
              <FileDropzone
                items={items}
                setItems={setItems}
                onIdentifyBatch={handleIdentifyBatch}
                isProcessing={isProcessing}
              />
            </section>

            {items.length > 0 && (
              <section className="space-y-4 pt-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-lg font-bold text-slate-100">Step 2: CDP Inventory & Save Options</h3>
                </div>
                <CardTable
                  items={items}
                  setItems={setItems}
                  onReidentifyCard={handleReidentifyCard}
                  saveCard={saveCard}
                  saveBatch={saveBatch}
                  isSaved={isSaved}
                  onInspectCard={(card) => setInspectingCard(card)}
                />
              </section>
            )}
          </>
        )}

        {/* TAB 2: MY ONLINE COLLECTION */}
        {activeTab === "collection" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <BookmarkCheck className="h-5 w-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-slate-100">Saved Portfolio & Inventory</h3>
            </div>
            <CollectionTab
              savedCards={savedCards}
              removeCard={removeCard}
              clearCollection={clearCollection}
              onInspectCard={(card) => setInspectingCard(card)}
              updateSavedCardDataBatch={updateSavedCardDataBatch}
            />
          </section>
        )}

        {/* TAB 3: GRADING CANDIDATES */}
        {activeTab === "grading" && (
          <section className="space-y-4">
            <GradingCandidatesTab
              scannerItems={items}
              savedCards={savedCards}
              settings={gradingSettings}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onInspectCard={(card) => setInspectingCard(card)}
            />
          </section>
        )}

        {/* Modals */}
        <CardDetailsModal
          card={inspectingCard}
          isOpen={!!inspectingCard}
          onClose={() => setInspectingCard(null)}
          onSave={handleSaveCardDetails}
        />

        <GradingSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={gradingSettings}
          onSaveSettings={saveGradingSettings}
        />
      </main>
    </div>
  );
}
