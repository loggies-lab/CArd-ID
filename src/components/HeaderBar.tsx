"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Key, CheckCircle, Cpu, Layers, BookmarkCheck, Award, Sliders, X, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface HeaderBarProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  activeTab: "scanner" | "collection" | "grading";
  setActiveTab: (tab: "scanner" | "collection" | "grading") => void;
  savedCount: number;
  candidateCount?: number;
  onOpenGradingSettings?: () => void;
  onOpenAuthModal?: () => void;
}

export function HeaderBar({
  apiKey,
  setApiKey,
  activeTab,
  setActiveTab,
  savedCount,
  candidateCount = 0,
  onOpenGradingSettings,
  onOpenAuthModal,
}: HeaderBarProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTempKey(apiKey);
  }, [apiKey]);

  const handleSaveKey = () => {
    setApiKey(tempKey);
    setShowConfig(false);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <Key className="h-4 w-4 text-cyan-400" /> API Authentication Options
          </h3>
          <button
            onClick={() => setShowConfig(false)}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-slate-300">
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Primary Mode:</strong> Gemini 2.0 Flash / Vertex AI using Cloud secret key.
            </span>
          </div>

          <div>
            <label className="block text-slate-200 font-bold mb-1.5 text-xs">
              Gemini API Key Override:
            </label>
            <input
              type="text"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="Paste your Gemini API Key (e.g. AQ...)"
              className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs font-mono text-cyan-300 focus:outline-none shadow-inner"
            />
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              If set, requests will prioritize this API key for Gemini Vision AI. Get a free API key at{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 underline hover:text-cyan-300"
              >
                Google AI Studio
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={() => setShowConfig(false)}
            className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveKey}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition active:scale-95"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );

  const { currentUser, userProfile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 flex-wrap gap-4">
        {/* Left Section: Brand Logo & Nav Tabs */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 shadow-lg shadow-cyan-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white leading-tight">
                CardID <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Pro</span>
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Powered by <code className="font-mono text-cyan-300">gemini-2.0-flash</code> Vision Pipeline
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Moved to Left) */}
          <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/90 p-1 shadow-inner flex-wrap">
            <button
              onClick={() => setActiveTab("scanner")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                activeTab === "scanner"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Batch Scanner</span>
            </button>

            <button
              onClick={() => setActiveTab("collection")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                activeTab === "collection"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              <span>My Collection</span>
              {savedCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                    activeTab === "collection"
                      ? "bg-white/20 text-white"
                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                  }`}
                >
                  {savedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("grading")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                activeTab === "grading"
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20"
                  : "text-amber-400 hover:text-amber-200 hover:bg-slate-800/50"
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>Grading ROI 🔥</span>
              {candidateCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                    activeTab === "grading"
                      ? "bg-white/20 text-white"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {candidateCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right Section: Rules, Key Options & Profile Avatar */}
        <div className="flex items-center gap-2.5">
          {onOpenGradingSettings && (
            <button
              onClick={onOpenGradingSettings}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
              title="Grading ROI & Threshold Rules"
            >
              <Sliders className="h-3.5 w-3.5 text-amber-400" /> Rules
            </button>
          )}

          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition"
          >
            <Key className="h-3.5 w-3.5 text-cyan-400" /> Key Options
          </button>

          {/* User Profile Avatar Section */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div
                className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs shadow-sm"
                title={`Logged in as ${currentUser.email}`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
                  {currentUser.email ? currentUser.email[0] : "U"}
                </div>
                <div className="hidden md:block text-left leading-none">
                  <div className="text-[11px] font-semibold text-slate-200 max-w-[120px] truncate">
                    {currentUser.email?.split("@")[0]}
                  </div>
                  <div className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider mt-0.5">
                    {userProfile?.subscriptionTier || "free"} tier
                  </div>
                </div>
              </div>

              <button
                onClick={() => logout()}
                className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showConfig && mounted && createPortal(modalContent, document.body)}
    </header>
  );
}
