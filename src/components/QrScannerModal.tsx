"use client";

import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { CardItem } from "@/types/card";
import { Smartphone, RefreshCw, X, CheckCircle, Sparkles, Copy, Check, ExternalLink } from "lucide-react";

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCardReceived: (cardItem: CardItem) => void;
}

export function QrScannerModal({ isOpen, onClose, onCardReceived }: QrScannerModalProps) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || "guest_user";

  const [sessionId, setSessionId] = useState<string>("");
  const [sessionStatus, setSessionStatus] = useState<"waiting" | "receiving" | "success">("waiting");
  const [copiedLink, setCopiedLink] = useState(false);
  const [receivedCardTitle, setReceivedCardTitle] = useState<string | null>(null);

  // Generate new session and listen in real-time
  const startNewSession = async () => {
    const newSessionId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    setSessionId(newSessionId);
    setSessionStatus("waiting");
    setReceivedCardTitle(null);

    try {
      await setDoc(doc(db, "users", uid, "scanSessions", newSessionId), {
        sessionId: newSessionId,
        uid,
        status: "waiting",
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Firestore scanSession init notice:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startNewSession();
    }
  }, [isOpen]);

  // Real-time Firestore snapshot listener on /users/{uid}/scanSessions/{sessionId}
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    let unsubscribe: (() => void) | null = null;
    try {
      const sessionDocRef = doc(db, "users", uid, "scanSessions", sessionId);
      unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === "ready_to_identify" && data.frontUrl) {
            setSessionStatus("success");
            setReceivedCardTitle(data.prefix || "Mobile Card Scan");

            const newCard: CardItem = {
              id: `card-phone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              prefix: data.prefix || `MOBILE-${sessionId.substring(0, 6).toUpperCase()}`,
              batchId: `batch_mobile_${new Date().toISOString().slice(0, 10)}`,
              batchName: `Mobile Scanner Batch (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
              frontFile: null,
              backFile: null,
              frontPreview: data.frontUrl,
              backPreview: data.backUrl || data.frontUrl,
              isUnpaired: false,
              status: "idle",
            };

            onCardReceived(newCard);
          }
        }
      });
    } catch (err) {
      console.warn("Firestore scanSessions snapshot listener warning:", err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOpen, sessionId, uid]);

  if (!isOpen) return null;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://card-id-app.web.app";
  const companionUrl = `${baseUrl}/companion?session=${sessionId}&uid=${uid}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(companionUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Mobile Companion Scanner</h3>
              <p className="text-[11px] text-slate-400 font-mono">Real-Time Phone Camera Sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Code Canvas */}
        <div className="flex flex-col items-center justify-center space-y-4 pt-2">
          {sessionStatus === "success" ? (
            <div className="flex flex-col items-center text-center space-y-3 py-6 animate-scale-in">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                <CheckCircle className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">Card Received Live!</h4>
                <p className="text-xs text-emerald-400 font-mono font-bold mt-1">
                  ✓ Synced to Desktop Batch Queue & Ready for Vision Identification
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4 w-full">
                <button
                  onClick={startNewSession}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition"
                >
                  <RefreshCw className="h-4 w-4" /> Snap Next Card with Phone
                </button>
                <button
                  onClick={onClose}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-xl border-4 border-cyan-500/30">
                {sessionId && <QRCodeSVG value={companionUrl} size={210} level="M" />}
              </div>

              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono font-bold text-cyan-300 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                  Listening for phone camera upload...
                </div>
                <p className="text-xs text-slate-400 pt-1">
                  Scan this QR code with your phone camera to launch the Mobile Scanner UI.
                </p>
              </div>

              {/* Direct Companion Link Options */}
              <div className="w-full pt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={companionUrl}
                    className="w-full pl-3 pr-2 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-mono text-slate-400 truncate outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-cyan-400 transition"
                    title="Copy Companion Link"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <a
                    href={companionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-cyan-400 transition"
                    title="Test Companion Page"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
