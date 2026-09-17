import { UserSettings, DEFAULT_USER_SETTINGS, getTotalGradingCost } from "@/types/card";
import { updateUserGradingSettings } from "@/lib/userProfile";

export { DEFAULT_USER_SETTINGS, getTotalGradingCost };

const STORAGE_KEY_V2 = "CARD_ID_USER_SETTINGS_V2";
const STORAGE_KEY_LEGACY = "CARD_ID_GRADING_SETTINGS";

/**
 * Loads user settings with fallback hierarchy:
 * 1. Cloud Firestore User Profile Settings (if authenticated)
 * 2. Browser LocalStorage (if previously customized)
 * 3. Factory Default Configuration
 */
export function loadUserSettings(userProfileGradingSettings?: any): UserSettings {
  if (userProfileGradingSettings && typeof userProfileGradingSettings === "object") {
    return {
      ...DEFAULT_USER_SETTINGS,
      ...userProfileGradingSettings,
      gradingFee: userProfileGradingSettings.gradingFee ?? DEFAULT_USER_SETTINGS.gradingFee,
      gradingShippingAllocation:
        userProfileGradingSettings.gradingShippingAllocation ?? DEFAULT_USER_SETTINGS.gradingShippingAllocation,
      minGradingProfit:
        userProfileGradingSettings.minGradingProfit ??
        userProfileGradingSettings.minNetProfitThreshold ??
        DEFAULT_USER_SETTINGS.minGradingProfit,
      minGradingRoiPct:
        userProfileGradingSettings.minGradingRoiPct ??
        userProfileGradingSettings.minRoiThreshold ??
        DEFAULT_USER_SETTINGS.minGradingRoiPct,
      minEbayRawThreshold:
        userProfileGradingSettings.minEbayRawThreshold ??
        userProfileGradingSettings.minRawThreshold ??
        DEFAULT_USER_SETTINGS.minEbayRawThreshold,
      ebayFeePct: userProfileGradingSettings.ebayFeePct ?? DEFAULT_USER_SETTINGS.ebayFeePct,
      ebayFixedFee: userProfileGradingSettings.ebayFixedFee ?? DEFAULT_USER_SETTINGS.ebayFixedFee,
      standardEnvelopeCost:
        userProfileGradingSettings.standardEnvelopeCost ?? DEFAULT_USER_SETTINGS.standardEnvelopeCost,
    };
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_V2) || localStorage.getItem(STORAGE_KEY_LEGACY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_USER_SETTINGS,
          ...parsed,
          gradingFee:
            parsed.gradingFee ??
            (parsed.estimatedGradingFee
              ? Math.max(0, parsed.estimatedGradingFee - (parsed.gradingShippingAllocation ?? 5))
              : DEFAULT_USER_SETTINGS.gradingFee),
          gradingShippingAllocation: parsed.gradingShippingAllocation ?? DEFAULT_USER_SETTINGS.gradingShippingAllocation,
          minGradingProfit:
            parsed.minGradingProfit ?? parsed.minNetProfitThreshold ?? DEFAULT_USER_SETTINGS.minGradingProfit,
          minGradingRoiPct: parsed.minGradingRoiPct ?? parsed.minRoiThreshold ?? DEFAULT_USER_SETTINGS.minGradingRoiPct,
          minEbayRawThreshold:
            parsed.minEbayRawThreshold ?? parsed.minRawThreshold ?? DEFAULT_USER_SETTINGS.minEbayRawThreshold,
          ebayFeePct: parsed.ebayFeePct ?? DEFAULT_USER_SETTINGS.ebayFeePct,
          ebayFixedFee: parsed.ebayFixedFee ?? DEFAULT_USER_SETTINGS.ebayFixedFee,
          standardEnvelopeCost: parsed.standardEnvelopeCost ?? DEFAULT_USER_SETTINGS.standardEnvelopeCost,
        };
      }
    } catch (e) {
      console.warn("Failed to load stored user settings from localStorage, falling back to defaults:", e);
    }
  }

  return { ...DEFAULT_USER_SETTINGS };
}

