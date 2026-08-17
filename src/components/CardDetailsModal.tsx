"use client";

import React, { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { generateCdpTitle } from "@/lib/titleGenerator";
import {
  X,
  Save,
  Sparkles,
  Image as ImageIcon,
  CheckCircle,
  Tag,
  ShieldCheck,
  MapPin,
  Award,
  Copy,
  Check,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Search,
  AlertCircle,
} from "lucide-react";

interface CardDetailsModalProps {
  card: CardItem | SavedCollectionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCardId: string, updatedData: CDPCardSchema) => void;
}

interface EbaySaleItem {
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  itemWebUrl: string;
  isOutlier?: boolean;
  outlierReason?: string;
}

interface EbayCompsResult {
  totalFound: number;
  medianPrice: number;
  estimatedMarketValue: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  filteredMinPrice: number;
  filteredMaxPrice: number;
  outlierCount: number;
  recentSales: EbaySaleItem[];
}

export function CardDetailsModal({
  card,
  isOpen,
  onClose,
  onSave,
}: CardDetailsModalProps) {
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const [copiedTitle, setCopiedTitle] = useState(false);

  // eBay Comps State
  const [compsResult, setCompsResult] = useState<EbayCompsResult | null>(null);
  const [isFetchingComps, setIsFetchingComps] = useState(false);
  const [compsError, setCompsError] = useState<string | null>(null);
  const [customCompsQuery, setCustomCompsQuery] = useState("");
  const [appliedValueSuccess, setAppliedValueSuccess] = useState(false);

  // Editable form state initialized from card data
  const [formData, setFormData] = useState<CDPCardSchema>({
    playerName: "",
    brand: "",
    setName: "",
    cardNumber: "",
    subsetParallel: "Base",
    team: "",
    sport: "Baseball",
    year: new Date().getFullYear(),
    isRookie: false,
    isAutographed: false,
    isMemorabilia: false,
    isNumbered: false,
    numberedTo: "",
    condition: "Raw",
    gradingCompany: "None",
    grade: "",
    location: "",
    estimatedValue: undefined,
    valueLastUpdated: undefined,
  });

  useEffect(() => {
    if (card && card.data) {
      setFormData({
        playerName: card.data.playerName || "",
        brand: card.data.brand || "",
        setName: card.data.setName || "",
        cardNumber: card.data.cardNumber ? String(card.data.cardNumber).replace(/#/g, "") : "",
        subsetParallel: card.data.subsetParallel || "",
        team: card.data.team || "",
        sport: card.data.sport || "Baseball",
        year: card.data.year || new Date().getFullYear(),
        isRookie: !!card.data.isRookie,
        isAutographed: !!card.data.isAutographed,
        isMemorabilia: !!card.data.isMemorabilia,
        isNumbered: !!card.data.isNumbered,
        numberedTo: card.data.numberedTo || "",
        condition: card.data.condition || "Raw",
        gradingCompany: card.data.gradingCompany || "None",
        grade: card.data.grade || "",
        location: card.data.location || "",
        estimatedValue: card.data.estimatedValue,
        valueLastUpdated: card.data.valueLastUpdated,
      });
      setActiveSide("front");
      setCopiedTitle(false);
      setAppliedValueSuccess(false);

      const generatedQuery = generateCdpTitle(card.data);
      setCustomCompsQuery(generatedQuery);
      setCompsResult(null);
      setCompsError(null);
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const handleChange = (field: keyof CDPCardSchema, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === "cardNumber" && typeof value === "string" ? value.replace(/#/g, "").trim() : value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(card.id, formData);
    onClose();
  };

  // Re-run generateCdpTitle automatically whenever any attribute changes
  const cdpTitle = generateCdpTitle(formData);

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(cdpTitle);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2500);
  };

  const handleApplyEstValue = (val: number) => {
    const updatedData: CDPCardSchema = {
      ...formData,
      estimatedValue: val,
      valueLastUpdated: new Date().toISOString(),
    };
    setFormData(updatedData);

    // Immediately persist to parent collection & Firestore database!
    if (card && card.id) {
      onSave(card.id, updatedData);
    }

    setAppliedValueSuccess(true);
    setTimeout(() => setAppliedValueSuccess(false), 2500);
  };

  const handleFetchComps = async () => {
    const freshTitle = generateCdpTitle(formData);
    const queryToUse = (customCompsQuery || freshTitle || cdpTitle).trim();
    if (!queryToUse) return;

    setIsFetchingComps(true);
    setCompsError(null);

    try {
      let res = await fetch("/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryToUse }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (pErr) {
        res = await fetch("https://card-id-app.web.app/api/comps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryToUse }),
        });
        data = await res.json();
      }

      if (!res.ok || !data || data.error) {
        setCompsError(data?.error || "Failed to fetch eBay sales comps.");
        setCompsResult(null);
      } else {
        setCompsResult(data);
      }
    } catch (err: any) {
      setCompsError(err.message || "Failed to connect to eBay Comps API.");
      setCompsResult(null);
    } finally {
      setIsFetchingComps(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-300">
                Card Inspector • CDP Title Generator
              </span>
              <h3 className="text-base font-extrabold text-white tracking-tight line-clamp-1">
                {cdpTitle || "Trading Card Inspector"}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* SECTION A: Image Header & Quick Preview Switcher */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            {/* Image Preview Box */}
            <div className="md:col-span-1 space-y-3">
              <div className="relative aspect-[3/4] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
                {activeSide === "front" ? (
                  card.frontPreview ? (
                    <img
                      src={card.frontPreview}
                      alt="Front"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500 font-mono">No Front Image</div>
                  )
                ) : (
                  card.backPreview ? (
                    <img
                      src={card.backPreview}
                      alt="Back"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500 font-mono">No Back Image</div>
                  )
                )}

                <span className="absolute top-2 left-2 rounded bg-slate-950/90 border border-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 uppercase">
                  {activeSide} view
                </span>
              </div>

              {/* Front/Back Thumbnail Switcher */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSide("front")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition ${
                    activeSide === "front"
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Front
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSide("back")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition ${
                    activeSide === "back"
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Back
                </button>
              </div>
            </div>

            {/* Quick Header Metadata Summary & Generated Marketplace Title */}
            <div className="md:col-span-2 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Generated Marketplace Title Input + Copy Button */}
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Generated Marketplace Title
                    </span>
                    {copiedTitle && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded">
                        ✓ Copied to Clipboard!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={cdpTitle}
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-2 text-xs font-mono font-bold text-white focus:outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyTitle}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                    >
                      {copiedTitle ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5 text-white" />}
                      {copiedTitle ? "Copied" : "Copy Title"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {formData.isRookie && (
                    <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300">
                      ⭐ ROOKIE CARD
                    </span>
                  )}
                  {formData.isAutographed && (
                    <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
                      ✍️ AUTOGRAPH
                    </span>
                  )}
                  {formData.isMemorabilia && (
                    <span className="rounded bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-xs font-mono font-bold text-indigo-300">
                      🏷️ MEMORABILIA
                    </span>
                  )}
                  {formData.isNumbered && (
                    <span className="rounded bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-xs font-mono font-bold text-purple-300">
                      #{formData.numberedTo ? ` /${formData.numberedTo}` : " NUMBERED"}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Prefix ID</span>
                  <span className="font-mono font-bold text-cyan-300 truncate block">{card.prefix}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Sport</span>
                  <span className="font-bold text-slate-200 block">{formData.sport || "N/A"}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Format / Grade</span>
                  <span className="font-bold text-slate-200 block">
                    {formData.condition === "Graded" ? `${formData.gradingCompany || ''} ${formData.grade || ''}`.trim() || "Graded" : "Raw"}
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono block">Location</span>
                  <span className="font-mono font-bold text-slate-200 truncate block">{formData.location || "Unassigned"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: Core CDP Identification Fields */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Tag className="h-4 w-4 text-cyan-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Core CDP Identification Fields
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              {/* Player Name */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Player Name</label>
                <input
                  type="text"
                  value={formData.playerName}
                  onChange={(e) => handleChange("playerName", e.target.value)}
                  placeholder="e.g. Ken Griffey Jr."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Sport Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Sport</label>
                <select
                  value={formData.sport}
                  onChange={(e) => handleChange("sport", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="Baseball">Baseball</option>
                  <option value="Basketball">Basketball</option>
                  <option value="Football">Football</option>
                  <option value="Soccer">Soccer</option>
                  <option value="Hockey">Hockey</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Release Year */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Release Year</label>
                <input
                  type="number"
                  value={formData.year || ""}
                  onChange={(e) => handleChange("year", parseInt(e.target.value) || 0)}
                  placeholder="e.g. 1991"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Brand</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={(e) => handleChange("brand", e.target.value)}
                  placeholder="e.g. Upper Deck, Topps, Panini, Bowman"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Set Name */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Set Name</label>
                <input
                  type="text"
                  value={formData.setName}
                  onChange={(e) => handleChange("setName", e.target.value)}
                  placeholder="e.g. 1991 Upper Deck, 2024-25 Bowman Chrome"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Card Number */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Card Number (No #)</label>
                <input
                  type="text"
                  value={formData.cardNumber}
                  onChange={(e) => handleChange("cardNumber", e.target.value)}
                  placeholder="e.g. 245 or BCV-166"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-cyan-300 font-mono focus:outline-none"
                />
              </div>

              {/* Subset / Parallel */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Subset / Parallel Finish</label>
                <input
                  type="text"
                  value={formData.subsetParallel}
                  onChange={(e) => handleChange("subsetParallel", e.target.value)}
                  placeholder="e.g. Base, Refractor, Silver Prizm"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>

              {/* Team */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Team Name</label>
                <input
                  type="text"
                  value={formData.team}
                  onChange={(e) => handleChange("team", e.target.value)}
                  placeholder="e.g. Los Angeles Dodgers, Atlanta Hawks"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION C: CDP Attribute Flags & Serial Numbering */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Award className="h-4 w-4 text-amber-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                CDP Attribute Flags & Serial Print Run
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {/* Rookie Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isRookie
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isRookie}
                  onChange={(e) => handleChange("isRookie", e.target.checked)}
                  className="rounded border-slate-800 accent-emerald-500 h-4 w-4"
                />
                <span>Rookie Card (RC)</span>
              </label>

              {/* Autograph Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isAutographed
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isAutographed}
                  onChange={(e) => handleChange("isAutographed", e.target.checked)}
                  className="rounded border-slate-800 accent-amber-500 h-4 w-4"
                />
                <span>Autograph (AUTO)</span>
              </label>

              {/* Memorabilia Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isMemorabilia
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isMemorabilia}
                  onChange={(e) => handleChange("isMemorabilia", e.target.checked)}
                  className="rounded border-slate-800 accent-indigo-500 h-4 w-4"
                />
                <span>Memorabilia (MEM)</span>
              </label>

              {/* Numbered Checkbox */}
              <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                formData.isNumbered
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
                <input
                  type="checkbox"
                  checked={formData.isNumbered}
                  onChange={(e) => handleChange("isNumbered", e.target.checked)}
                  className="rounded border-slate-800 accent-purple-500 h-4 w-4"
                />
                <span>Numbered Serial</span>
              </label>

              {/* Print Run / Serial Number Field */}
              <div>
                <input
                  type="text"
                  value={formData.numberedTo || ""}
                  onChange={(e) => handleChange("numberedTo", e.target.value)}
                  placeholder="Print Run (e.g. 99, 25, 1)"
                  disabled={!formData.isNumbered}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-xl p-2 text-xs font-mono text-purple-300 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION D: Physical Condition & Storage Metadata */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Physical Condition & Storage Metadata
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {/* Condition / Grade Format Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Condition Format</label>
                <select
                  value={formData.condition || "Raw"}
                  onChange={(e) => handleChange("condition", e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="Raw">Raw</option>
                  <option value="Graded">Graded</option>
                </select>
              </div>

              {/* Grading Company Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Grading Company</label>
                <select
                  value={formData.gradingCompany || "None"}
                  onChange={(e) => handleChange("gradingCompany", e.target.value)}
                  disabled={formData.condition !== "Graded"}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-lg p-2 text-slate-100 focus:outline-none"
                >
                  <option value="None">None</option>
                  <option value="PSA">PSA</option>
                  <option value="BGS">BGS (Beckett)</option>
                  <option value="SGC">SGC</option>
                  <option value="CGC">CGC</option>
                </select>
              </div>

              {/* Grade Value */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Grade Value</label>
                <input
                  type="text"
                  value={formData.grade || ""}
                  onChange={(e) => handleChange("grade", e.target.value)}
                  placeholder="e.g. 10, 9.5, 9"
                  disabled={formData.condition !== "Graded"}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 disabled:opacity-40 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              {/* Location / Bin ID */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-cyan-400" /> Location / Bin ID
                </label>
                <input
                  type="text"
                  value={formData.location || ""}
                  onChange={(e) => handleChange("location", e.target.value)}
                  placeholder="e.g. Box 1, Bin A"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                />
              </div>

              {/* Applied Card Value ($) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Applied Card Value ($)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.estimatedValue !== undefined ? formData.estimatedValue : ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleChange("estimatedValue", isNaN(val) ? undefined : val);
                    handleChange("valueLastUpdated", new Date().toISOString());
                  }}
                  placeholder="e.g. 1.47"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg p-2 text-emerald-300 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION E: Real-Time eBay Market Sold Comps */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  eBay Market Sales Comps
                </h4>
              </div>

              {/* Search Query Input & Fetch Button */}
              <div className="flex items-center gap-2 flex-1 max-w-lg">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={customCompsQuery}
                    onChange={(e) => setCustomCompsQuery(e.target.value)}
                    placeholder="Search eBay comps..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl text-xs font-mono text-slate-100 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleFetchComps}
                  disabled={isFetchingComps || !customCompsQuery.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetchingComps ? "animate-spin" : ""}`} />
                  {isFetchingComps ? "Fetching..." : "Fetch Comps"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleFetchComps();
                  }}
                  disabled={isFetchingComps || !customCompsQuery.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
                >
                  <Award className="h-3.5 w-3.5 text-white" />
                  Grade ROI Audit
                </button>
              </div>
            </div>

            {/* Error Message */}
            {compsError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-mono text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{compsError}</span>
              </div>
            )}

            {/* Comps Summary Cards & Results */}
            {compsResult && (
              <div className="space-y-4">
                {/* Stats Header Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Estimated Fair Market Value */}
                  <div className="bg-gradient-to-br from-cyan-950/80 to-slate-900 p-3 rounded-xl border border-cyan-500/30 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-[10px] text-cyan-300 font-mono font-bold uppercase block tracking-wider">
                        Est. Fair Value
                      </span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        ${compsResult.estimatedMarketValue.toFixed(2)}
                      </span>
                      <span className="text-[9px] text-slate-400 block font-mono">Outlier-Cleaned Avg</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyEstValue(compsResult.estimatedMarketValue)}
                      className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono font-bold transition flex items-center justify-center gap-1 shadow active:scale-95"
                    >
                      {appliedValueSuccess ? <Check className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                      {appliedValueSuccess ? "✓ Value Applied!" : `Apply $${compsResult.estimatedMarketValue.toFixed(2)} to Card`}
                    </button>
                  </div>

                  {/* Median Price */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Median Price</span>
                    <span className="text-lg font-black text-cyan-300 font-mono">
                      ${compsResult.medianPrice.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-400 block font-mono">50th Percentile</span>
                  </div>

                  {/* Clean Price Range */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Consensus Range</span>
                    <span className="text-sm font-black text-slate-200 font-mono block mt-1">
                      ${compsResult.filteredMinPrice.toFixed(2)} - ${compsResult.filteredMaxPrice.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-400 block font-mono">Core Price Band</span>
                  </div>

                  {/* Sample & Outlier Filter Status */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Sample & Filtering</span>
                    <span className="text-xs font-mono font-bold text-slate-200 block mt-1">
                      {compsResult.totalFound} Sales Scanned
                    </span>
                    {compsResult.outlierCount > 0 ? (
                      <span className="text-[9px] text-amber-400 font-mono font-bold block mt-0.5">
                        ⚡ {compsResult.outlierCount} Outlier Excluded
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-mono block mt-0.5">
                        ✓ Clean Uniform Sample
                      </span>
                    )}
                  </div>
                </div>

                {/* Sales Listings Grid */}
                {compsResult.recentSales.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      Recent Market Listings ({compsResult.recentSales.length})
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {compsResult.recentSales.map((sale, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 bg-slate-900 border p-2.5 rounded-xl transition ${
                            sale.isOutlier
                              ? "border-amber-500/40 bg-amber-500/5 opacity-80"
                              : "border-slate-800/80 hover:border-slate-700"
                          }`}
                        >
                          <div className="h-12 w-12 shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                            {sale.imageUrl ? (
                              <img src={sale.imageUrl} alt={sale.title} className="h-full w-full object-cover" />
                            ) : (
                              <DollarSign className="h-5 w-5 text-slate-600" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h5 className="text-xs font-semibold text-slate-200 line-clamp-1 flex-1" title={sale.title}>
                                {sale.title}
                              </h5>
                              {sale.isOutlier && (
                                <span
                                  className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-300"
                                  title={sale.outlierReason || "Outlier Excluded"}
                                >
                                  ⚡ Excluded ({sale.outlierReason || "Price Outlier"})
                                </span>
                              )}
                            </div>
                            <span className={`text-xs font-mono font-black block mt-0.5 ${
                              sale.isOutlier ? "text-amber-300" : "text-emerald-400"
                            }`}>
                              ${sale.price.toFixed(2)} {sale.currency}
                            </span>
                          </div>

                          {sale.itemWebUrl && (
                            <a
                              href={sale.itemWebUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-400 hover:text-white transition shrink-0"
                              title="View Listing on eBay"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 font-mono text-center py-4 bg-slate-900/40 rounded-xl">
                    No matching sales comps found for &quot;{customCompsQuery}&quot;. Try adjusting search keywords.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition active:scale-95"
            >
              <Save className="h-4 w-4" /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
