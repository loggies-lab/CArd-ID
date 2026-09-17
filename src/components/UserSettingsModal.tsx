"use client";

import React, { useState, useEffect } from "react";
import { UserSettings, DEFAULT_USER_SETTINGS, getTotalGradingCost } from "@/types/card";
import {
  Sliders,
  X,
  ShieldCheck,
  DollarSign,
  Award,
  Check,
  TrendingUp,
  RotateCcw,
  Tag,
  Package,
  Sparkles,
  Info,
  Scale,
} from "lucide-react";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSaveSettings: (newSettings: UserSettings) => void;
  onResetDefaults?: () => void;
}

export function UserSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onResetDefaults,
}: UserSettingsModalProps) {
  const [formData, setFormData] = useState<UserSettings>(settings);
  const [activeCategory, setActiveCategory] = useState<"grading" | "ebay" | "triage">("grading");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  if (!isOpen) return null;

  // Live Calculations for Visual Previews
  const totalGradingCost = getTotalGradingCost(formData);
  const previewCardPrice = 20.0;
  const previewPlatformFee = parseFloat((previewCardPrice * ((formData.ebayFeePct ?? 13.25) / 100)).toFixed(2));
  const previewNetEbay = parseFloat(
    Math.max(
      0,
      previewCardPrice - (previewPlatformFee + (formData.ebayFixedFee ?? 0.3) + (formData.standardEnvelopeCost ?? 1.0))
    ).toFixed(2)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Sync backward compatibility fields
    const updated: UserSettings = {
      ...formData,
      minRawThreshold: formData.minEbayRawThreshold,
      estimatedGradingFee: totalGradingCost,
      minNetProfitThreshold: formData.minGradingProfit,
      minRoiThreshold: formData.minGradingRoiPct,
    };
    onSaveSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  const handleResetToDefaults = () => {
    const factory = { ...DEFAULT_USER_SETTINGS };
    setFormData(factory);
    if (onResetDefaults) {
      onResetDefaults();
    } else {
      onSaveSettings(factory);
    }
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-2xl w-full space-y-6 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-cyan-500 shadow-md shadow-amber-500/20">
              <Sliders className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-100 tracking-tight">User Rules &amp; Fee Settings</h3>
                <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                  Custom Profile
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Configure grading formulas, selling deductions, and inventory triage cutoffs.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
          <button
            type="button"
            onClick={() => setActiveCategory("grading")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeCategory === "grading"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Award className="h-3.5 w-3.5 text-amber-400" />
            <span>1. Grading Rules</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory("ebay")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeCategory === "ebay"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Tag className="h-3.5 w-3.5 text-cyan-400" />
            <span>2. Selling Fees &amp; Supplies</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory("triage")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeCategory === "triage"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Package className="h-3.5 w-3.5 text-emerald-400" />
            <span>3. Triage Cutoffs</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* GROUP 1: GRADING RULES */}
          {activeCategory === "grading" && (
            <div className="space-y-4 animate-fade-in">
              {/* Primary Target Grade Scenario */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-amber-400" /> Primary Target Grade Scenario:
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, targetGrade: "psa9" }))}
                    className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition border text-left flex flex-col justify-between gap-1 ${
                      (formData.targetGrade || "psa9") === "psa9"
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="font-extrabold flex items-center gap-1 text-[11px]">
                      🛡️ PSA 9 Baseline
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal leading-tight">
                      Conservative baseline. Card must profit at Grade 9.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, targetGrade: "psa10" }))}
                    className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition border text-left flex flex-col justify-between gap-1 ${
                      formData.targetGrade === "psa10"
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="font-extrabold flex items-center gap-1 text-[11px]">
                      ⭐ PSA 10 Ceiling
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal leading-tight">
                      Aggressive target. Evaluates best-case gem-mint upside.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, targetGrade: "balanced" }))}
                    className={`py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition border text-left flex flex-col justify-between gap-1 ${
                      formData.targetGrade === "balanced"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="font-extrabold flex items-center gap-1 text-[11px]">
                      ⚖️ Balanced
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal leading-tight">
                      High PSA 10 profit with non-negative PSA 9 floor.
                    </span>
                  </button>
                </div>
              </div>

              {/* Target Grading Company */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" /> Target Grading Company:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["PSA", "BGS", "SGC", "CGC"] as const).map((company) => (
                    <button
                      key={company}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, targetCompany: company }))}
                      className={`py-2 rounded-xl text-xs font-mono font-bold transition border ${
                        formData.targetCompany === company
                          ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-md shadow-indigo-500/10"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {company}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dual Fee Inputs: Grading Fee + Return Shipping */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-amber-400" /> Grading Fee per Card:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.gradingFee ?? 20.0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          gradingFee: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Factory Default: $20.00 (PSA Value Tier)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-cyan-400" /> Return Shipping Allocation:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={formData.gradingShippingAllocation ?? 5.0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          gradingShippingAllocation: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-cyan-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Factory Default: $5.00 per card
                  </span>
                </div>
              </div>

              {/* Combined Total Cost Indicator */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-amber-400" />
                  Combined Grading Cost per Card:
                </span>
                <span className="text-sm font-black font-mono text-amber-400">
                  ${totalGradingCost.toFixed(2)}{" "}
                  <span className="text-[10px] text-slate-500 font-normal">
                    (${formData.gradingFee?.toFixed(2) || "20.00"} fee + ${formData.gradingShippingAllocation?.toFixed(2) || "5.00"} ship)
                  </span>
                </span>
              </div>

              {/* Profit & ROI Thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Min Net Profit:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={formData.minGradingProfit ?? 50.0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          minGradingProfit: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Factory Default: $50.00 minimum
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-400" /> Min ROI %:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">%</span>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={formData.minGradingRoiPct ?? 50}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          minGradingRoiPct: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-indigo-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Factory Default: 50% ROI
                  </span>
                </div>
              </div>

              {/* Grade 9 Safety Floor Checkbox */}
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.requirePsa9Profitability}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        requirePsa9Profitability: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 h-4 w-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Grade 9 Safety Floor: Require PSA 9 Break-Even
                  </span>
                </label>
                <p className="text-[10px] text-slate-400 leading-relaxed pl-6">
                  Only gives 🟢 DO IT status if card still breaks even or profits if it receives a Grade 9 instead of a 10.
                </p>
              </div>

              {/* Traffic-Light Threshold Visual Guide */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[10px] font-mono space-y-1">
                <span className="font-bold text-slate-300 block mb-1">
                  Active Traffic-Light Qualification Logic:
                </span>
                <div className="text-emerald-400">
                  🟢 <strong>DO IT:</strong> Net profit &ge; ${(formData.minGradingProfit ?? 50.0).toFixed(2)} AND ROI &ge; {(formData.minGradingRoiPct ?? 50).toFixed(0)}%
                </div>
                <div className="text-amber-400">
                  🟡 <strong>MAYBE:</strong> Net profit &gt; $0 with upside, but below ${(formData.minGradingProfit ?? 50.0).toFixed(2)} or {(formData.minGradingRoiPct ?? 50).toFixed(0)}% ROI
                </div>
                <div className="text-rose-400">
                  🔴 <strong>DON&apos;T DO IT:</strong> Net profit &le; $0 after total grading cost (${totalGradingCost.toFixed(2)})
                </div>
              </div>
            </div>
          )}

          {/* GROUP 2: SELLING FEES & SUPPLIES */}
          {activeCategory === "ebay" && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-cyan-400" /> Platform Fee (%):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">%</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={formData.ebayFeePct ?? 13.25}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ebayFeePct: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-cyan-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Default: 13.25% (eBay Trading Cards)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-amber-400" /> Fixed Transaction Fee:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={formData.ebayFixedFee ?? 0.3}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ebayFixedFee: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Default: $0.30 per order
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-emerald-400" /> Shipping &amp; Supplies:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={formData.standardEnvelopeCost ?? 1.0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          standardEnvelopeCost: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1">
                    Default: $1.00 (Standard Envelope + Toploader)
                  </span>
                </div>
              </div>

              {/* Live Demonstration Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-950 to-slate-900 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
                    <Sparkles className="h-3.5 w-3.5" /> Live Net Payout Preview on a $20.00 Card Sale:
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    Net Take-Home: ${previewNetEbay.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Sale:</span>
                    <span>$20.00</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span>eBay Platform Fee ({formData.ebayFeePct ?? 13.25}%):</span>
                    <span>-${previewPlatformFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span>Fixed Transaction Fee:</span>
                    <span>-${(formData.ebayFixedFee ?? 0.3).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-400">
                    <span>Shipping &amp; Envelope Supplies:</span>
                    <span>-${(formData.standardEnvelopeCost ?? 1.0).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-1 flex justify-between font-black text-emerald-300">
                    <span>Estimated Net Proceeds:</span>
                    <span>
                      ${previewNetEbay.toFixed(2)} ({((previewNetEbay / previewCardPrice) * 100).toFixed(1)}% of sale)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GROUP 3: TRIAGE CUTOFFS */}
          {activeCategory === "triage" && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Minimum Raw Comp to List on eBay ($):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.minEbayRawThreshold ?? 4.0}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        minEbayRawThreshold: Math.max(0, parseFloat(e.target.value) || 0),
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2.5 text-xs font-mono font-bold text-emerald-300 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-mono block mt-1">
                  Factory Default: $4.00 (Cards below this threshold are routed to bulk lot)
                </span>
              </div>

              {/* Triage Behavior Explanation */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-cyan-400" /> Automatic Inventory Triage Separation:
                </span>
                <div className="space-y-1.5 text-[11px] text-slate-300">
                  <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">✓ eBay Singles:</span>
                    <span>
                      Cards valued &ge; ${(formData.minEbayRawThreshold ?? 4.0).toFixed(2)} are routed to the eBay Singles candidate pipeline for individual listing.
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-2">
                    <span className="text-amber-400 font-bold">📦 Bulk Lot:</span>
                    <span>
                      Cards valued &lt; ${(formData.minEbayRawThreshold ?? 4.0).toFixed(2)} are automatically grouped into the Bulk Lot filter to prevent losing money on single fees.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-800 text-xs font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center gap-1.5"
              title="Reset all settings to original factory default values"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              {resetSuccess ? "✓ Restored Defaults!" : "Reset to Defaults"}
            </button>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5 active:scale-95"
              >
                {savedSuccess ? <Check className="h-4 w-4" /> : null}
                {savedSuccess ? "✓ Changes Saved!" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
