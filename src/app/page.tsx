"use client";

import React, { useState, useEffect, useMemo } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { FileDropzone } from "@/components/FileDropzone";
import { CardTable } from "@/components/CardTable";
import { CollectionTab } from "@/components/CollectionTab";
import { EbayCandidatesTab } from "@/components/EbayCandidatesTab";
import { GradingCandidatesTab } from "@/components/GradingCandidatesTab";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { UserProfileModal } from "@/components/UserProfileModal";
import { QrScannerModal } from "@/components/QrScannerModal";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { AdminDashboardTab } from "@/components/AdminDashboardTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PaywallModal } from "@/components/PaywallModal";
import { AuthModal } from "@/components/AuthModal";
import { LandingAuthView } from "@/components/LandingAuthView";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useCollection } from "@/lib/useCollection";
import { fileToOptimizedBase64, compressBase64DataUrl, downscaleCardImageForAi } from "@/lib/imageOptimizer";
import { identifyCardClientSide } from "@/lib/geminiClient";
import { CardItem, SavedCollectionItem, CDPCardSchema, UserSettings } from "@/types/card";
import {
  loadUserSettings,
  persistUserSettings,
  restoreFactoryDefaults,
  DEFAULT_USER_SETTINGS,
} from "@/lib/userSettings";
import { Sparkles, Layers, FileSpreadsheet, BookmarkCheck, Zap, Award, Tag, Smartphone } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  QueryDocumentSnapshot,
  DocumentChange,
} from "firebase/firestore";
import { decrementUserScan } from "@/lib/userProfile";

