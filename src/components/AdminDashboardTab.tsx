"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { UserProfileDocument, updateUserAdminControls } from "@/lib/userProfile";
import {
  PaymentTransaction,
  PlatformIncomeSummary,
  SubscriptionTier,
  TIER_PLANS,
} from "@/types/subscription";
import {
  subscribeToPayments,
  subscribeToAllUsers,
  computeIncomeMetrics,
  recordPaymentTransaction,
  SAMPLE_INITIAL_PAYMENTS,
} from "@/lib/payments";
import {
  Shield,
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  Search,
  CheckCircle2,
  RefreshCw,
  Crown,
  Zap,
  Tag,
  Award,
  Sparkles,
  Layers,
  Sliders,
  Calendar,
  ExternalLink,
  Lock,
  Plus,
} from "lucide-react";

export function AdminDashboardTab() {
  const { currentUser, userProfile } = useAuth();

  const [users, setUsers] = useState<UserProfileDocument[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>(SAMPLE_INITIAL_PAYMENTS);
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<"users" | "payments" | "settings">("users");

  const [searchUserQuery, setSearchUserQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "paid" | "free" | "admin">("all");
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [adminActionFeedback, setAdminActionFeedback] = useState<string | null>(null);

  // Subscribe to live payments & users from Firestore
  useEffect(() => {
    const unsubPayments = subscribeToPayments((livePayments) => {
      if (livePayments && livePayments.length > 0) {
        setPayments(livePayments);
      }
    });

    const unsubUsers = subscribeToAllUsers((liveUsers) => {
      if (liveUsers && liveUsers.length > 0) {
        setUsers(liveUsers);
      }
    });

    return () => {
      unsubPayments();
      unsubUsers();
    };
  }, []);

  // Compute live financial & user analytics
  const metrics: PlatformIncomeSummary = useMemo(() => {
    return computeIncomeMetrics(payments, users);
  }, [payments, users]);

  // Filter & search users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchUserQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.uid && u.uid.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (tierFilter === "paid") {
        return u.subscriptionTier === "starter" || u.subscriptionTier === "pro";
      } else if (tierFilter === "free") {
        return !u.subscriptionTier || u.subscriptionTier === "free";
      } else if (tierFilter === "admin") {
        return u.role === "admin";
      }
      return true;
    });
  }, [users, searchUserQuery, tierFilter]);

  const showFeedback = (msg: string) => {
    setAdminActionFeedback(msg);
    setTimeout(() => setAdminActionFeedback(null), 3000);
  };

  // Admin Quick Action: Change user tier
  const handleUpdateTier = async (uid: string, newTier: SubscriptionTier) => {
    try {
      const plan = TIER_PLANS[newTier];
      const newScans = plan.scansLimit;
      await updateUserAdminControls(uid, {
        subscriptionTier: newTier,
        scansRemaining: newScans,
        monthlyScanLimit: newScans,
      });

      // Update local state immediately
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid
            ? {
                ...u,
                subscriptionTier: newTier,
                scansRemaining: newScans,
                monthlyScanLimit: newScans,
              }
            : u
        )
      );
      showFeedback(`✓ Updated user to ${newTier.toUpperCase()} tier.`);
    } catch (err: any) {
      showFeedback(`⚠️ Failed to update tier: ${err.message}`);
    }
  };

  // Admin Quick Action: Add scan credits
  const handleAddScans = async (uid: string, amount: number) => {
    const target = users.find((u) => u.uid === uid);
    if (!target) return;

    const current = target.scansRemaining ?? 25;
    const next = amount === 9999 ? 9999 : current + amount;

    try {
      await updateUserAdminControls(uid, {
        scansRemaining: next,
        monthlyScanLimit: Math.max(target.monthlyScanLimit || 25, next),
      });

      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, scansRemaining: next } : u))
      );
      showFeedback(`✓ Added +${amount} scan credits.`);
    } catch (err: any) {
      showFeedback(`⚠️ Failed to add scans: ${err.message}`);
    }
  };

  // Admin Quick Action: Toggle user admin role
  const handleToggleAdminRole = async (uid: string, currentRole?: "user" | "admin") => {
    const nextRole = currentRole === "admin" ? "user" : "admin";
    try {
      await updateUserAdminControls(uid, { role: nextRole });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: nextRole } : u))
      );
      showFeedback(`✓ Updated user role to ${nextRole.toUpperCase()}.`);
    } catch (err: any) {
      showFeedback(`⚠️ Failed to update role: ${err.message}`);
    }
  };

  // Simulate a customer purchase for testing income metrics
  const handleSimulatePayment = async (tier: SubscriptionTier = "pro") => {
    setIsSimulatingPayment(true);
    const plan = TIER_PLANS[tier];
    const isYearly = Math.random() > 0.5;
    const amount = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
    const randomSuffix = Math.floor(100 + Math.random() * 900);

    try {
      const simulatedPayment = await recordPaymentTransaction({
        userId: `usr_test_${Date.now()}`,
        userEmail: `collector_${randomSuffix}@cardid-demo.com`,
        tier,
        amount,
        interval: isYearly ? "yearly" : "monthly",
        paymentMethod: "Visa ending in 4242 (Test Simulation)",
        customerName: `Collector #${randomSuffix}`,
      });

      setPayments((prev) => [simulatedPayment, ...prev]);
      showFeedback(`✓ Simulated +$${amount.toFixed(2)} purchase recorded!`);
    } catch (err: any) {
      showFeedback(`⚠️ Simulation failed: ${err.message}`);
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner: Admin Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 p-8 shadow-2xl">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 px-3 py-1 text-xs font-mono font-bold text-purple-300">
                <Shield className="h-3.5 w-3.5 text-purple-400" /> Platform Executive Command Center
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-300">
                ● Live Financial Engine Active
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Income & User Monitoring
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Track real-time subscription revenue, monitor customer scan quotas, manage customer tiers, and audit all transaction activity across CardID Pro.
            </p>
          </div>

          {/* Quick Simulation Action */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSimulatePayment("pro")}
              disabled={isSimulatingPayment}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-xs font-mono font-bold text-white shadow-lg shadow-purple-500/20 transition active:scale-95 flex items-center gap-2 shrink-0"
            >
              <Plus className={`h-4 w-4 ${isSimulatingPayment ? "animate-spin" : ""}`} />
              {isSimulatingPayment ? "Simulating..." : "Simulate Customer Purchase"}
            </button>
          </div>
        </div>
      </div>

      {/* Admin Feedback Notification */}
      {adminActionFeedback && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-mono font-bold text-emerald-300 flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{adminActionFeedback}</span>
        </div>
      )}

      {/* Financial & Platform KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Gross Revenue */}
        <div className="rounded-3xl border border-emerald-500/40 bg-slate-950/80 p-5 space-y-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="text-emerald-400 flex items-center gap-1.5 uppercase">
              <DollarSign className="h-4 w-4 text-emerald-400" /> Gross Revenue
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              All-Time
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black font-mono text-emerald-400">
              ${metrics.totalGrossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {metrics.totalTransactions} customer transactions logged
          </p>
        </div>

        {/* KPI 2: MRR */}
        <div className="rounded-3xl border border-cyan-500/40 bg-slate-950/80 p-5 space-y-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="text-cyan-300 flex items-center gap-1.5 uppercase">
              <TrendingUp className="h-4 w-4 text-cyan-400" /> Monthly Run Rate (MRR)
            </span>
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
              Active Subs
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black font-mono text-cyan-300">
              ${metrics.monthlyRecurringRevenue.toFixed(2)}
            </span>
            <span className="text-xs font-bold font-mono text-cyan-400">
              ARR: ${(metrics.annualRunRate).toFixed(0)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {metrics.starterSubscribers} Starter • {metrics.proSubscribers} Pro members
          </p>
        </div>

        {/* KPI 3: Paying Members & Conversion Rate */}
        <div className="rounded-3xl border border-amber-500/40 bg-slate-950/80 p-5 space-y-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="text-amber-300 flex items-center gap-1.5 uppercase">
              <Crown className="h-4 w-4 text-amber-400" /> Paid Conversion
            </span>
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {metrics.conversionRate}% Rate
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black font-mono text-amber-300">
              {metrics.totalSubscribers} <span className="text-xs text-slate-400 font-normal">paid</span>
            </span>
            <span className="text-xs font-mono text-slate-300">
              {metrics.freeUsers} Free
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {metrics.totalUsers} registered collectors in database
          </p>
        </div>

        {/* KPI 4: Total Users */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 space-y-2 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="text-slate-300 flex items-center gap-1.5 uppercase">
              <Users className="h-4 w-4 text-slate-400" /> Collector Base
            </span>
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              Accounts
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black font-mono text-white">
              {metrics.totalUsers}
            </span>
            <span className="text-xs font-mono text-slate-400">
              Active Accounts
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Full read/write administration access enabled
          </p>
        </div>
      </div>

      {/* Admin Dashboard Sub-Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveAdminSubTab("users")}
          className={`px-4 py-2 rounded-2xl text-xs font-mono font-bold transition flex items-center gap-2 ${
            activeAdminSubTab === "users"
              ? "bg-slate-800 text-white border border-slate-700 shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Users className="h-4 w-4 text-purple-400" />
          <span>User Directory & Quotas ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminSubTab("payments")}
          className={`px-4 py-2 rounded-2xl text-xs font-mono font-bold transition flex items-center gap-2 ${
            activeAdminSubTab === "payments"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow shadow-emerald-500/10"
              : "text-slate-400 hover:text-emerald-400"
          }`}
        >
          <CreditCard className="h-4 w-4 text-emerald-400" />
          <span>Payments & Income Ledger ({payments.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminSubTab("settings")}
          className={`px-4 py-2 rounded-2xl text-xs font-mono font-bold transition flex items-center gap-2 ${
            activeAdminSubTab === "settings"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow"
              : "text-slate-400 hover:text-amber-300"
          }`}
        >
          <Sliders className="h-4 w-4 text-amber-400" />
          <span>Platform Settings & Limits</span>
        </button>
      </div>

      {/* SUB-TAB 1: USERS DIRECTORY & MANAGEMENT */}
      {activeAdminSubTab === "users" && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-6 shadow-xl">
          {/* User Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                placeholder="Search users by email, name, or UID..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl text-xs font-mono text-slate-100 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
              <span className="text-xs font-mono font-bold text-slate-400">Filter:</span>
              <button
                type="button"
                onClick={() => setTierFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                  tierFilter === "all"
                    ? "bg-slate-800 text-white border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("paid")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                  tierFilter === "paid"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-slate-400 hover:text-amber-300"
                }`}
              >
                Paid ({metrics.totalSubscribers})
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("free")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                  tierFilter === "free"
                    ? "bg-slate-800 text-slate-200 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Free ({metrics.freeUsers})
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("admin")}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                  tierFilter === "admin"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "text-slate-400 hover:text-purple-300"
                }`}
              >
                Admins
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Customer / User</th>
                  <th className="p-3.5">Subscription Tier</th>
                  <th className="p-3.5">Scan Balance</th>
                  <th className="p-3.5">Role</th>
                  <th className="p-3.5">Last Active</th>
                  <th className="p-3.5 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const tier = u.subscriptionTier || "free";
                    const isPro = tier === "pro";
                    const isStarter = tier === "starter";
                    const isAdmin = u.role === "admin";

                    return (
                      <tr key={u.uid} className="hover:bg-slate-900/50 transition">
                        {/* Customer Info */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-amber-500 text-white flex items-center justify-center font-bold text-xs uppercase shadow">
                              {u.email ? u.email[0] : "U"}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-200 block truncate max-w-[200px]">
                                {u.displayName || u.email?.split("@")[0] || "Collector"}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">
                                {u.email || "No email"}
                              </span>
                              <span className="text-[9px] text-slate-600 block truncate font-mono">
                                UID: {u.uid.substring(0, 12)}...
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Subscription Tier & Quick Select */}
                        <td className="p-3.5">
                          <select
                            value={tier}
                            onChange={(e) => handleUpdateTier(u.uid, e.target.value as SubscriptionTier)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold border outline-none cursor-pointer ${
                              isPro
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : isStarter
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            <option value="free" className="bg-slate-900 text-slate-200">
                              Free Hobbyist (25 Scans)
                            </option>
                            <option value="starter" className="bg-slate-900 text-cyan-300">
                              Starter ($9.99/mo)
                            </option>
                            <option value="pro" className="bg-slate-900 text-amber-300">
                              💎 Pro ($29.99/mo)
                            </option>
                          </select>
                        </td>

                        {/* Scan Balance */}
                        <td className="p-3.5">
                          <div className="space-y-1">
                            <span className={`font-black ${isPro ? "text-amber-300" : "text-slate-200"}`}>
                              {isPro ? "Unlimited (Pro)" : `${u.scansRemaining ?? 25} scans remaining`}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAddScans(u.uid, 50)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300 border border-slate-700"
                                title="Add 50 scans"
                              >
                                +50
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddScans(u.uid, 100)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 border border-slate-700"
                                title="Add 100 scans"
                              >
                                +100
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Role Toggle */}
                        <td className="p-3.5">
                          <button
                            type="button"
                            onClick={() => handleToggleAdminRole(u.uid, u.role)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                              isAdmin
                                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            }`}
                          >
                            {isAdmin ? "🛡️ Admin" : "User"}
                          </button>
                        </td>

                        {/* Last Active */}
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Recently"}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleUpdateTier(u.uid, isPro ? "free" : "pro")}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300"
                          >
                            {isPro ? "Reset to Free" : "Grant Pro Access"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 font-mono text-xs">
                      No users found matching &quot;{searchUserQuery}&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PAYMENTS & INCOME LEDGER */}
      {activeAdminSubTab === "payments" && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-400" /> Live Revenue & Transaction Ledger
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every subscription payment and membership upgrade recorded across the application.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleSimulatePayment("starter")}
              disabled={isSimulatingPayment}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Simulate Starter ($9.99)
            </button>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Transaction ID</th>
                  <th className="p-3.5">Customer Email</th>
                  <th className="p-3.5">Plan Purchased</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Billing Interval</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/50 transition">
                    <td className="p-3.5 font-bold text-slate-300">
                      {p.id}
                    </td>
                    <td className="p-3.5 text-slate-200">
                      {p.userEmail || "anonymous@collector.com"}
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        p.tier === "pro"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      }`}>
                        {p.tier} Plan
                      </span>
                    </td>
                    <td className="p-3.5 font-black text-emerald-400">
                      ${p.amount.toFixed(2)} {p.currency}
                    </td>
                    <td className="p-3.5 text-slate-400 uppercase text-[10px]">
                      {p.interval}
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Succeeded
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-slate-400 text-[11px]">
                      {new Date(p.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PLATFORM SETTINGS & LIMITS */}
      {activeAdminSubTab === "settings" && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-6 shadow-xl max-w-2xl">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Sliders className="h-4 w-4 text-amber-400" /> Platform Tier Rules & Limits
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Control the default scan allowances, pricing models, and administrator security access.
            </p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-slate-300 font-bold block">Free Tier Scan Limit:</span>
              <p className="text-slate-400 text-[11px]">
                New collectors receive <strong>25 free AI vision scans</strong> before the subscription paywall is prompted.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-cyan-300 font-bold block">Starter Plan ($9.99/mo):</span>
              <p className="text-slate-400 text-[11px]">
                Allows <strong>250 card scans/mo</strong>, eBay singles separation pipeline, and basic market valuation.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-amber-300 font-bold block">Pro Dealer Plan ($29.99/mo):</span>
              <p className="text-slate-400 text-[11px]">
                Allows <strong>Unlimited card scans</strong>, live PSA 10 & 9 graded comp viewing, grading ROI arbitrage, and bulk CSV export.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2 text-purple-200">
              <span className="font-bold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-purple-400" /> Admin Security Key
              </span>
              <p className="text-[11px] text-purple-300/80">
                Master Admin Passcode: <code className="bg-purple-900/50 px-2 py-0.5 rounded font-bold text-white">cardid2026</code>.
                Any account using this passcode or matching Logan Martinez is automatically elevated to Full Administrator.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
