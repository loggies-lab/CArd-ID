"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { SubscriptionTier, BillingInterval, TIER_PLANS } from "@/types/subscription";
import { recordPaymentTransaction } from "@/lib/payments";
import {
  X,
  Sparkles,
  Check,
  Zap,
  Award,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  Lock,
  ArrowRight,
  CheckCircle2,
  Crown,
} from "lucide-react";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgradeReason?: string;
  reason?: string;
  defaultTier?: SubscriptionTier;
  onUpgradeSuccess?: (tier: SubscriptionTier) => void;
  onSuccess?: () => void;
}

export function PaywallModal({
  isOpen,
  onClose,
  upgradeReason,
  reason,
  defaultTier = "pro",
  onUpgradeSuccess,
  onSuccess,
}: PaywallModalProps) {
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(defaultTier === "free" ? "pro" : defaultTier);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveReason = reason || upgradeReason;

  if (!isOpen) return null;

  const currentTier = userProfile?.subscriptionTier || "free";

  const handleSelectAndUpgrade = async (tier: SubscriptionTier) => {
    if (tier === "free") {
      onClose();
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const plan = TIER_PLANS[tier];
    const amount = interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;

    try {
      const uid = currentUser?.uid || "guest_user";
      const email = currentUser?.email || "guest@cardid.pro";

      await recordPaymentTransaction({
        userId: uid,
        userEmail: email,
        tier,
        amount,
        interval,
        paymentMethod: "Stripe Card Payment (Simulated)",
        customerName: email.split("@")[0],
      });

      await refreshProfile();
      if (onUpgradeSuccess) {
        onUpgradeSuccess(tier);
      }
      if (onSuccess) {
        onSuccess();
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2400);
    } catch (err: any) {
      console.error("Payment error:", err);
      setErrorMessage(err?.message || "Payment could not be processed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-6 p-6 sm:p-8 my-auto">
        {/* Background Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 text-white">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white tracking-tight">
                  Choose Your CardID Membership
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Instant Activation
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {effectiveReason || "Unlock high-volume AI card scanning, live PSA 10/9 market comps, and automated grading arbitrage."}
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

        {/* Success State Overlay */}
        {isSuccess ? (
          <div className="py-12 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h4 className="text-2xl font-black text-white">
                Welcome to {TIER_PLANS[selectedTier].name}! 🎉
              </h4>
              <p className="text-xs text-slate-300 font-mono">
                Your subscription is active. Scan limits refilled to {TIER_PLANS[selectedTier].scansLimit > 500 ? "Unlimited" : TIER_PLANS[selectedTier].scansLimit} scans.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Billing Interval Toggle */}
            <div className="flex items-center justify-center gap-3 relative z-10">
              <div className="inline-flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => setInterval("monthly")}
                  className={`px-5 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                    interval === "monthly"
                      ? "bg-slate-800 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setInterval("yearly")}
                  className={`px-5 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                    interval === "yearly"
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow shadow-amber-500/20"
                      : "text-slate-400 hover:text-amber-300"
                  }`}
                >
                  <span>Annual Billing</span>
                  <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-mono text-rose-300 text-center">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative z-10">
              {/* 1. Free Hobbyist */}
              <div
                className={`rounded-3xl border p-5 space-y-4 flex flex-col justify-between transition-all ${
                  currentTier === "free"
                    ? "border-slate-800 bg-slate-950/60"
                    : "border-slate-850 bg-slate-950/40 hover:border-slate-700"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-extrabold text-white">Free Hobbyist</h4>
                    {currentTier === "free" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed min-h-[32px]">
                    Essential AI identification & basic eBay comps for casual card enthusiasts.
                  </p>
                  <div className="pt-2">
                    <span className="text-3xl font-black text-white font-mono">$0</span>
                    <span className="text-xs text-slate-500 font-mono"> / forever</span>
                  </div>

                  <div className="border-t border-slate-850 pt-3 space-y-2 text-xs">
                    {TIER_PLANS.free.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-slate-300 text-[11px]">
                        <Check className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={currentTier === "free"}
                  onClick={() => handleSelectAndUpgrade("free")}
                  className="w-full py-2.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-mono font-bold transition disabled:opacity-50"
                >
                  {currentTier === "free" ? "Active Plan" : "Downgrade to Free"}
                </button>
              </div>

              {/* 2. Starter Collector */}
              <div
                className={`rounded-3xl border p-5 space-y-4 flex flex-col justify-between transition-all ${
                  selectedTier === "starter"
                    ? "border-cyan-500/80 bg-gradient-to-b from-cyan-950/30 via-slate-900 to-slate-950 shadow-xl shadow-cyan-500/10"
                    : "border-slate-800 bg-slate-950/80 hover:border-cyan-500/40"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-extrabold text-cyan-300">Starter Collector</h4>
                    {currentTier === "starter" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed min-h-[32px]">
                    Ideal for active collectors cataloging, selling singles, and checking PSA 10 comps.
                  </p>
                  <div className="pt-2">
                    <span className="text-3xl font-black text-cyan-300 font-mono">
                      ${interval === "yearly" ? "8.25" : "9.99"}
                    </span>
                    <span className="text-xs text-slate-400 font-mono"> / month</span>
                    {interval === "yearly" && (
                      <span className="text-[10px] text-cyan-400 block font-mono">
                        Billed annually at $99.00/yr
                      </span>
                    )}
                  </div>

                  <div className="border-t border-slate-850 pt-3 space-y-2 text-xs">
                    {TIER_PLANS.starter.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-slate-200 text-[11px]">
                        <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessing || currentTier === "starter"}
                  onClick={() => {
                    setSelectedTier("starter");
                    handleSelectAndUpgrade("starter");
                  }}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-mono font-bold transition shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isProcessing && selectedTier === "starter" ? (
                    "Processing..."
                  ) : currentTier === "starter" ? (
                    "Current Plan"
                  ) : (
                    <>
                      <span>Upgrade to Starter</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>

              {/* 3. Pro Dealer & Arbitrageur (Featured) */}
              <div
                className={`relative rounded-3xl border p-5 space-y-4 flex flex-col justify-between transition-all border-amber-500/80 bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 shadow-2xl shadow-amber-500/15`}
              >
                {/* Popular Pill */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 px-3 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider shadow-md">
                  ⭐ MOST POPULAR • MAXIMUM VALUE
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-extrabold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-400" /> Pro Dealer
                    </h4>
                    {currentTier === "pro" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed min-h-[32px]">
                    Unlimited AI scans, real-time PSA 10 & 9 graded comp arbitrage, and bulk listing exports.
                  </p>
                  <div className="pt-2">
                    <span className="text-3xl font-black text-amber-400 font-mono">
                      ${interval === "yearly" ? "23.25" : "29.99"}
                    </span>
                    <span className="text-xs text-slate-400 font-mono"> / month</span>
                    {interval === "yearly" && (
                      <span className="text-[10px] text-amber-300 block font-mono">
                        Billed annually at $279.00/yr (Save $80)
                      </span>
                    )}
                  </div>

                  <div className="border-t border-slate-850 pt-3 space-y-2 text-xs">
                    {TIER_PLANS.pro.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-slate-100 text-[11px] font-medium">
                        <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessing || currentTier === "pro"}
                  onClick={() => {
                    setSelectedTier("pro");
                    handleSelectAndUpgrade("pro");
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-white text-xs font-mono font-black transition shadow-xl shadow-amber-500/25 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isProcessing && selectedTier === "pro" ? (
                    "Processing..."
                  ) : currentTier === "pro" ? (
                    "Active Pro Member"
                  ) : (
                    <>
                      <Crown className="h-4 w-4" />
                      <span>Unlock Unlimited Pro Access</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Footer Trust Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> 256-Bit SSL Encrypted
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5 text-slate-400" /> Cancel anytime with 1-click
                </span>
              </div>
              <span className="font-mono text-slate-500">
                CardID Pro Billing • Powered by Stripe
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
