import React, { useRef, useState } from "react";
import { UploadCloud, Image as ImageIcon, RefreshCw, AlertTriangle, CheckCircle2, Trash2, ArrowLeftRight, Plus, Camera, Smartphone, FolderPlus } from "lucide-react";
import { CardItem } from "@/types/card";
import { parseAndPairFiles } from "@/lib/pairing";

interface FileDropzoneProps {
  items: CardItem[];
  setItems: React.Dispatch<React.SetStateAction<CardItem[]>>;
  onIdentifyBatch: () => void;
  isProcessing: boolean;
  onOpenQrScanner?: () => void;
}

export function FileDropzone({ items, setItems, onIdentifyBatch, isProcessing, onOpenQrScanner }: FileDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraFrontInputRef = useRef<HTMLInputElement>(null);
  const cameraBackInputRef = useRef<HTMLInputElement>(null);

  // Intake Selection State: "upload" or "camera"
  const [intakeMode, setIntakeMode] = useState<"upload" | "camera">("upload");

  // Camera capture mode: "front_and_back" vs "front_only"
  const [cameraMode, setCameraMode] = useState<"front_and_back" | "front_only">("front_and_back");
  const [cameraStep, setCameraStep] = useState<"front" | "back">("front");
  const [tempFrontFile, setTempFrontFile] = useState<File | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const updatedItems = parseAndPairFiles(fileArray, items);
    setItems(updatedItems);
  };

  // Continuous Camera Capture Handler
  const handleCameraSnapFront = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cameraMode === "front_only") {
      // Front Only mode: pair front image as back and save to staging queue immediately
      const newCard: CardItem = {
        id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        prefix: `SNAP-${Date.now().toString().slice(-4)}`,
        batchId: `batch_${Date.now()}`,
        batchName: `Camera Batch (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
        frontFile: file,
        backFile: file,
        frontPreview: URL.createObjectURL(file),
        backPreview: URL.createObjectURL(file),
        isUnpaired: false,
        status: "idle",
      };
      setItems((prev) => [newCard, ...prev]);
      setCameraStep("front");
      setTempFrontFile(null);
    } else {
      // Front & Back mode: save front and prompt back photo
      setTempFrontFile(file);
      setCameraStep("back");
      // Auto-trigger back camera input after 350ms
      setTimeout(() => {
        cameraBackInputRef.current?.click();
      }, 350);
    }
  };

  const handleCameraSnapBack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const backFile = e.target.files?.[0];
    if (!backFile || !tempFrontFile) return;

    const newCard: CardItem = {
      id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      prefix: `SNAP-${Date.now().toString().slice(-4)}`,
      batchId: `batch_${Date.now()}`,
      batchName: `Camera Batch (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
      frontFile: tempFrontFile,
      backFile: backFile,
      frontPreview: URL.createObjectURL(tempFrontFile),
      backPreview: URL.createObjectURL(backFile),
      isUnpaired: false,
      status: "idle",
    };

    setItems((prev) => [newCard, ...prev]);
    setCameraStep("front");
    setTempFrontFile(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const handleAttachImage = (cardId: string, side: 'front' | 'back', file: File) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== cardId) return item;
        const updatedFront = side === 'front' ? file : item.frontFile;
        const updatedBack = side === 'back' ? file : item.backFile;
        return {
          ...item,
          frontFile: updatedFront,
          backFile: updatedBack,
          frontPreview: updatedFront ? URL.createObjectURL(updatedFront) : item.frontPreview,
          backPreview: updatedBack ? URL.createObjectURL(updatedBack) : item.backPreview,
          isUnpaired: !updatedFront || !updatedBack,
        };
      })
    );
  };

  const handleSwapImages = (cardId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== cardId) return item;
        return {
          ...item,
          frontFile: item.backFile,
          backFile: item.frontFile,
          frontPreview: item.backPreview,
          backPreview: item.frontPreview,
        };
      })
    );
  };

  const handleRemoveCard = (cardId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cardId));
  };

  const unpairedCount = items.filter((i) => i.isUnpaired).length;
  const pairedCount = items.length - unpairedCount;

  return (
    <div className="space-y-6">
      {/* Intake Selection Segmented Bar */}
      <div className="flex items-center gap-2 rounded-2xl bg-slate-900/90 p-1.5 border border-slate-800 backdrop-blur-xl">
        <button
          onClick={() => setIntakeMode("upload")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black transition-all ${
            intakeMode === "upload"
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <FolderPlus className="h-4 w-4" /> 📁 Upload Files (Drag & Drop)
        </button>

        <button
          onClick={() => setIntakeMode("camera")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black transition-all ${
            intakeMode === "camera"
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          }`}
        >
          <Camera className="h-4 w-4" /> 📷 Take Pictures (Camera / Phone QR)
        </button>
      </div>

      {/* MODE A: UPLOAD FILES */}
      {intakeMode === "upload" && (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-cyan-500/30 bg-slate-900/60 p-8 text-center backdrop-blur-xl transition-all duration-300 hover:border-cyan-400 hover:bg-slate-900/80 hover:shadow-2xl hover:shadow-cyan-500/10"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-cyan-500/20 blur-lg transition group-hover:bg-cyan-500/40"></div>
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-xl">
                <UploadCloud className="h-8 w-8 text-white animate-bounce" />
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-100">
                Drag & Drop Sports Card Images
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Batch upload paired images (e.g. <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300 font-mono">TCS-00000001-front.jpg</code> & <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300 font-mono">TCS-00000001-back.jpg</code>)
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-700 px-3 py-1 text-xs text-slate-300 font-medium">
                <ImageIcon className="h-3.5 w-3.5 text-cyan-400" /> Auto Prefix Pairing
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-700 px-3 py-1 text-xs text-slate-300 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> CDP Schema Enforced
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODE B: TAKE PICTURES (CAMERA & MOBILE QR COMPANION) */}
      {intakeMode === "camera" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-white">Continuous Camera Capture Flow</h3>
              <p className="text-xs text-slate-400">Snap cards continuously — auto-pairs photos into your staging queue.</p>
            </div>

            {/* Front Only vs Front & Back Mode Toggle */}
            <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                onClick={() => {
                  setCameraMode("front_and_back");
                  setCameraStep("front");
                  setTempFrontFile(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  cameraMode === "front_and_back"
                    ? "bg-cyan-500 text-slate-950 font-black"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Front & Back (Default)
              </button>

              <button
                onClick={() => {
                  setCameraMode("front_only");
                  setCameraStep("front");
                  setTempFrontFile(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  cameraMode === "front_only"
                    ? "bg-cyan-500 text-slate-950 font-black"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Front Only
              </button>
            </div>
          </div>

          {/* Action Trigger Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Desktop Web Camera Button */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                <Camera className="h-7 w-7 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">
                  {cameraStep === "front" ? "Take picture of FRONT" : "Take picture of BACK"}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  {cameraMode === "front_and_back"
                    ? cameraStep === "front"
                      ? "Snap front photo -> auto prompts for back photo"
                      : "Snap back photo -> auto pairs card into staging queue"
                    : "Snap front photo -> saves card immediately"}
                </p>
              </div>

              {cameraStep === "front" ? (
                <button
                  onClick={() => cameraFrontInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition active:scale-95"
                >
                  <Camera className="h-4 w-4" /> 📷 Take Picture of FRONT
                </button>
              ) : (
                <button
                  onClick={() => cameraBackInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-cyan-400 transition active:scale-95"
                >
                  <Camera className="h-4 w-4" /> 📷 Take Picture of BACK
                </button>
              )}

              <input
                ref={cameraFrontInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraSnapFront}
              />
              <input
                ref={cameraBackInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraSnapBack}
              />
            </div>

            {/* Mobile Phone QR Companion Button */}
            {onOpenQrScanner && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
                  <Smartphone className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">Use Phone Camera (QR Scanner)</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Scan a QR code on your phone to use your mobile camera for intake.
                  </p>
                </div>

                <button
                  onClick={onOpenQrScanner}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-indigo-500/20 transition active:scale-95"
                >
                  <Smartphone className="h-4 w-4" /> 📱 Launch QR Mobile Scanner
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Summary & Controls */}
      {items.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-200">
                Uploaded Cards: <span className="text-cyan-400 font-mono text-base">{items.length}</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {pairedCount} Paired
              </span>

              {unpairedCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-300 animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5" /> Unpaired Card ({unpairedCount})
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setItems([])}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-700 transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear All
              </button>

              <button
                onClick={onIdentifyBatch}
                disabled={isProcessing || items.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition active:scale-95 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Processing Batch...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" /> Run Vision Identification
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Cards Grid Preview & Pair Controls */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`relative rounded-xl border p-4 transition-all bg-slate-900/60 backdrop-blur-md ${
                item.isUnpaired
                  ? "border-amber-500/40 ring-1 ring-amber-500/20"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* Unpaired Card Badge */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cyan-400 truncate max-w-[140px]">
                    {item.prefix}
                  </span>
                  {item.isUnpaired ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      <AlertTriangle className="h-3 w-3" /> Unpaired Card
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Paired
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {item.frontPreview && item.backPreview && (
                    <button
                      onClick={() => handleSwapImages(item.id)}
                      title="Swap Front / Back"
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveCard(item.id)}
                    title="Remove Card"
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Front & Back Images */}
              <div className="grid grid-cols-2 gap-2 pt-3">
                {/* Front Image */}
                <div className="relative aspect-[3/4] rounded-lg bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden group">
                  {item.frontPreview ? (
                    <img
                      src={item.frontPreview}
                      alt="Front"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer p-2 text-center hover:bg-slate-900 transition w-full h-full">
                      <Plus className="h-5 w-5 text-slate-500 mb-1" />
                      <span className="text-[11px] font-medium text-slate-400">Add Front</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleAttachImage(item.id, 'front', e.target.files[0]);
                        }}
                      />
                    </label>
                  )}
                  <div className="absolute bottom-1 left-1 bg-slate-900/90 border border-slate-700 text-[9px] font-bold text-slate-300 px-1.5 py-0.5 rounded">
                    FRONT
                  </div>
                </div>

                {/* Back Image */}
                <div className="relative aspect-[3/4] rounded-lg bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden group">
                  {item.backPreview ? (
                    <img
                      src={item.backPreview}
                      alt="Back"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer p-2 text-center hover:bg-slate-900 transition w-full h-full">
                      <Plus className="h-5 w-5 text-slate-500 mb-1" />
                      <span className="text-[11px] font-medium text-amber-400">Add Back</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleAttachImage(item.id, 'back', e.target.files[0]);
                        }}
                      />
                    </label>
                  )}
                  <div className="absolute bottom-1 left-1 bg-slate-900/90 border border-slate-700 text-[9px] font-bold text-slate-300 px-1.5 py-0.5 rounded">
                    BACK
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  );
}
