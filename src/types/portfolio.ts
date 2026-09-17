import { SavedCollectionItem } from "./card";

export interface PortfolioSnapshot {
  id: string;
  timestamp: string; // ISO date string
  totalValue: number;
  cardCount: number;
  pricedCount: number;
  note?: string;
}

export type TimeframeOption = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export interface ChartDataPoint {
  timestamp: string;
  formattedDate: string;
  value: number;
}

export interface GainerFallerItem {
  card: SavedCollectionItem;
  currentValue: number;
  previousValue: number;
  deltaDollar: number;
  deltaPercent: number;
  direction: "up" | "down" | "flat";
}

export interface PortfolioPerformanceSummary {
  currentValue: number;
  startingValue: number;
  netChange: number;
  percentageChange: number;
  timeframeLabel: string;
  isPositive: boolean;
  topGainer?: GainerFallerItem;
  topFaller?: GainerFallerItem;
}
