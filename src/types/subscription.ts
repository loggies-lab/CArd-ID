export type SubscriptionTier = "free" | "starter" | "pro";

export type BillingInterval = "monthly" | "yearly";

export interface PaymentTransaction {
  id: string;
  userId: string;
  userEmail: string | null;
  tier: SubscriptionTier;
  amount: number;
  currency: string;
  interval: BillingInterval;
  status: "succeeded" | "pending" | "failed" | "refunded";
  timestamp: string;
  paymentMethod: string;
  customerName?: string;
}

export interface PlatformIncomeSummary {
  totalGrossRevenue: number;
  monthlyRecurringRevenue: number;
  annualRunRate: number;
  totalTransactions: number;
  totalUsers: number;
  totalSubscribers: number;
  starterSubscribers: number;
  proSubscribers: number;
  freeUsers: number;
  conversionRate: number;
}

export interface TierPlanConfig {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyEquivalentYearly: number;
  scansLimit: number; // 25 for free, 250 for starter, -1 / 9999 for pro
  features: string[];
  popular?: boolean;
}

export const TIER_PLANS: Record<SubscriptionTier, TierPlanConfig> = {
  free: {
    id: "free",
    name: "Free Hobbyist",
    tagline: "Essential AI card identification for casual collectors",
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyEquivalentYearly: 0,
    scansLimit: 25,
    features: [
      "25 AI Card Scans (Single & Batch)",
      "Basic eBay Market Sales Comps",
      "CDP Listing Title Generator",
      "Standard Collection Management",
      "Community Email Support",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter Collector",
    tagline: "For active collectors scaling their collection and sales",
    monthlyPrice: 9.99,
    yearlyPrice: 99.0,
    monthlyEquivalentYearly: 8.25,
    scansLimit: 250,
    popular: false,
    features: [
      "250 AI Card Scans / Month",
      "Real-Time eBay Sold & Active Comps",
      "Automated eBay Singles Pipeline ($4+ Filter)",
      "QR Code Mobile Companion Scanner",
      "Basic PSA 10 & 9 Market Value Estimation",
      "CSV Portfolio Export",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro Dealer & Arbitrageur",
    tagline: "Unlimited power for high-volume dealers, breakers & graders",
    monthlyPrice: 29.99,
    yearlyPrice: 279.0,
    monthlyEquivalentYearly: 23.25,
    scansLimit: 9999, // unlimited
    popular: true,
    features: [
      "Unlimited AI Card Scans / Month",
      "Deep PSA 10 & PSA 9 Live Comps with eBay Links",
      "Real-Time Grading ROI & Net Profit Arbitrage",
      "Priority Gemini 2.0 Flash Vision Pipeline",
      "Direct eBay & Shopify CSV Listing Exporter",
      "Safe Haven PSA 9 Floor Protection Analytics",
      "VIP 24/7 Priority Support",
    ],
  },
};
