"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PortfolioSnapshot,
  ChartDataPoint,
  TimeframeOption,
} from "@/types/portfolio";
import {
  buildSynthesizedTimeline,
  filterSnapshotsForTimeframe,
  recordPortfolioSnapshot,
} from "@/lib/portfolioHistory";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Zap,
} from "lucide-react";

interface PortfolioChartProps {
  totalValue: number;
  cardCount: number;
  pricedCount: number;
  snapshots: PortfolioSnapshot[];
  onRefreshPrices?: () => Promise<void> | void;
  onSimulatePriceUpdate?: () => void;
  isRefreshing?: boolean;
}

export function PortfolioChart({
  totalValue,
  cardCount,
  pricedCount,
  snapshots,
  onRefreshPrices,
  onSimulatePriceUpdate,
  isRefreshing = false,
}: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("1M");
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  const chartHeight = 240;

  // Responsive chart width listener
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Construct continuous timeline
  const fullTimeline = useMemo(() => {
    return buildSynthesizedTimeline(totalValue, cardCount, snapshots);
  }, [totalValue, cardCount, snapshots]);

  // Filter data points for selected timeframe
  const dataPoints: ChartDataPoint[] = useMemo(() => {
    return filterSnapshotsForTimeframe(fullTimeline, timeframe, totalValue);
  }, [fullTimeline, timeframe, totalValue]);

  // Calculate baseline and net change for active timeframe
  const startingValue = useMemo(() => {
    if (dataPoints.length === 0) return totalValue;
    return dataPoints[0].value;
  }, [dataPoints, totalValue]);

  // Active display value (hovered scrub point or current total)
  const displayValue = hoveredPoint ? hoveredPoint.value : totalValue;
  const netDelta = displayValue - startingValue;
  const percentDelta =
    startingValue > 0 ? (netDelta / startingValue) * 100 : 0;
  const isPositive = netDelta >= 0;

  // SVG Coordinates calculation with Catmull-Rom / Bezier smoothing
  const { pathD, areaD, pointsWithCoords, minVal, maxVal } = useMemo(() => {
    if (dataPoints.length === 0) {
      return {
        pathD: "",
        areaD: "",
        pointsWithCoords: [],
        minVal: 0,
        maxVal: 100,
      };
    }

    const values = dataPoints.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Add 8% top and bottom padding for aesthetic headroom
    const range = rawMax - rawMin || 1;
    const minVal = Math.max(0, rawMin - range * 0.08);
    const maxVal = rawMax + range * 0.08;

    const paddingX = 12;
    const paddingY = 24;
    const availableW = chartWidth - paddingX * 2;
    const availableH = chartHeight - paddingY * 2;

    const points = dataPoints.map((pt, i) => {
      const x =
        paddingX + (i / Math.max(1, dataPoints.length - 1)) * availableW;
      const normalizedY = (pt.value - minVal) / (maxVal - minVal || 1);
      const y = paddingY + (1 - normalizedY) * availableH;
      return { ...pt, x, y };
    });

    if (points.length === 1) {
      const p = points[0];
      return {
        pathD: `M ${paddingX} ${p.y} L ${chartWidth - paddingX} ${p.y}`,
        areaD: `M ${paddingX} ${p.y} L ${chartWidth - paddingX} ${p.y} L ${chartWidth - paddingX} ${chartHeight} L ${paddingX} ${chartHeight} Z`,
        pointsWithCoords: points,
        minVal,
        maxVal,
      };
    }

    // Build smooth cubic bezier curve
    let dStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const prev = points[i - 1] || curr;
      const nextNext = points[i + 2] || next;

      // Tension factor
      const tension = 0.2;
      const cp1x = curr.x + (next.x - prev.x) * tension;
      const cp1y = curr.y + (next.y - prev.y) * tension;
      const cp2x = next.x - (nextNext.x - curr.x) * tension;
      const cp2y = next.y - (nextNext.y - curr.y) * tension;

      dStr += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }

    const last = points[points.length - 1];
    const first = points[0];
    const areaStr = `${dStr} L ${last.x.toFixed(1)} ${chartHeight} L ${first.x.toFixed(1)} ${chartHeight} Z`;

    return {
      pathD: dStr,
      areaD: areaStr,
      pointsWithCoords: points,
      minVal,
      maxVal,
    };
  }, [dataPoints, chartWidth, chartHeight]);

  // Handle cursor scrubbing across the SVG line
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pointsWithCoords.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Find nearest point
    let closest = pointsWithCoords[0];
    let minDiff = Infinity;

    for (const pt of pointsWithCoords) {
      const diff = Math.abs(pt.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }

    setHoveredPoint(closest);
    setHoverPosition({ x: closest.x, y: closest.y });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoverPosition(null);
  };

  const timeframeLabels: Record<TimeframeOption, string> = {
    "1D": "Today",
    "1W": "Past Week",
    "1M": "Past Month",
    "3M": "Past 3 Months",
    "1Y": "Past Year",
    ALL: "All Time",
  };

  const strokeColor = isPositive ? "#10B981" : "#F43F5E"; // Emerald vs Crimson
  const gradientId = isPositive ? "greenAreaGrad" : "redAreaGrad";

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 backdrop-blur-xl shadow-2xl transition-all"
    >
      {/* Background Ambient Glow matching trendline */}
      <div
        className={`absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
          isPositive ? "bg-emerald-500/10" : "bg-rose-500/10"
        }`}
      ></div>

      {/* Header Section: Large Robinhood Balance & Delta */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
              Portfolio Market Value
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {pricedCount} / {cardCount} Cards Priced
            </span>
          </div>

          {/* Big Portfolio Price */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white transition-all">
              ${displayValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>

          {/* Live Dynamic Delta */}
          <div className="flex items-center gap-2 font-mono text-xs sm:text-sm font-extrabold flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border ${
                isPositive
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-sm shadow-emerald-500/10"
                  : "bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-sm shadow-rose-500/10"
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              <span>
                {isPositive ? "+" : ""}${Math.abs(netDelta).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span>({isPositive ? "+" : ""}{percentDelta.toFixed(2)}%)</span>
            </span>

            <span className="text-slate-400 font-medium">
              {hoveredPoint ? (
                <span className="text-slate-200">
                  at <strong className="text-white">{hoveredPoint.formattedDate}</strong>
                </span>
              ) : (
                timeframeLabels[timeframe]
              )}
            </span>
          </div>
        </div>

        {/* Right Actions: Refresh Market Comps & Simulator */}
        <div className="flex items-center gap-2 flex-wrap">
          {onSimulatePriceUpdate && (
            <button
              onClick={onSimulatePriceUpdate}
              title="Simulate card price fluctuations to test gainers and fallers"
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 text-xs font-mono font-bold text-indigo-300 transition active:scale-95"
            >
              <Zap className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Simulate Market Shift</span>
              <span className="sm:hidden">Simulate</span>
            </button>
          )}

          {onRefreshPrices && (
            <button
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-mono font-bold text-white shadow-md shadow-cyan-500/20 transition active:scale-95"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{isRefreshing ? "Refreshing Comps..." : "Refresh Prices"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Chart Canvas & Interactive Scrubber SVG */}
      <div className="relative mt-4 select-none">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="greenAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#10B981" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="redAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#F43F5E" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Area Fill */}
          {areaD && (
            <path
              d={areaD}
              fill={`url(#${gradientId})`}
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Glowing Stroke Line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Scrubber Vertical Guideline & Glowing Hover Dot */}
          {hoverPosition && (
            <>
              {/* Vertical Guide */}
              <line
                x1={hoverPosition.x}
                y1={0}
                x2={hoverPosition.x}
                y2={chartHeight}
                stroke="#64748B"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                className="pointer-events-none opacity-80"
              />

              {/* Pulsing Outer Ring */}
              <circle
                cx={hoverPosition.x}
                cy={hoverPosition.y}
                r="7"
                fill={strokeColor}
                opacity="0.3"
                className="animate-ping pointer-events-none"
              />

              {/* Solid Core Dot */}
              <circle
                cx={hoverPosition.x}
                cy={hoverPosition.y}
                r="4.5"
                fill="#0F172A"
                stroke={strokeColor}
                strokeWidth="2.5"
                className="pointer-events-none shadow-lg"
              />
            </>
          )}
        </svg>

        {/* Hover Tooltip Card */}
        {hoveredPoint && hoverPosition && (
          <div
            className="absolute pointer-events-none z-20 transform -translate-x-1/2 -translate-y-full mb-3 px-2.5 py-1 rounded-xl bg-slate-950/95 border border-slate-700 text-xs font-mono shadow-xl backdrop-blur-md"
            style={{
              left: Math.max(50, Math.min(chartWidth - 50, hoverPosition.x)),
              top: Math.max(25, hoverPosition.y - 12),
            }}
          >
            <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
              {hoveredPoint.formattedDate}
            </div>
            <div className="font-black text-white whitespace-nowrap">
              ${hoveredPoint.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls: Timeframe Selector Buttons */}
      <div className="relative z-10 mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-slate-800 shadow-inner">
          {(["1D", "1W", "1M", "3M", "1Y", "ALL"] as TimeframeOption[]).map(
            (tf) => {
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => {
                    setTimeframe(tf);
                    setHoveredPoint(null);
                    setHoverPosition(null);
                  }}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-xl transition-all ${
                    active
                      ? isPositive
                        ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30"
                        : "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {tf}
                </button>
              );
            }
          )}
        </div>

        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Interactive Scrubber: Drag along curve to inspect valuations</span>
        </div>
      </div>
    </div>
  );
}
