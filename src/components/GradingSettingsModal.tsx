"use client";

import React, { useState } from "react";
import { UserGradingSettings } from "@/types/card";
import { Sliders, X, ShieldCheck, DollarSign, Award, Check } from "lucide-react";

interface GradingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserGradingSettings;
  onSaveSettings: (newSettings: UserGradingSettings) => void;
}

export function GradingSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: GradingSettingsModalProps) {
  const [formData, setFormData] = useState<UserGradingSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    setFormData(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-md shadow-amber-500/20">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">Grading ROI & Target Rules</h3>
              <p className="text-[11px] text-slate-400">Configure PSA/BGS grading candidate filters</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Min Raw Value Threshold */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Minimum Raw Card Value Threshold:
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
              <input
                type="number"
                step="5"
                min="0"
                value={formData.minRawThreshold}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minRawThreshold: Math.max(0, parseFloat(e.target.value) || 0),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-7 pr-3 py-2.5 text-xs font-mono font-bold text-amber-300 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Cards with estimated raw value &ge; ${formData.minRawThreshold.toFixed(2)} will be flagged for grading analysis.
            </p>
          </div>

          {/* Preferred Grading Company */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Target Grading Company:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["PSA", "BGS", "SGC", "CGC"] as const).map((company) => (
                <button
                  key={company}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, targetCompany: company }))}
                  className={`py-2 rounded-xl text-xs font-mono font-bold transition border ${
                    formData.targetCompany === company
                      ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {company}
                </button>
              ))}
            </div>
          </div>

          {/* Estimated Grading Fee */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-indigo-400" /> Estimated Grading Fee per Card:
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono font-bold">$</span>
              <input
                type="number"
                step="1"
                min="0"
                value={formData.estimatedGradingFee}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    estimatedGradingFee: Math.max(0, parseFloat(e.target.value) || 0),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl pl-7 pr-3 py-2.5 text-xs font-mono font-bold text-indigo-300 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Includes grading tier cost + return shipping (~$19.00 for PSA Value Tier).
            </p>
          </div>

          {/* Submit Controls */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 active:scale-95"
            >
              {savedSuccess ? <Check className="h-4 w-4" /> : null}
              {savedSuccess ? "Saved Settings!" : "Save Grading Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
