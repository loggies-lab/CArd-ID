"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import {
  Camera,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  UploadCloud,
  Check,
  AlertCircle,
  Plus,
} from "lucide-react";

/**
 * Resizes and compresses an image File to max 800px width/height canvas JPEG 0.70 (~80KB)
 */
async function compressMobileCapturedImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read captured image"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load captured image into element"));
      img.onload = () => {
        const MAX_SIZE = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(e.target?.result as string);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.70);
        resolve(compressedBase64);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function MobileCompanionContent() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session") || searchParams.get("sessionId") || "";
  const initialUid = searchParams.get("uid") || "guest_user";

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [uid, setUid] = useState(initialUid);

  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [cardPrefix, setCardPrefix] = useState<string>("CARD-001");

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) {
      const generated = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setSessionId(generated);
    }

    // Auto-launch phone camera 350ms after landing on companion page
    const timer = setTimeout(() => {
      if (!frontPreview && frontInputRef.current) {
        try {
          frontInputRef.current.click();
        } catch (e) {
          // Ignore gesture policy if blocked by browser
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [sessionId, frontPreview]);

  const handleCaptureFront = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMessage(null);
      const compressed = await compressMobileCapturedImage(file);
      setFrontPreview(compressed);
    } catch (err: any) {
      setErrorMessage("Failed to process front image capture.");
    }
  };

  const handleCaptureBack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMessage(null);
      const compressed = await compressMobileCapturedImage(file);
      setBackPreview(compressed);
    } catch (err: any) {
      setErrorMessage("Failed to process back image capture.");
    }
  };

  const handleSendToDesktop = async () => {
    if (!frontPreview) {
      setErrorMessage("Please snap at least the FRONT of the card.");
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setUploadProgressMsg("Syncing live card to desktop...");

    try {
      let finalFrontUrl = frontPreview;
      let finalBackUrl = backPreview || frontPreview;

      // 1. Try Firebase Storage with 1.5s fast timeout to prevent loading hangs
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Storage timeout fallback")), 1500)
        );

        const uploadFront = async () => {
          const frontStorageRef = ref(storage, `users/${uid}/uploads/${sessionId}_front.jpg`);
          await uploadString(frontStorageRef, frontPreview, "data_url");
          return await getDownloadURL(frontStorageRef);
        };

        finalFrontUrl = await Promise.race([uploadFront(), timeoutPromise]);

        if (backPreview) {
          const uploadBack = async () => {
            const backStorageRef = ref(storage, `users/${uid}/uploads/${sessionId}_back.jpg`);
            await uploadString(backStorageRef, backPreview, "data_url");
            return await getDownloadURL(backStorageRef);
          };
          finalBackUrl = await Promise.race([uploadBack(), timeoutPromise]);
        } else {
          finalBackUrl = finalFrontUrl;
        }
      } catch (storageErr) {
        console.warn("Fast fallback to direct Firestore Data URL payload:", storageErr);
      }

      // 2. Sync session document to Firestore /scanSessions/{sessionId}
      const sessionPayload = {
        sessionId,
        uid,
        status: "ready_to_identify",
        frontUrl: finalFrontUrl,
        backUrl: finalBackUrl,
        prefix: cardPrefix || `MOBILE-${sessionId.substring(0, 6).toUpperCase()}`,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "scanSessions", sessionId), sessionPayload, { merge: true });
      if (uid && uid !== "guest_user") {
        await setDoc(doc(db, "users", uid, "scanSessions", sessionId), sessionPayload, { merge: true }).catch(() => {});
      }

      setUploadSuccess(true);
    } catch (err: any) {
      console.error("Companion upload sync error:", err);
      setErrorMessage(err.message || "Failed to sync card to desktop.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleNextCard = () => {
    const nextSessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    setSessionId(nextSessionId);
    setFrontPreview(null);
    setBackPreview(null);
    setUploadSuccess(false);
    setErrorMessage(null);

    // Notify desktop that new session is waiting
    setDoc(doc(db, "users", uid, "scanSessions", nextSessionId), {
      sessionId: nextSessionId,
      uid,
      status: "waiting",
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 max-w-md mx-auto font-sans selection:bg-cyan-500">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-4 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1">
              Card ID <span className="text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-widest bg-cyan-500/10 px-1 py-0.5 rounded">MOBILE</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">Live Desktop Sync Active</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span> Connected
        </div>
      </header>

      {/* Main Body */}
      <main className="my-auto py-6 space-y-6">
        {uploadSuccess ? (
          <div className="rounded-3xl border border-emerald-500/40 bg-slate-900/90 p-8 text-center space-y-5 shadow-2xl animate-scale-in">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 mx-auto shadow-xl">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">Card Sent to Desktop!</h2>
              <p className="text-xs text-slate-300">
                Your desktop dashboard has received the card images and is running AI Vision identification automatically.
              </p>
            </div>

            <button
              onClick={handleNextCard}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 p-4 text-sm font-extrabold text-white shadow-xl shadow-cyan-500/25 active:scale-95 transition"
            >
              <Camera className="h-5 w-5" /> Snap Next Card
            </button>
          </div>
        ) : (
          <>
            {/* Error Toast */}
            {errorMessage && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-mono text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Big Prominent Camera Trigger Banner */}
            {!frontPreview && (
              <button
                onClick={() => frontInputRef.current?.click()}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white font-black text-base shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-3 active:scale-95 transition ring-4 ring-cyan-500/20 animate-pulse"
              >
                <Camera className="h-6 w-6 text-white" />
                <span>TAP HERE TO SNAP FRONT OF CARD</span>
              </button>
            )}

            {/* Optional Card Prefix Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Card Identifier Prefix (Optional)
              </label>
              <input
                type="text"
                value={cardPrefix}
                onChange={(e) => setCardPrefix(e.target.value)}
                placeholder="e.g. CARD-001 or WALMART-LOT"
                className="w-full pl-3 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 outline-none focus:border-cyan-500"
              />
            </div>

            {/* Camera Viewfinders */}
            <div className="grid grid-cols-2 gap-4">
              {/* FRONT SNAP BUTTON */}
              <div className="relative aspect-[3/4] rounded-2xl bg-slate-900 border-2 border-dashed border-cyan-500/40 overflow-hidden flex flex-col items-center justify-center p-2 text-center group">
                {frontPreview ? (
                  <>
                    <img src={frontPreview} alt="Front" className="w-full h-full object-cover rounded-xl" />
                    <button
                      onClick={() => frontInputRef.current?.click()}
                      className="absolute bottom-2 right-2 bg-slate-950/80 border border-slate-700 text-[10px] font-bold text-white px-2 py-1 rounded-lg"
                    >
                      Retake
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => frontInputRef.current?.click()}
                    className="w-full h-full flex flex-col items-center justify-center space-y-2 text-cyan-400 active:scale-95 transition"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                      <Camera className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-black tracking-wide text-white uppercase">📷 Snap FRONT</span>
                    <span className="text-[10px] text-slate-400">Tap to launch camera</span>
                  </button>
                )}
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleCaptureFront}
                />
              </div>

              {/* BACK SNAP BUTTON */}
              <div className="relative aspect-[3/4] rounded-2xl bg-slate-900 border-2 border-dashed border-cyan-500/40 overflow-hidden flex flex-col items-center justify-center p-2 text-center group">
                {backPreview ? (
                  <>
                    <img src={backPreview} alt="Back" className="w-full h-full object-cover rounded-xl" />
                    <button
                      onClick={() => backInputRef.current?.click()}
                      className="absolute bottom-2 right-2 bg-slate-950/80 border border-slate-700 text-[10px] font-bold text-white px-2 py-1 rounded-lg"
                    >
                      Retake
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => backInputRef.current?.click()}
                    className="w-full h-full flex flex-col items-center justify-center space-y-2 text-cyan-400 active:scale-95 transition"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                      <Camera className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-black tracking-wide text-white uppercase">📷 Snap BACK</span>
                    <span className="text-[10px] text-slate-400">Tap to launch camera</span>
                  </button>
                )}
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleCaptureBack}
                />
              </div>
            </div>

            {/* SEND TO DESKTOP BUTTON */}
            <button
              onClick={handleSendToDesktop}
              disabled={isUploading || !frontPreview}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 p-4 text-sm font-black text-white shadow-xl shadow-cyan-500/25 active:scale-95 disabled:opacity-50 transition"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" /> {uploadProgressMsg || "Uploading..."}
                </>
              ) : (
                <>
                  <UploadCloud className="h-5 w-5" /> Send Card to Desktop Dashboard
                </>
              )}
            </button>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-2 text-[10px] font-mono text-slate-500 border-t border-slate-900">
        CardID Pro Mobile Scanner • Session: <span className="text-slate-400 font-bold">{sessionId.substring(0, 8)}</span>
      </footer>
    </div>
  );
}

export default function MobileCompanionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-mono text-xs">
        Loading Mobile Companion Scanner...
      </div>
    }>
      <MobileCompanionContent />
    </Suspense>
  );
}