function CardIdApp() {
  const { currentUser, userProfile, loading } = useAuth();
  const [items, setItems] = useState<CardItem[]>([]);
  const [activeTab, setActiveTab] = useState<"scanner" | "collection" | "ebay" | "grading" | "admin">("collection");

  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKeyState] = useState<string>("");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [inspectingCard, setInspectingCard] = useState<CardItem | SavedCollectionItem | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);

  const [gradingSettings, setGradingSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Load saved API Key & Settings on mount or userProfile sync
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("CARD_ID_GEMINI_API_KEY");
      if (storedKey) setApiKeyState(storedKey);
    }

    setGradingSettings(loadUserSettings(userProfile?.gradingSettings));
  }, [userProfile]);

  // Synchronize activeTab with URL parameter / hash / path on load and browser navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTabFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab")?.toLowerCase();
      const hash = window.location.hash.replace(/^#/, "").toLowerCase();
      const path = window.location.pathname.replace(/^\//, "").toLowerCase();

      const candidate = tabParam || hash || path;
      if (candidate === "grading" || candidate === "roi") {
        setActiveTab("grading");
      } else if (candidate === "ebay" || candidate === "singles") {
        setActiveTab("ebay");
      } else if (candidate === "scanner" || candidate === "scan") {
        setActiveTab("scanner");
      } else if (candidate === "admin") {
        setActiveTab("admin");
      } else if (candidate === "collection") {
        setActiveTab("collection");
      }
    };

    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  const handleTabChange = (tab: "scanner" | "collection" | "ebay" | "grading" | "admin") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const saveGradingSettings = (newSettings: UserSettings) => {
    setGradingSettings(newSettings);
    persistUserSettings(newSettings, currentUser?.uid);
  };

  const resetGradingSettings = () => {
    const factory = restoreFactoryDefaults(currentUser?.uid);
    setGradingSettings(factory);
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
    renameBatch,
    removeCard,
    clearCollection,
    isSaved,
  } = useCollection();

  // Save single identified card: save to collection, remove from staging, and update Firestore
  const handleSaveCard = async (item: CardItem): Promise<boolean> => {
    const success = await saveCard(item);
    if (success) {
      setItems((prev) => prev.filter((c) => c.id !== item.id));
      if (item.sessionId) {
        deleteDoc(doc(db, "scanSessions", item.sessionId)).catch(() => {
          updateDoc(doc(db, "scanSessions", item.sessionId!), { status: "completed" }).catch(console.error);
        });
      }
    }
    return success;
  };

  // Save batch of cards: save to collection, remove from staging, and update Firestore
  const handleSaveBatch = async (batchItems: CardItem[]): Promise<number> => {
    const count = await saveBatch(batchItems);
    if (count > 0) {
      const savedIds = new Set(batchItems.filter((i) => i.data).map((i) => i.id));
      setItems((prev) => prev.filter((c) => !savedIds.has(c.id)));
      batchItems.forEach((item) => {
        if (item.sessionId) {
          deleteDoc(doc(db, "scanSessions", item.sessionId)).catch(() => {
            updateDoc(doc(db, "scanSessions", item.sessionId!), { status: "completed" }).catch(console.error);
          });
        }
      });
    }
    return count;
  };

  // Clear all staged cards: clear local state and remove all pending scanSessions from Firestore
  const handleClearAll = async () => {
    const sessionIds = items.map((i) => i.sessionId).filter(Boolean) as string[];
    setItems([]);

    sessionIds.forEach((sid) => {
      deleteDoc(doc(db, "scanSessions", sid)).catch(console.error);
    });

    if (currentUser?.uid) {
      try {
        const q = query(
          collection(db, "scanSessions"),
          where("uid", "==", currentUser.uid),
          where("status", "==", "ready_to_identify")
        );
        const snaps = await getDocs(q);
        snaps.forEach((docSnap: any) => {
          deleteDoc(docSnap.ref).catch(console.error);
        });
      } catch (e) {
        console.warn("Failed to clear Firestore scanSessions:", e);
      }
    }
  };

  // Remove single card: remove from state and delete Firestore scanSession if applicable
  const handleRemoveCard = (cardId: string) => {
    const target = items.find((i) => i.id === cardId);
    setItems((prev) => prev.filter((i) => i.id !== cardId));
    if (target?.sessionId) {
      deleteDoc(doc(db, "scanSessions", target.sessionId)).catch(() => {
        updateDoc(doc(db, "scanSessions", target.sessionId!), { status: "dismissed" }).catch(console.error);
      });
    }
  };

  // Compute grading candidate count matching min raw threshold
  const candidateCount = useMemo(() => {
    const thresh = gradingSettings.minRawThreshold ?? 30;
    return savedCards.filter((c) => (c.data.estimatedValue || 0) >= thresh).length;
  }, [savedCards, gradingSettings.minRawThreshold]);

  // Compute eBay singles candidate count (cards >= $4.00)
  const ebayCandidateCount = useMemo(() => {
    return savedCards.filter((c) => (c.data.estimatedValue || 0) >= 4.0).length;
  }, [savedCards]);

  const handleSaveCardDetails = (cardId: string, updatedData: CDPCardSchema) => {
    setItems((prev) =>
      prev.map((item) => (item.id === cardId ? { ...item, data: updatedData } : item))
    );
    updateSavedCardData(cardId, updatedData);
  };

  // Automatically process mobile card received live from QR Companion Scanner
  const handleMobileCardReceived = (newCard: CardItem) => {
    setItems((prev) => [newCard, ...prev]);
    setActiveTab("scanner");
    processSingleCard(newCard).then((result) => {
      setItems((prev) => prev.map((item) => (item.id === newCard.id ? result : item)));
    });
  };

  const processSingleCard = async (item: CardItem): Promise<CardItem> => {
    try {
      let frontBase64: string | null = null;
      let backBase64: string | null = null;

      const sourceFront = item.frontFile || item.frontPreview;
      const sourceBack = item.backFile || item.backPreview;

      if (sourceFront) {
        frontBase64 = await downscaleCardImageForAi(sourceFront, 1200, 0.82);
      }
      if (sourceBack) {
        backBase64 = await downscaleCardImageForAi(sourceBack, 1200, 0.82);
      }

      // If one image is missing (e.g. single-sided upload), fallback to the available image
      if (frontBase64 && !backBase64) backBase64 = frontBase64;
      if (backBase64 && !frontBase64) frontBase64 = backBase64;

      if (!frontBase64 || !backBase64) {
        throw new Error("No valid image preview found for this card scan.");
      }

      const effectiveKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
      if (effectiveKey) {
        try {
          const cardData = await identifyCardClientSide(frontBase64, backBase64, effectiveKey);
          return {
            ...item,
            frontPreview: frontBase64 || item.frontPreview,
            backPreview: backBase64 || item.backPreview,
            status: "success",
            data: cardData,
            aiUsage: cardData.aiUsage,
            errorMessage: undefined,
          };
        } catch (clientErr: any) {
          const cMsg = clientErr?.message || String(clientErr);
          console.warn("Client-side Gemini Vision processing error:", cMsg);
          // Throw directly to avoid cascading multi-endpoint retries that burn tokens
          throw new Error(cMsg);
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

      let res: Response;
      try {
        res = await fetch("/identifyCard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(callableBody),
        });
      } catch (netErr: any) {
        throw new Error(`Network error contacting identification server: ${netErr.message || "Offline"}`);
      }

      // If /identifyCard returned 404 (e.g. running in local `next dev` without Firebase emulator), check /api/identify
      if (res.status === 404) {
        try {
          const fallbackRes = await fetch("/api/identify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(restBody),
          });
          const ct = fallbackRes.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            res = fallbackRes;
          }
        } catch (fbErr) {
          console.warn("Fallback /api/identify failed:", fbErr);
        }
      }

      const contentType = res.headers.get("content-type") || "";
      const rawText = await res.text();
      let json: any = null;

      if (contentType.includes("application/json") || rawText.trim().startsWith("{")) {
        try {
          json = JSON.parse(rawText);
        } catch (parseErr) {
          console.warn("Could not parse JSON body:", parseErr);
        }
      }

      if (!res.ok || json?.error) {
        // Recursively extract nested error strings/objects from Firebase Functions & Gemini
        const extractErrorMessage = (err: any): string => {
          if (!err) return "";
          if (typeof err === "string") {
            try {
              const parsed = JSON.parse(err);
              return extractErrorMessage(parsed);
            } catch {
              return err;
            }
          }
          if (err.error) return extractErrorMessage(err.error);
          if (err.message) {
            try {
              const parsed = JSON.parse(err.message);
              return extractErrorMessage(parsed);
            } catch {
              return err.message;
            }
          }
          if (err.status) return `Error: ${err.status}`;
          return JSON.stringify(err);
        };

        let errMessage = "Vision identification failed.";
        if (json?.error) {
          errMessage = extractErrorMessage(json.error);
        } else if (rawText && !contentType.includes("text/html") && !rawText.trim().startsWith("<")) {
          errMessage = rawText;
        } else {
          errMessage = `Server error (HTTP ${res.status})`;
        }

        // Clean up common Gemini API credit/quota depletion into clear actionable instructions
        if (
          errMessage.includes("429") ||
          errMessage.includes("RESOURCE_EXHAUSTED") ||
          errMessage.includes("depleted") ||
          errMessage.includes("quota")
        ) {
          errMessage = "Gemini API Quota/Credits Depleted (429). Please add credits at Google AI Studio or set your own API key in 'Key Options' in the top header.";
        } else if (errMessage.includes("API key not valid") || errMessage.includes("API_KEY_INVALID")) {
          errMessage = "Invalid Gemini API Key. Please verify your key under 'Key Options' in the top header.";
        }

        throw new Error(errMessage);
      }

      if (!json) {
        throw new Error("Invalid response received from identification server.");
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

      if (currentUser?.uid && userProfile?.subscriptionTier !== "pro") {
        decrementUserScan(currentUser.uid).catch(console.error);
      }

      return {
        ...item,
        frontPreview: frontBase64 || item.frontPreview,
        backPreview: backBase64 || item.backPreview,
        status: "success",
        data: cardData,
        aiUsage: cardData.aiUsage,
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

    // Quota Enforcement
    const isPro = userProfile?.subscriptionTier === "pro";
    const scansRemaining = userProfile?.scansRemaining ?? 25;
    if (!isPro && scansRemaining <= 0) {
      setPaywallReason(
        "You have reached your scan limit. Upgrade to a Starter ($9.99/mo) or Pro ($29.99/mo) plan to scan unlimited cards and unlock all AI features!"
      );
      setIsPaywallOpen(true);
      return;
    }

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
    let quotaHalted = false;

    const runWorker = async () => {
      while (pendingQueueIndex < pendingItems.length) {
        if (quotaHalted) break;

        const queueIdx = pendingQueueIndex++;
        const current = pendingItems[queueIdx];
        if (!current) break;

        const result = await processSingleCard(current);
        setItems((prev) =>
          prev.map((item) => (item.id === current.id ? result : item))
        );

        if (result.status === "error" && result.errorMessage) {
          setGlobalError(`Card ${current.prefix}: ${result.errorMessage}`);
          const msg = result.errorMessage.toLowerCase();
          if (
            msg.includes("depleted") ||
            msg.includes("credits are depleted") ||
            msg.includes("resource_exhausted") ||
            msg.includes("quota")
          ) {
            quotaHalted = true;
            break;
          }
        }
      }
    };

    const workerCount = Math.min(CONCURRENCY_LIMIT, pendingItems.length);
    const workerPromises = Array.from({ length: workerCount }, () => runWorker());

    await Promise.all(workerPromises);

    if (quotaHalted) {
      setItems((prev) =>
        prev.map((item) => (item.status === "processing" ? { ...item, status: "idle" } : item))
      );
    }

    setIsProcessing(false);
  };

  const handleReidentifyCard = async (cardId: string) => {
    const isPro = userProfile?.subscriptionTier === "pro";
    const scansRemaining = userProfile?.scansRemaining ?? 25;
    if (!isPro && scansRemaining <= 0) {
      setPaywallReason("You have reached your scan limit. Upgrade your subscription to re-identify cards.");
      setIsPaywallOpen(true);
      return;
    }

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

  // Real-time Firestore Listener for Mobile Camera Scans
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;

    try {
      const q = query(
        collection(db, "scanSessions"),
        where("uid", "==", uid),
        where("status", "==", "ready_to_identify")
      );

      const unsubscribe = onSnapshot(q, (snapshot: any) => {
        snapshot.docChanges().forEach((change: any) => {
          const docId = change.doc.id;
          const data = change.doc.data();
          const sid = data.sessionId || docId;
          const cardId = `card-phone-${sid}`;

          if (change.type === "added" || change.type === "modified") {
            if (data.status === "ready_to_identify" && data.frontUrl) {
              setItems((prev) => {
                if (prev.some((c) => c.id === cardId || c.sessionId === sid)) return prev;

                const newCard: CardItem = {
                  id: cardId,
                  prefix: data.prefix || `MOBILE-${sid.substring(0, 6).toUpperCase()}`,
                  sessionId: sid,
                  batchId: `batch_mobile_${new Date().toISOString().slice(0, 10)}`,
                  batchName: `Mobile Scanner Batch (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
                  frontFile: null,
                  backFile: null,
                  frontPreview: data.frontUrl,
                  backPreview: data.backUrl || data.frontUrl,
                  isUnpaired: false,
                  status: "idle",
                };

                return [newCard, ...prev];
              });
            } else if (data.status !== "ready_to_identify") {
              setItems((prev) => prev.filter((c) => c.id !== cardId && c.sessionId !== sid));
            }
          }

          if (change.type === "removed") {
            setItems((prev) => prev.filter((c) => c.id !== cardId && c.sessionId !== sid));
          }
        });
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn("Global scanSession listener warning:", e);
    }
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-pulse">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <p className="text-xs font-mono text-cyan-400 animate-pulse">Initializing secure user session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LandingAuthView />;
  }

  const handleOpenQrScanner = () => {
    const isMobile =
      typeof window !== "undefined" &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768);

    if (isMobile) {
      const newSessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const uid = currentUser?.uid || "guest_user";
      window.location.href = `/companion?session=${newSessionId}&uid=${uid}`;
    } else {
      setIsQrModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans">
      <HeaderBar
        apiKey={apiKey}
        setApiKey={setApiKey}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        savedCount={savedCards.length}
        candidateCount={candidateCount}
        ebayCandidateCount={ebayCandidateCount}
        onOpenGradingSettings={() => setIsSettingsOpen(true)}
        onOpenUserProfile={() => setIsUserProfileOpen(true)}
        onOpenQrScanner={handleOpenQrScanner}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenPaywall={() => {
          setPaywallReason(undefined);
          setIsPaywallOpen(true);
        }}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
        {/* Banner Section (Only for Scanner; Collection, Ebay, Grading, and Admin tabs have custom dashboards) */}
        {activeTab === "scanner" && (
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-8 shadow-2xl">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none"></div>
            <div className="relative z-10 max-w-2xl space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs font-mono font-bold text-cyan-300">
                  <Sparkles className="h-3.5 w-3.5" /> CardID AI Vision Engine v2.0
                </span>
                <button
                  type="button"
                  onClick={() => handleTabChange("grading")}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300 transition cursor-pointer"
                  title="Open Grading ROI & Comps Evaluator"
                >
                  <Award className="h-3.5 w-3.5 text-amber-400" /> {gradingSettings.targetCompany || "PSA"} Grading ROI Rules Engine →
                </button>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {activeTab === "scanner"
                  ? "AI Sports Card Identification & Cataloging"
                  : "My Saved Online Trading Card Collection"}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {activeTab === "scanner"
                  ? "Batch upload trading card front and back scans. Our vision pipeline extracts player names, manufacturer brands, set releases, card numbers, parallel finishes, and rookie/auto flags with automated metadata extraction & eBay market comps."
                  : "View, filter, search, and manage your persistent online collection of identified trading cards. Export your portfolio to CSV at any time."}
              </p>
            </div>
          </div>
        )}

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
                onOpenQrScanner={handleOpenQrScanner}
                onClearAll={handleClearAll}
                onRemoveCard={handleRemoveCard}
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
                  saveCard={handleSaveCard}
                  saveBatch={handleSaveBatch}
                  isSaved={isSaved}
                  onInspectCard={(card) => setInspectingCard(card)}
                  onRemoveCard={handleRemoveCard}
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
              renameBatch={renameBatch}
            />
          </section>
        )}

        {/* TAB 3: EBAY SINGLES CANDIDATES ($4+) */}
        {activeTab === "ebay" && (
          <section className="space-y-4">
            <EbayCandidatesTab
              savedCards={savedCards}
              scannerItems={items}
              minEbayThreshold={gradingSettings.minEbayRawThreshold ?? 4.0}
              settings={gradingSettings}
              onInspectCard={(card) => setInspectingCard(card)}
              updateSavedCardDataBatch={updateSavedCardDataBatch}
              onNavigateToGrading={() => setActiveTab("grading")}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </section>
        )}

        {/* TAB 4: GRADING CANDIDATES */}
        {activeTab === "grading" && (
          <section className="space-y-4">
            <ErrorBoundary fallbackTitle="Grading ROI Evaluator Encountered an Error">
              <GradingCandidatesTab
                scannerItems={items}
                savedCards={savedCards}
                settings={gradingSettings}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onInspectCard={(card) => setInspectingCard(card)}
                onUpdateCard={handleSaveCardDetails}
                updateSavedCardDataBatch={updateSavedCardDataBatch}
              />
            </ErrorBoundary>
          </section>
        )}

        {/* TAB 5: ADMIN EXECUTIVE REVENUE & SUBSCRIBER COMMAND CENTER */}
        {activeTab === "admin" && (
          <section className="space-y-4">
            <AdminDashboardTab />
          </section>
        )}

        {/* Modals */}
        <CardDetailsModal
          card={inspectingCard}
          isOpen={!!inspectingCard}
          onClose={() => setInspectingCard(null)}
          onSave={handleSaveCardDetails}
          gradingSettings={gradingSettings}
        />

        <UserSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={gradingSettings}
          onSaveSettings={saveGradingSettings}
          onResetDefaults={resetGradingSettings}
        />

        <QrScannerModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          onCardReceived={handleMobileCardReceived}
        />

        <UserProfileModal
          isOpen={isUserProfileOpen}
          onClose={() => setIsUserProfileOpen(false)}
          currentUser={currentUser}
          userProfile={userProfile}
          gradingSettings={gradingSettings}
          onSaveGradingSettings={saveGradingSettings}
          onOpenPaywall={() => {
            setPaywallReason(undefined);
            setIsPaywallOpen(true);
          }}
        />

        <PaywallModal
          isOpen={isPaywallOpen}
          onClose={() => setIsPaywallOpen(false)}
          reason={paywallReason}
          onSuccess={() => {
            setIsPaywallOpen(false);
            setGlobalError(null);
          }}
        />

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
      </main>
    </div>
  );
}

import MobileCompanionPage from "./companion/page";

export default function Home() {
  const [isCompanionRoute, setIsCompanionRoute] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.includes("/companion")) {
      setIsCompanionRoute(true);
    }
  }, []);

  if (isCompanionRoute) {
    return <MobileCompanionPage />;
  }

  return (
    <AuthProvider>
      <CardIdApp />
    </AuthProvider>
  );
}
