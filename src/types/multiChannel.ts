import type { GradingAnalysis, AIUsageStats, TriageStatus } from "./card";

export type SalesChannel = "EBAY" | "CARDID_MARKETPLACE";

export type ChannelListingStatus =
  | "DRAFT"
  | "PENDING"
  | "ACTIVE"
  | "ENDED"
  | "SOLD"
  | "ERROR";

export interface ChannelListingEntity {
  channel: SalesChannel;
  status: ChannelListingStatus;
  listingId?: string;
  listingUrl?: string;
  price?: number;
  currency?: string;
  listedAt?: string;
  scheduledTime?: string;
  endedAt?: string;
  listingType?: "AUCTION" | "FIXED_PRICE";
  templateId?: string;
  templateName?: string;
  sku?: string;
  title?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  // Backward compatibility convenience aliases
  ebayItemId?: string;
  ebayListingUrl?: string;
}

export type ChannelListingMap = Partial<Record<SalesChannel, ChannelListingEntity>>;

export interface CoreCardEntity {
  playerName: string;
  brand: string;
  setName: string;
  cardNumber: string;
  subsetParallel: string;
  team: string;
  sport: string;
  year: number | string;
  isRookie: boolean;
  isAutographed: boolean;
  isMemorabilia: boolean;
  isNumbered: boolean;
  numberedTo?: string;
  condition?: "Raw" | "Graded";
  gradingCompany?: "None" | "PSA" | "BGS" | "SGC" | "CGC" | string;
  grade?: string;
  certNumber?: string;
  location?: string;
  notes?: string;
  estimatedValue?: number;
  previousEstimatedValue?: number;
  purchasePrice?: number;
  priceChange?: number;
  priceChangePercentage?: number;
  valueLastUpdated?: string;
  lastPriceRefreshedAt?: string;
  lastCompDate?: string;
  gradingAnalysis?: GradingAnalysis;
  aiUsage?: AIUsageStats;
  triageStatus?: TriageStatus;
  isParallelOrColored?: boolean;
  detectedParallelType?: string;
  suspectedNumbered?: boolean;
  isPossibleNumbered?: boolean;
  serialVerified?: boolean;
  compIsBaseEstimate?: boolean;
  autoAdjusted?: boolean;
  matchedStage?: string;
  adjustedFields?: string[];
  rawEstimatedValue?: number;
  compStatus?: "success" | "needs_review" | "error";
  selectedChannel?: "EBAY" | "GRADE" | "BINS" | "BULK";
}

/**
 * Normalizes listings from an array or map into a keyed dictionary
 */
export function normalizeListingsMap(
  listings?: ChannelListingMap | ChannelListingEntity[] | null
): ChannelListingMap {
  if (!listings) return {};
  if (Array.isArray(listings)) {
    const map: ChannelListingMap = {};
    for (const item of listings) {
      if (item && item.channel) {
        map[item.channel] = item;
      }
    }
    return map;
  }
  return { ...listings };
}

/**
 * Normalizes listings into an array of ChannelListingEntity
 */
export function normalizeListingsArray(
  listings?: ChannelListingMap | ChannelListingEntity[] | null
): ChannelListingEntity[] {
  if (!listings) return [];
  if (Array.isArray(listings)) {
    return listings.filter(Boolean);
  }
  return Object.values(listings).filter(Boolean) as ChannelListingEntity[];
}

/**
 * Backward-compatible helper to extract the active or draft eBay listing from a card or its data payload.
 * Checks both modern multi-channel listings (map/array) and legacy flat schema fields.
 */
export function getEbayListing(card: any): ChannelListingEntity | null {
  if (!card) return null;

  // 1. Check card.listings (map or array)
  const listings = card.listings || card.data?.listings;
  if (listings) {
    if (Array.isArray(listings)) {
      const found = listings.find((l) => l && (l.channel === "EBAY" || l.channel === "ebay"));
      if (found) return found;
    } else if (typeof listings === "object") {
      if (listings.EBAY) return listings.EBAY;
      if (listings.ebay) return listings.ebay;
    }
  }

  // 2. Backward compatibility fallback: check legacy fields on card.data or card
  const data = card.data || card;
  const legacyStatus = data.ebayListingStatus || card.ebayListingStatus;
  const legacyItemId = data.ebayItemId || card.ebayItemId;
  const legacyUrl = data.ebayListingUrl || card.ebayListingUrl;

  if ((legacyStatus && legacyStatus !== "UNLISTED") || legacyItemId || legacyUrl) {
    let status: ChannelListingStatus = "DRAFT";
    if (legacyStatus === "ACTIVE") status = "ACTIVE";
    else if (legacyStatus === "SCHEDULED") status = "PENDING";
    else if (legacyStatus === "SOLD") status = "SOLD";
    else if (legacyStatus === "DRAFT") status = "DRAFT";
    else if (legacyStatus === "ERROR") status = "ERROR";

    return {
      channel: "EBAY",
      status,
      listingId: legacyItemId,
      listingUrl: legacyUrl,
      price: data.ebayListingPrice ?? card.ebayListingPrice,
      listedAt: data.ebayListedAt || card.ebayListedAt,
      listingType: data.ebayListingType || card.ebayListingType,
      templateId: data.ebayTemplateId || card.ebayTemplateId,
      ebayItemId: legacyItemId,
      ebayListingUrl: legacyUrl,
    };
  }

  return null;
}

/**
 * Backward-compatible helper to extract the native CardID Marketplace listing from a card or its data payload.
 */
export function getMarketplaceListing(card: any): ChannelListingEntity | null {
  if (!card) return null;

  const listings = card.listings || card.data?.listings;
  if (listings) {
    if (Array.isArray(listings)) {
      const found = listings.find(
        (l) => l && (l.channel === "CARDID_MARKETPLACE" || l.channel === "cardid_marketplace")
      );
      if (found) return found;
    } else if (typeof listings === "object") {
      if (listings.CARDID_MARKETPLACE) return listings.CARDID_MARKETPLACE;
      if (listings.cardid_marketplace) return listings.cardid_marketplace;
    }
  }

  return null;
}
