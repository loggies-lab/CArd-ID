export interface CompSaleItem {
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  itemWebUrl?: string;
  grade?: string;
  isOutlier?: boolean;
  outlierReason?: string;
}

export type GradingTargetGrade = "psa9" | "psa10" | "balanced";
export type GradingRecommendationTier = "do_it" | "maybe" | "dont_do_it" | "unevaluated";

export interface GradingAnalysis {
  psa10Value?: number;
  psa9Value?: number;
  gradingFee?: number;
  netProfitPSA10?: number;
  netProfitPSA9?: number;
  roiPSA10?: number;
  roiPSA9?: number;
  isRecommended?: boolean;
  recommendationTier?: GradingRecommendationTier;
  recommendationReason?: string;
  lastEvaluated?: string;
  psa10Sales?: CompSaleItem[];
  psa9Sales?: CompSaleItem[];
}

export interface UserSettings {
  // 1. Grading Rules
  gradingFee: number; // default: 20.00
  gradingShippingAllocation: number; // default: 5.00
  minGradingProfit: number; // default: 50.00
  minGradingRoiPct: number; // default: 50 (%)
  targetCompany?: "PSA" | "BGS" | "SGC" | "CGC";
  targetGrade?: GradingTargetGrade;
  requirePsa9Profitability?: boolean;
  autoFlagCandidates?: boolean;

  // 2. Selling Fees & Supplies
  ebayFeePct: number; // default: 13.25 (%)
  ebayFixedFee: number; // default: 0.30 ($)
  standardEnvelopeCost: number; // default: 1.00 ($)

  // 3. Triage Cutoffs
  minEbayRawThreshold: number; // default: 4.00 ($)

  // Backward compatibility mirrors & aliases
  minRawThreshold?: number;
  estimatedGradingFee?: number;
  minNetProfitThreshold?: number;
  minRoiThreshold?: number;
}

export type UserGradingSettings = UserSettings;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  gradingFee: 20.0,
  gradingShippingAllocation: 5.0,
  minGradingProfit: 50.0,
  minGradingRoiPct: 50,
  minEbayRawThreshold: 4.0,
  ebayFeePct: 13.25,
  ebayFixedFee: 0.30,
  standardEnvelopeCost: 1.0,
  targetCompany: "PSA",
  targetGrade: "psa9",
  requirePsa9Profitability: true,
  autoFlagCandidates: true,
  minRawThreshold: 4.0,
  estimatedGradingFee: 25.0,
  minNetProfitThreshold: 50.0,
  minRoiThreshold: 50,
};

export function getTotalGradingCost(settings?: Partial<UserSettings>): number {
  if (!settings) return 25.0;
  if (settings.gradingFee !== undefined && settings.gradingShippingAllocation !== undefined) {
    return settings.gradingFee + settings.gradingShippingAllocation;
  }
  if (settings.gradingFee !== undefined) {
    return settings.gradingFee + 5.0;
  }
  if (settings.estimatedGradingFee !== undefined) {
    return settings.estimatedGradingFee;
  }
  return 25.0;
}

export interface CDPCardSchema {
  playerName: string;
  brand: string;
  setName: string;
  cardNumber: string;
  subsetParallel: string;
  team: string;
  sport: string;
  year: number;
  isRookie: boolean;
  isAutographed: boolean;
  isMemorabilia: boolean;
  isNumbered: boolean;
  numberedTo?: string;
  condition?: "Raw" | "Graded";
  gradingCompany?: "None" | "PSA" | "BGS" | "SGC" | "CGC" | string;
  grade?: string;
  location?: string;
  estimatedValue?: number;
  previousEstimatedValue?: number;
  priceChange?: number;
  priceChangePercentage?: number;
  valueLastUpdated?: string;
  lastPriceRefreshedAt?: string;
  gradingAnalysis?: GradingAnalysis;
  aiUsage?: AIUsageStats;
}

export interface AIUsageStats {
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp?: string;
}

export interface CardItem {
  id: string;
  prefix: string;
  sessionId?: string;
  batchId?: string;
  batchName?: string;
  frontFile: File | null;
  backFile: File | null;
  frontPreview?: string;
  backPreview?: string;
  isUnpaired: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  data?: CDPCardSchema;
  aiUsage?: AIUsageStats;
}

export interface SavedCollectionItem {
  id: string;
  prefix: string;
  batchId?: string;
  batchName?: string;
  frontPreview?: string;
  backPreview?: string;
  dateAdded: string;
  notes?: string;
  data: CDPCardSchema;
  aiUsage?: AIUsageStats;
}
