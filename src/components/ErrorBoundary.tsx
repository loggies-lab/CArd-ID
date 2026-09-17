"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught component error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-4 shadow-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">
              {this.props.fallbackTitle || "Something went wrong loading this view"}
            </h3>
            <p className="text-xs font-mono text-rose-300/80 leading-relaxed break-words">
              {this.state.error?.message || "An unexpected error occurred during rendering."}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-mono font-bold text-rose-200 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
