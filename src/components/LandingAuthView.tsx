"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, Layers, ShieldCheck, TrendingUp, Award, Zap, Mail, Lock, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

export function LandingAuthView() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset, enterAsGuest } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetFormState = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleTabSwitch = (newTab: "signin" | "signup" | "reset") => {
    resetFormState();
    setTab(newTab);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      if (tab === "signin") {
        if (!email || !password) throw new Error("Please enter your email and password.");
        await signInWithEmail(email, password);
      } else if (tab === "signup") {
        if (!email || !password) throw new Error("Please enter an email and password.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        await signUpWithEmail(email, password);
      } else if (tab === "reset") {
        if (!email) throw new Error("Please enter your email address.");
        await sendPasswordReset(email);
        setSuccessMsg("Password reset link sent! Check your inbox.");
      }
    } catch (err: any) {
      let msg = err.message || "An authentication error occurred.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        msg = "Invalid email or password. If your account was created with Google, click 'Continue with Google'.";
      } else if (err.code === "auth/account-exists-with-different-credential") {
        msg = "An account with this email was registered using Google. Click 'Continue with Google'.";
      } else if (err.code === "auth/email-already-in-use") {
        msg = "An account with this email already exists. Try signing in or click 'Continue with Google'.";
      } else if (err.code === "auth/user-not-found") {
        msg = "No account found with this email.";
      }
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      let msg = err.message || "Google sign-in failed.";
      if (err.code === "auth/operation-not-allowed") {
        msg = "Google Sign-In is not enabled in Firebase Console.";
      } else if (err.code === "auth/unauthorized-domain") {
        msg = "Domain not authorized in Firebase Console.";
      }
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Dynamic Background Glow effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Header Logo */}
      <header className="px-6 py-6 border-b border-slate-900 bg-slate-950/70 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 shadow-lg shadow-cyan-500/20">
              <Sparkles className="h-6 w-6 text-white animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">
                CardID <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Pro</span>
              </h1>
              <p className="text-xs text-slate-400">AI Sports Card Scanner & Market Comps Engine</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            <ShieldCheck className="w-3.5 h-3.5" /> Isolated Multi-Tenant Cloud
          </span>
        </div>
      </header>

      {/* Hero & Auth Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-12 gap-12 items-center relative z-10 my-auto">
        {/* Left Side: Product Value & Highlights */}
        <div className="lg:col-span-7 space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-cyan-400 shadow-inner">
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Powered by Gemini 2.0 Flash Vision
          </div>

          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight">
            Identify Cards & Track <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">Real-Time Comps</span> In Seconds
          </h2>

          <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
            Scan raw sports cards in bulk using state-of-the-art AI vision. Fetch live eBay sales comps, auto-filter parallel noise, and calculate PSA 10 & PSA 9 grading ROI instantly.
          </p>

          {/* Feature Badges */}
          <div className="grid sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Batch Recognition</h4>
              <p className="text-[11px] text-slate-400">High-speed dual-sided vision identification.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Clean eBay Comps</h4>
              <p className="text-[11px] text-slate-400">Strict parallel filtering & outlier elimination.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Award className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">Grading ROI Engine</h4>
              <p className="text-[11px] text-slate-400">Automated PSA 10 & PSA 9 profit threshold calculation.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Embedded Auth Card */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative space-y-6">
            <div className="text-center space-y-1">
              <h3 className="text-xl font-extrabold text-white">
                {tab === "signin" && "Sign In to Your Dashboard"}
                {tab === "signup" && "Create Free Account"}
                {tab === "reset" && "Reset Password"}
              </h3>
              <p className="text-xs text-slate-400">
                {tab === "signin" && "Access your isolated card collection & scan history."}
                {tab === "signup" && "Start scanning cards with 50 free cloud scans."}
                {tab === "reset" && "We'll send a password recovery link to your email."}
              </p>
            </div>

            {/* Tab Controls */}
            {tab !== "reset" && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleTabSwitch("signin")}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    tab === "signin"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSwitch("signup")}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    tab === "signup"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Error & Success Feedback Banners */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Google Sign In Button */}
            {tab !== "reset" && (
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-bold text-white transition shadow-sm disabled:opacity-50 active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.21 0 10.05 0 12s.47 3.79 1.29 5.42l3.99-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            )}

            {tab !== "reset" && (
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <span className="relative px-3 bg-slate-900 text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                  Or with email
                </span>
              </div>
            )}

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>

              {tab !== "reset" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Password</label>
                    {tab === "signin" && (
                      <button
                        type="button"
                        onClick={() => handleTabSwitch("reset")}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>
                </div>
              )}

              {tab === "signup" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>
                      {tab === "signin" && "Sign In to Dashboard"}
                      {tab === "signup" && "Create Free Account"}
                      {tab === "reset" && "Send Reset Link"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center border-t border-slate-800/80">
              <button
                type="button"
                onClick={enterAsGuest}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition flex items-center justify-center gap-1.5 mx-auto"
              >
                <span>Skip Sign In & Access Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {tab === "reset" && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => handleTabSwitch("signin")}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition"
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-900 text-center text-xs text-slate-500 relative z-10">
        &copy; {new Date().getFullYear()} CardID Pro. Built for Card Collectors & Dealers.
      </footer>
    </div>
  );
}