/**
 * Persists user settings to LocalStorage and Firestore (if uid is provided).
 */
export function persistUserSettings(newSettings: UserSettings, uid?: string): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(newSettings));
      localStorage.setItem(STORAGE_KEY_LEGACY, JSON.stringify(newSettings));
    } catch (e) {
      console.warn("Failed to write user settings to localStorage:", e);
    }
  }

  if (uid) {
    updateUserGradingSettings(uid, newSettings).catch((err) => {
      console.warn("Failed to update user settings in Cloud Firestore profile:", err);
    });
  }
}

/**
 * Restores factory defaults and updates storage immediately.
 */
export function restoreFactoryDefaults(uid?: string): UserSettings {
  const factory = { ...DEFAULT_USER_SETTINGS };
  persistUserSettings(factory, uid);
  return factory;
}

/**
 * Calculates eBay net proceeds amount given a raw or graded sales price.
 */
export function calculateEbayNetProceeds(salePrice: number, settings?: Partial<UserSettings>): number {
  const feePct = settings?.ebayFeePct ?? DEFAULT_USER_SETTINGS.ebayFeePct;
  const fixedFee = settings?.ebayFixedFee ?? DEFAULT_USER_SETTINGS.ebayFixedFee;
  const shippingSupply = settings?.standardEnvelopeCost ?? DEFAULT_USER_SETTINGS.standardEnvelopeCost;
  const platformFee = (salePrice * feePct) / 100;
  const totalDeductions = platformFee + fixedFee + shippingSupply;
  return parseFloat(Math.max(0, salePrice - totalDeductions).toFixed(2));
}

/**
 * Calculates detailed eBay fee breakdown and net margin metrics.
 */
export function calculateEbayFeeBreakdown(salePrice: number, settings?: Partial<UserSettings>) {
  const feePct = settings?.ebayFeePct ?? DEFAULT_USER_SETTINGS.ebayFeePct;
  const fixedFee = settings?.ebayFixedFee ?? DEFAULT_USER_SETTINGS.ebayFixedFee;
  const shippingSupply = settings?.standardEnvelopeCost ?? DEFAULT_USER_SETTINGS.standardEnvelopeCost;
  const platformFee = parseFloat(((salePrice * feePct) / 100).toFixed(2));
  const totalDeductions = parseFloat((platformFee + fixedFee + shippingSupply).toFixed(2));
  const netProceeds = parseFloat(Math.max(0, salePrice - totalDeductions).toFixed(2));
  const netMarginPct = salePrice > 0 ? parseFloat(((netProceeds / salePrice) * 100).toFixed(1)) : 0;

  return {
    feePct,
    platformFee,
    fixedFee,
    shippingSupply,
    totalDeductions,
    netProceeds,
    netMarginPct,
  };
}

/**
 * Dynamically computes Grading ROI using the active settings.
 */
export function calculateGradingRoi(rawVal: number, gradedVal: number, settings?: Partial<UserSettings>) {
  const totalGradingCost = getTotalGradingCost(settings);
  const minProfit = settings?.minGradingProfit ?? settings?.minNetProfitThreshold ?? DEFAULT_USER_SETTINGS.minGradingProfit;
  const minRoi = settings?.minGradingRoiPct ?? settings?.minRoiThreshold ?? DEFAULT_USER_SETTINGS.minGradingRoiPct;
  const totalBreakeven = parseFloat((rawVal + totalGradingCost).toFixed(2));
  const netProfit = parseFloat((gradedVal - totalBreakeven).toFixed(2));
  const roiPct = totalBreakeven > 0 ? parseFloat(((netProfit / totalBreakeven) * 100).toFixed(1)) : 0;
  const qualifiesDoIt = netProfit >= minProfit && roiPct >= minRoi;

  return {
    totalGradingCost,
    totalBreakeven,
    netProfit,
    roiPct,
    qualifiesDoIt,
  };
}
