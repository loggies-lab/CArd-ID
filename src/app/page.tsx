"use client";

import React, { useState } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { FileDropzone } from "@/components/FileDropzone";
import { CardTable } from "@/components/CardTable";
import { CollectionTab } from "@/components/CollectionTab";
import { useCollection } from "@/lib/useCollection";
import { fileToOptimizedBase64 } from "@/lib/imageOptimizer";
import { CardItem } from "@/types/card";
import { Sparkles, Layers, FileSpreadsheet, BookmarkCheck, Zap } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"scanner" | "collection">("scanner");
  const [items, setItems] = useState<CardItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [globalError, setGlobalError] = useState<string | null>(null);

  const {
    savedCards,
    saveCard,
    saveBatch,
    removeCard,
    clearCollection,
    isSaved,
  } = useCollection();

  const processSingleCard = async (item: CardItem): Promise<CardItem> => {
    try {
      let frontBase64: string | null = null;
      let backBase64: string | null = null;

      // Optimize and resize images on client before base64 transfer
      if (item.frontFile) {
        frontBase64 = await fileToOptimizedBase64(item.frontFile, 1024, 0.85);
      } else if (item.frontPreview) {
        frontBase64 = item.frontPreview;
      }

      if (item.backFile) {
        backBase64 = await fileToOptimizedBase64(item.backFile, 1024, 0.85);
      } else if (item.backPreview) {
        backBase64 = item.backPreview;
      }

      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.prefix,
          frontBase64,
          backBase64,
          frontImage: frontBase64,
          backImage: backBase64,
          apiKeyOverride: apiKey || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        return {
          ...item,
          status: "error",
          errorMessage: json.error || "Vision identification failed.",
        };
      }

      const cardData = json.card || json;

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

    // Mark pending items as processing
    setItems((prev) =>
      prev.map((i) => (pendingItems.some((p) => p.id === i.id) ? { ...i, status: "processing" } : i))
    );

    // Parallel Concurrency Pool (4 simultaneous requests)
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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-300">
                <Zap className="h-3.5 w-3.5 text-emerald-400" /> High-Speed 4x Parallel Engine
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {activeTab === "scanner"
                ? "AI Sports Card Identification & Cataloging"
                : "My Saved Online Trading Card Collection"}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {activeTab === "scanner"
                ? "Batch upload trading card front and back scans. Our vision pipeline extracts player names, manufacturer brands, set releases, card numbers, parallel finishes, and rookie/auto flags with 100% CDP schema compliance."
                : "View, filter, search, and manage your persistent online collection of identified trading cards. Export your portfolio to CDP CSV at any time."}
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
        {activeTab === "scanner" ? (
          <>
            {/* Batch File Dropzone & Pairing Logic */}
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

            {/* Results Inventory & CDP CSV Export */}
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
                />
              </section>
            )}
          </>
        ) : (
          /* TAB 2: MY ONLINE COLLECTION */
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <BookmarkCheck className="h-5 w-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-slate-100">Saved Portfolio & Inventory</h3>
            </div>
            <CollectionTab
              savedCards={savedCards}
              removeCard={removeCard}
              clearCollection={clearCollection}
            />
          </section>
        )}
      </main>
    </div>
  );
}
