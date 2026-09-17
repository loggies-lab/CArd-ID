"use client";

import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { UserProfileDocument } from "@/lib/userProfile";
import { UserGradingSettings } from "@/types/card";
import {
  User as UserIcon,
  X,
  Award,
  Sliders,
  CheckCircle,
  TrendingUp,
  Shield,
  Zap,
  DollarSign,
  Mail,
  Calendar,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  userProfile: UserProfileDocument | null;
  gradingSettings: UserGradingSettings;
  onSaveGradingSettings: (newSettings: UserGradingSettings) => void;
  onOpenPaywall?: () => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  userProfile,
  gradingSettings,
  onSaveGradingSettings,
  onOpenPaywall,
}: UserProfileModalProps) {
  const [formData, setFormData] = useState<UserGradingSettings>(gradingSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setFormData(gradingSettings);
  }, [gradingSettings, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveGradingSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const username = currentUser?.email ? currentUser.email.split("@")[0] : "Collector";
  const userEmail = currentUser?.email || "guest@cardid.pro";
  const subscriptionTier = (userProfile?.subscriptionTier || "free").toUpperCase();
  const isAdmin = userProfile?.role === "admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-6 p-6 sm:p-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 p-0.5 shadow-lg">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-white font-bold text-lg uppercase">
                {username[0]}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">{username}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  subscriptionTier === "PRO"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : subscriptionTier === "STARTER"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "bg-slate-800 text-slate-300 border border-slate-700"
                }`}>
                  {subscriptionTier} TIER
                </span>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ADMIN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Mail className="h-3 w-3 text-slate-500" /> {userEmail}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-400 hover:border-slate-700 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subscription Plan & Stats Banner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Current Subscription</div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{subscriptionTier} Plan</span>
              {userProfile?.subscriptionTier === "pro" ? (
                <span className="text-[10px] text-purple-400 font-mono">Unlimited Scans & Full AI</span>
              ) : (
                <span className="text-[10px] text-cyan-400 font-mono">
                  {userProfile?.scansRemaining ?? 25} scans remaining
                </span>
              )}
            </div>
          </div>
          {onOpenPaywall && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPaywall();
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
            >
              {userProfile?.subscriptionTier === "pro" ? "Manage Plan" : "Upgrade Plan 🔥"}
            </button>
          )}
        </div>

        {/* Profile Stats Overview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 space-y-1">
            <div className="text-[10px] font-mono font-bold text-slate-400 flex items-center gap-1">
              <Zap className="h-3 w-3 text-cyan-400" /> Scans Remaining
            </div>
            <div className="text-xl font-black font-mono text-cyan-300">
              {userProfile?.subscriptionTier === "pro"
                ? "Unlimited"
                : `${userProfile?.scansRemaining ?? 25} / ${userProfile?.monthlyScanLimit ?? 25}`}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
            <div className="text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1">
              <Award className="h-3 w-3 text-amber-400" /> Target Net Profit
            </div>
            <div className="text-xl font-black font-mono text-amber-300">
              ${(formData.minNetProfitThreshold ?? 50.0).toFixed(0)} Goal
            </div>
          </div>
        </div>

        {/* Profile Form: Grading Rules & Preferences */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400">
              <Sliders className="h-3.5 w-3.5" /> Account Grading ROI Rules & Thresholds
            </div>
            <p className="text-[11px] text-slate-400">
              These settings control how CardID isolates and recommends cards worth sending for grading.
            </p>
          </div>

          {/* Setting 1: Raw Threshold */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Minimum Raw Card Value Threshold ($):
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={formData.minRawThreshold}
              onChange={(e) =>
                setFormData({ ...formData, minRawThreshold: parseFloat(e.target.value) || 0 })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-amber-300 outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-slate-400">
              Cards with estimated raw value &ge; ${(formData.minRawThreshold ?? 30).toFixed(2)} get pulled into grading analysis.
            </p>
          </div>

          {/* Setting 2: Net Profit Target */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> Minimum Target Net Profit ($):
            </label>
            <input
              type="number"
              step="5"
              min="0"
              value={formData.minNetProfitThreshold ?? 50.0}
              onChange={(e) =>
                setFormData({ ...formData, minNetProfitThreshold: parseFloat(e.target.value) || 0 })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-emerald-400 outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-slate-400">
              Cards yielding &ge; ${(formData.minNetProfitThreshold ?? 50.0).toFixed(2)} net profit are recommended for submission.
            </p>
          </div>

          {/* Setting 3: PSA 9 Safety Checkbox */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requirePsa9Profitability ?? false}
                onChange={(e) =>
                  setFormData({ ...formData, requirePsa9Profitability: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-cyan-400" /> PSA 9 Safety Net Rule
                </span>
                <p className="text-[10px] text-slate-400">
                  Only recommend cards if they produce positive net profit even if they grade a PSA 9.
                </p>
              </div>
            </label>
          </div>

          {/* Setting 4: Target Company */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200">Target Grading Service:</label>
            <div className="grid grid-cols-4 gap-2">
              {(["PSA", "BGS", "SGC", "CGC"] as const).map((company) => (
                <button
                  key={company}
                  type="button"
                  onClick={() => setFormData({ ...formData, targetCompany: company })}
                  className={`py-1.5 text-xs font-mono font-bold rounded-xl border transition ${
                    formData.targetCompany === company
                      ? "border-amber-500 bg-amber-500/20 text-amber-300 shadow"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {company}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 5: Grading Fee */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200">Estimated Grading Fee per Card ($):</label>
            <input
              type="number"
              step="1"
              min="0"
              value={formData.estimatedGradingFee}
              onChange={(e) =>
                setFormData({ ...formData, estimatedGradingFee: parseFloat(e.target.value) || 0 })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-xs font-mono font-bold text-white shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle className="h-4 w-4 text-white" /> Saved to Profile!
                </>
              ) : (
                "Save Profile & Grading Rules"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
