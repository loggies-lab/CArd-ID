"use client";

import React from "react";
import Link from "next/link";
import { Layers, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-6">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 shadow-inner">
          <Layers className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
            404 • Page Not Found
          </span>
          <h1 className="text-2xl font-black text-white pt-1">
            CardID Pro Navigator
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            The view or page you requested does not exist or an unexpected navigation occurred. Your card collection and staging batches are safely saved.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Card Collection</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
