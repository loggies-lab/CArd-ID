import { NextResponse } from "next/server";
import { sanitizeCompQuery, stripFluffWords, generateWaterfallQueries } from "@/lib/compSanitizer";
import { cleanTitleSeasonYears, formatCardYear } from "@/lib/yearUtils";
import {
  extractSerialNumber,
  checkSerialNumberMatch,
  isPsaClickbait,
  isAuthenticGradedSlab,
  getPercentile,
  isLotOrBundle,
} from "@/lib/compFilter";
import type { CompSaleItem, DualStreamCompResponse, CDPCardSchema } from "@/types/card";

export const dynamic = "force-static";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Retrieves or returns cached eBay OAuth Application Access Token.
 * Cached in-memory with a 5-minute pre-expiration buffer.
 */
async function getEbayAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to obtain eBay token: ${errText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 300) * 1000;

  return cachedToken!;
}

/**
 * Builds the exact single-shot title search string:
 * {Year} {Brand} {SetName} {PlayerName} #{CardNumber} {ParallelVariation}
 *
 * Rules:
 * 1. If standard base card, omit the word "Base" (sellers don't list cards as "Base").
 * 2. Deduplicate Brand / SetName (e.g. "Panini" + "Panini Prizm" -> "Panini Prizm").
 * 3. Normalize accented characters in player name (e.g. "Dončić" -> "Doncic").
 * 4. Format card number with a single '#' (e.g. "#136").
 * 5. Append numbered denominator (e.g. "/99") if present and not already in parallel.
 */
function buildExactCompQuery(
  card: Partial<CDPCardSchema> | any,
  fallbackQuery?: string
): string {
  if (!card || Object.keys(card).length === 0) {
    return fallbackQuery ? sanitizeCompQuery(fallbackQuery) : "";
  }

  const rawYear = card.year ? formatCardYear(card.year, false) : "";
  const year = rawYear ? String(rawYear).trim() : "";

  let brand = card.brand ? stripFluffWords(String(card.brand)) : "";
  let setName = card.setName ? stripFluffWords(String(card.setName)) : "";

  let setDescriptor = setName;
  if (brand && !setName.toLowerCase().includes(brand.toLowerCase())) {
    setDescriptor = `${brand} ${setName}`.trim();
  }

  let playerName = card.playerName ? stripFluffWords(String(card.playerName)) : "";
  playerName = playerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  let cardNumber = "";
  if (card.cardNumber) {
    const cleanNum = String(card.cardNumber).replace(/^[#\s]+/, "").trim();
    if (cleanNum) cardNumber = `#${cleanNum}`;
  }

  let parallel = "";
  const rawParallel = (card.subsetParallel || "").trim();
  const isBase =
    !rawParallel ||
    /^(base|base\s*card|none|n\/a)$/i.test(rawParallel);

  if (!isBase) {
    let cleanParallel = stripFluffWords(rawParallel);
    // Explicitly omit the word "Base" if sellers or OCR tagged "Base Silver"
    cleanParallel = cleanParallel.replace(/\bbase\b/gi, "").replace(/\s+/g, " ").trim();
    parallel = cleanParallel;
  }

  if (card.numberedTo) {
    const cleanDenom = String(card.numberedTo).replace(/[^0-9]/g, "");
    if (cleanDenom && !parallel.includes(`/${cleanDenom}`) && !setDescriptor.includes(`/${cleanDenom}`)) {
      parallel = parallel ? `${parallel} /${cleanDenom}` : `/${cleanDenom}`;
    }
  }

  const parts = [year, setDescriptor, playerName, cardNumber, parallel].filter(Boolean);
  return cleanTitleSeasonYears(parts.join(" ").replace(/\s+/g, " ").trim());
}

/**
 * Single-Shot Targeted Search on eBay Browse API:
 * Executes ONCE per card with negative keyword sanitization.
 * Sub-second execution (~200ms) with zero waterfall queries.
 */
async function fetchSingleTargetedSearch(
  query: string,
  token: string
): Promise<{
  rawActiveItems: any[];
  finalQueryUsed: string;
}> {
  const NEGATIVE_KEYWORDS = "-lot -reprint -digital -rp -facsimile -breaks -pack -box -case";
  const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  searchUrl.searchParams.set("q", `${query} ${NEGATIVE_KEYWORDS}`.trim());
  searchUrl.searchParams.set("filter", "buyingOptions:{AUCTION|FIXED_PRICE}");
  searchUrl.searchParams.set("limit", "50");

  try {
    const ebayRes = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(3500),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    if (!ebayRes.ok) {
      return { rawActiveItems: [], finalQueryUsed: query };
    }

    const searchData = await ebayRes.json();
    return {
      rawActiveItems: searchData.itemSummaries || [],
      finalQueryUsed: query,
    };
  } catch (err) {
    console.warn("Single targeted search error or timeout:", err);
    return { rawActiveItems: [], finalQueryUsed: query };
  }
}

/**
 * Optional Completed / Sold Items Fetcher for Card Details Modal.
 * Only triggered if explicitly requested by the client (never on fast/bulk runs).
 */
async function fetchSoldCompsFromEbay(
  query: string,
  clientId: string,
  token: string
): Promise<CompSaleItem[]> {
  const soldItems: CompSaleItem[] = [];

  try {
    const findingUrl = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
    findingUrl.searchParams.set("OPERATION-NAME", "findCompletedItems");
    findingUrl.searchParams.set("SERVICE-VERSION", "1.13.0");
    findingUrl.searchParams.set("SECURITY-APPNAME", clientId);
    findingUrl.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
    findingUrl.searchParams.set("REST-PAYLOAD", "true");
    findingUrl.searchParams.set("keywords", query);
    findingUrl.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
    findingUrl.searchParams.set("itemFilter(0).value", "true");
    findingUrl.searchParams.set("paginationInput.entriesPerPage", "30");
    findingUrl.searchParams.set("sortOrder", "EndTimeNewest");

    const findingRes = await fetch(findingUrl.toString(), {
      signal: AbortSignal.timeout(2500),
      headers: {
        "X-EBAY-SOA-OPERATION-NAME": "findCompletedItems",
        "X-EBAY-SOA-SECURITY-APPNAME": clientId,
        "X-EBAY-SOA-RESPONSE-DATA-FORMAT": "JSON",
        "X-EBAY-SOA-SERVICE-VERSION": "1.13.0",
        "X-EBAY-SOA-GLOBAL-ID": "EBAY-US",
      },
    });

    if (findingRes.ok) {
      const data = await findingRes.json();
      const rawList = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
      for (const item of rawList) {
        const title = item.title?.[0] || "";
        const price = parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0");
        const currency = item.sellingStatus?.[0]?.currentPrice?.[0]?.["@currencyId"] || "USD";
        const imageUrl = item.galleryURL?.[0] || "";
        const itemWebUrl = item.viewItemURL?.[0] || "";
        const soldDate = item.listingInfo?.[0]?.endTime?.[0] || undefined;
        const buyingFormat: "FIXED_PRICE" | "AUCTION" =
          item.listingInfo?.[0]?.listingType?.[0] === "Chinese" ? "AUCTION" : "FIXED_PRICE";
        const bidCount = item.sellingStatus?.[0]?.bidCount?.[0]
          ? parseInt(item.sellingStatus[0].bidCount[0], 10)
          : undefined;

        if (price > 0 && title) {
          soldItems.push({
            title,
            price,
            currency,
            imageUrl,
            itemWebUrl,
            soldDate,
            saleType: "sold",
            buyingFormat,
            bidCount,
            isOutlier: false,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Finding API completed items query warning or timeout:", err);
  }

  return soldItems;
}

/**
 * Optional Graded Slabs Fetcher for Card Details Modal / Grading Tab.
 * Only triggered if explicitly requested by the client (never on fast/bulk runs).
 */
async function fetchGradedCompsUnified(
  queryCleaned: string,
  gradingCompany: string,
  token: string,
  targetDenominator: number | null,
  isTargetBase: boolean,
  cardObj: Partial<CDPCardSchema>
): Promise<{
  psa10Sales: CompSaleItem[];
  psa9Sales: CompSaleItem[];
  psa8Sales: CompSaleItem[];
  psa10Value?: number;
  psa9Value?: number;
  psa8Value?: number;
}> {
  const psa10Sales: CompSaleItem[] = [];
  const psa9Sales: CompSaleItem[] = [];
  const psa8Sales: CompSaleItem[] = [];
  let psa10Value: number | undefined = undefined;
  let psa9Value: number | undefined = undefined;
  let psa8Value: number | undefined = undefined;

  const baseExclusions = isTargetBase ? " -Refractor" : "";
  const gradedSearchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  gradedSearchUrl.searchParams.set("q", `${queryCleaned} ${gradingCompany} -Lot -Pack -Bundle${baseExclusions}`.trim());
  gradedSearchUrl.searchParams.set("filter", "buyingOptions:{AUCTION|FIXED_PRICE}");
  gradedSearchUrl.searchParams.set("limit", "50");

  try {
    const res = await fetch(gradedSearchUrl.toString(), {
      signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    });

    if (res.ok) {
      const data = await res.json();
      const items = data.itemSummaries || [];

      for (const item of items) {
        const title = item.title || "";
        const price = parseFloat(item.price?.value || item.currentBidPrice?.value || "0");
        if (price <= 0) continue;

        const is10 = isAuthenticGradedSlab(title, gradingCompany, "10");
        const is9 = isAuthenticGradedSlab(title, gradingCompany, "9");
        const is8 = isAuthenticGradedSlab(title, gradingCompany, "8");

        if (!is10 && !is9 && !is8) continue;

        const clickbait = isPsaClickbait(title);
        const serialCheck = checkSerialNumberMatch(title, targetDenominator, isTargetBase, cardObj);

        let isOutlier = false;
        let outlierReason: string | undefined = undefined;

        if (clickbait) {
          isOutlier = true;
          outlierReason = `Clickbait Raw Card (${gradingCompany} candidate/clickbait)`;
        } else if (serialCheck.isOutlier) {
          isOutlier = true;
          outlierReason = serialCheck.reason;
        }

        const buyingFormat: "FIXED_PRICE" | "AUCTION" = item.buyingOptions?.includes("AUCTION")
          ? "AUCTION"
          : "FIXED_PRICE";
        const bidCount: number | undefined = item.bidCount !== undefined ? Number(item.bidCount) : undefined;

        const compItem: CompSaleItem = {
          title,
          price,
          currency: item.price?.currency || item.currentBidPrice?.currency || "USD",
          imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "",
          itemWebUrl: item.itemWebUrl || "",
          buyingFormat,
          bidCount,
          isOutlier,
          outlierReason,
        };

        if (is10) psa10Sales.push({ ...compItem, grade: `${gradingCompany} 10` });
        else if (is9) psa9Sales.push({ ...compItem, grade: `${gradingCompany} 9` });
        else if (is8) psa8Sales.push({ ...compItem, grade: `${gradingCompany} 8` });
      }

      const valid10 = psa10Sales.filter((s) => !s.isOutlier).map((s) => s.price).sort((a, b) => a - b);
      if (valid10.length > 0) psa10Value = parseFloat(getPercentile(valid10, 0.5).toFixed(2));

      const valid9 = psa9Sales.filter((s) => !s.isOutlier).map((s) => s.price).sort((a, b) => a - b);
      if (valid9.length > 0) psa9Value = parseFloat(getPercentile(valid9, 0.5).toFixed(2));

      const valid8 = psa8Sales.filter((s) => !s.isOutlier).map((s) => s.price).sort((a, b) => a - b);
      if (valid8.length > 0) psa8Value = parseFloat(getPercentile(valid8, 0.5).toFixed(2));
    }
  } catch (err) {
    console.warn("Unified graded comps query warning:", err);
  }

  return { psa10Sales, psa9Sales, psa8Sales, psa10Value, psa9Value, psa8Value };
}

export async function POST(req: Request) {
  try {
    const bodyData = await req.json();
    const {
      query,
      cardData,
      includeGraded,
      includeSold,
      fast,
      gradingCompany: companyInput,
      estimatedGradingFee: feeInput,
    } = bodyData;

    if ((!query || typeof query !== "string") && !cardData) {
      return NextResponse.json({ error: "Query or cardData is required" }, { status: 400 });
    }

    const cardObj: Partial<CDPCardSchema> = cardData || {};
    const exactQuery = buildExactCompQuery(cardObj, query);

    // If query could not be constructed, return needs_review immediately
    if (!exactQuery) {
      return NextResponse.json({
        status: "needs_review",
        price: 0,
        compsFound: [],
        totalFound: 0,
        medianPrice: 0,
        estimatedMarketValue: 0,
        rawEstimatedValue: 0,
        activeListings: [],
        soldComps: [],
      });
    }

    const targetDenominator = extractSerialNumber(cardObj) || extractSerialNumber(exactQuery);
    const isTargetBase =
      !targetDenominator &&
      (!cardObj.subsetParallel ||
        cardObj.subsetParallel.trim().toLowerCase() === "base" ||
        cardObj.subsetParallel.trim().toLowerCase() === "base card");

    const isTargetGraded =
      cardObj.condition === "Graded" ||
      Boolean(cardObj.grade && cardObj.grade !== "Raw" && cardObj.grade !== "None");
    const targetGrade = cardObj.grade ? String(cardObj.grade).replace(/[^0-9]/g, "") : "";
    const targetCompany = (cardObj.gradingCompany || "PSA").toUpperCase();

    const clientId = process.env.EBAY_CLIENT_ID || "";
    const clientSecret = process.env.EBAY_CLIENT_SECRET || "";
    const token = await getEbayAccessToken(clientId, clientSecret);

    // 1. Single-Shot Exact Search (sub-second Browse API)
    const activeSearchPromise = fetchSingleTargetedSearch(exactQuery, token);

    // Optional deep-dive for Card Details Modal (only if explicitly requested and NOT in fast mode)
    const shouldIncludeSold = Boolean(includeSold) && !fast;
    const shouldIncludeGraded = Boolean(includeGraded) && !fast;

    const [activeResult, rawSoldComps, gradedResult] = await Promise.all([
      activeSearchPromise,
      shouldIncludeSold ? fetchSoldCompsFromEbay(exactQuery, clientId, token) : Promise.resolve([]),
      shouldIncludeGraded
        ? fetchGradedCompsUnified(
            exactQuery,
            (companyInput || "PSA").toUpperCase(),
            token,
            targetDenominator,
            isTargetBase,
            cardObj
          )
        : Promise.resolve({
            psa10Sales: [],
            psa9Sales: [],
            psa8Sales: [],
            psa10Value: undefined,
            psa9Value: undefined,
            psa8Value: undefined,
          }),
    ]);

    const { rawActiveItems, finalQueryUsed } = activeResult;
    const gradedRegex =
      /\b(PSA|BGS|SGC|CGC|GMA|TAG|HGA|BVG|GAI|KSA|SLAB|GRADED|GEM\s*MINT|MINT\s*10|PSA\s*\d+|BGS\s*\d+)\b/i;

    const candidateItems: CompSaleItem[] = [];
    const allActiveListings: CompSaleItem[] = [];

    // 2. Filter listings: exclude lots/bundles, slab/raw condition mismatch, serial number mismatch
    for (const item of rawActiveItems) {
      const title = item.title || "";
      const price = parseFloat(item.price?.value || item.currentBidPrice?.value || "0");
      const currency = item.price?.currency || item.currentBidPrice?.currency || "USD";
      const imageUrl = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "";
      const itemWebUrl = item.itemWebUrl || "";
      const buyingFormat: "FIXED_PRICE" | "AUCTION" = item.buyingOptions?.includes("AUCTION")
        ? "AUCTION"
        : "FIXED_PRICE";
      const bidCount: number | undefined = item.bidCount !== undefined ? Number(item.bidCount) : undefined;

      if (price <= 0) continue;

      let isOutlier = false;
      let outlierReason: string | undefined = undefined;

      if (isLotOrBundle(title)) {
        isOutlier = true;
        outlierReason = "Bulk Lot / Bundle / Break";
      } else if (!isTargetGraded && gradedRegex.test(title)) {
        isOutlier = true;
        outlierReason = "Graded Slab (PSA/BGS/SGC)";
      } else if (
        isTargetGraded &&
        !isAuthenticGradedSlab(title, targetCompany, targetGrade === "9" ? "9" : targetGrade === "8" ? "8" : "10")
      ) {
        isOutlier = true;
        outlierReason = `Raw Card or Wrong Grade (Expected ${targetCompany} ${targetGrade || "Slab"})`;
      } else {
        const serialCheck = checkSerialNumberMatch(title, targetDenominator, isTargetBase, cardObj);
        if (serialCheck.isOutlier) {
          isOutlier = true;
          outlierReason = serialCheck.reason;
        }
      }

      const compItem: CompSaleItem = {
        title,
        price,
        currency,
        imageUrl,
        itemWebUrl,
        buyingFormat,
        bidCount,
        saleType: "active",
        isOutlier,
        outlierReason,
      };

      allActiveListings.push(compItem);
      if (!isOutlier) {
        candidateItems.push(compItem);
      }
    }

    let activeCandidates = candidateItems;
    let successfulQuery = finalQueryUsed;
    let matchedStage: DualStreamCompResponse["matchedStage"] = "strict";
    let autoAdjusted = false;
    let adjustmentReason: string | undefined = undefined;
    let adjustedFields: string[] = [];

    // Progressive Title Auto-Adjustment:
    // If the exact search pulled 0 comps, automatically drop components & retry:
    // 1. Drop Card Number
    // 2. Drop Serial Number
    // 3. Shorten / Core Parallel
    // 4. Season Start Year
    // 5. Drop Release Year
    // 6. Drop Set Name
    // 7. Auto-Adjust All (Player + Core Descriptors)
    // 8. Base Card Fallback (Estimate baseline value if parallel has 0 comps)
    let isBaseFallbackMatched = false;

    if (activeCandidates.length === 0) {
      const waterfall = generateWaterfallQueries(cardObj.playerName ? cardObj : (exactQuery || query));
      const autoAdjustAllTier = waterfall.autoAdjustTiers?.find((t) => t.id === "auto_adjust_all");

      const cascadeTiers: Array<{
        stage: DualStreamCompResponse["matchedStage"];
        query: string | undefined;
        dropped: string[];
        reason: string;
        isBaseFallback?: boolean;
      }> = [
        {
          stage: "drop_number",
          query: waterfall.dropNumberQuery,
          dropped: ["cardNumber"],
          reason: "Dropped card number",
        },
        {
          stage: "drop_serial",
          query: waterfall.dropSerialQuery,
          dropped: ["cardNumber", "serialNumber"],
          reason: "Dropped card # and serial #",
        },
        {
          stage: "short_parallel",
          query: waterfall.shortParallelQuery,
          dropped: ["cardNumber", "serialNumber"],
          reason: "Simplified parallel name",
        },
        {
          stage: "season_year",
          query: waterfall.seasonBaseYearQuery,
          dropped: ["seasonYear"],
          reason: "Normalized multi-year season",
        },
        {
          stage: "drop_year",
          query: waterfall.dropYearQuery,
          dropped: ["cardNumber", "serialNumber", "year"],
          reason: "Dropped year, card #, and serial #",
        },
        {
          stage: "drop_set_name",
          query: waterfall.dropSetNameQuery,
          dropped: ["cardNumber", "serialNumber", "year", "setName"],
          reason: "Dropped set name",
        },
        {
          stage: "auto_adjusted",
          query: autoAdjustAllTier?.query || waterfall.playerParallelQuery || waterfall.vagueQuery,
          dropped: ["cardNumber", "serialNumber", "year", "setName"],
          reason: "Auto-adjusted all (Player + Core keywords)",
        },
        {
          stage: "base_fallback",
          query: waterfall.baseFallbackQuery,
          dropped: ["cardNumber", "serialNumber", "parallel"],
          reason: "Base card sales comp estimate (parallel comps unavailable)",
          isBaseFallback: true,
        },
      ];

      const seenQueries = new Set<string>([exactQuery]);

      for (let i = 0; i < cascadeTiers.length; i++) {
        const tier = cascadeTiers[i];
        if (!tier.query || seenQueries.has(tier.query) || tier.query.trim().length < 3) continue;
        seenQueries.add(tier.query);

        const fallbackResult = await fetchSingleTargetedSearch(tier.query, token);
        if (!fallbackResult.rawActiveItems || fallbackResult.rawActiveItems.length === 0) continue;

        const tierCandidates: CompSaleItem[] = [];
        const droppedYear = tier.dropped.includes("year");
        const droppedSerial = tier.dropped.includes("serialNumber");
        const isBaseTier = !!tier.isBaseFallback;

        for (const item of fallbackResult.rawActiveItems) {
          const itemTitle = item.title || "";
          const price = parseFloat(item.price?.value || item.currentBidPrice?.value || "0");
          const currency = item.price?.currency || item.currentBidPrice?.currency || "USD";
          const imageUrl = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || "";
          const itemWebUrl = item.itemWebUrl || "";
          const buyingFormat: "FIXED_PRICE" | "AUCTION" = item.buyingOptions?.includes("AUCTION")
            ? "AUCTION"
            : "FIXED_PRICE";
          const bidCount: number | undefined = item.bidCount !== undefined ? Number(item.bidCount) : undefined;

          if (price <= 0) continue;

          let isOutlier = false;
          let outlierReason: string | undefined = undefined;

          if (isLotOrBundle(itemTitle)) {
            isOutlier = true;
            outlierReason = "Bulk Lot / Bundle / Break";
          } else if (!isTargetGraded && gradedRegex.test(itemTitle)) {
            isOutlier = true;
            outlierReason = "Graded Slab (PSA/BGS/SGC)";
          } else {
            // Relax serial and year constraints if dropped or in base fallback tier
            const effectiveDenom = (droppedSerial || isBaseTier) ? null : targetDenominator;
            const effectiveCardObj = droppedYear ? { ...cardObj, year: undefined } : cardObj;
            const serialCheck = checkSerialNumberMatch(
              itemTitle,
              effectiveDenom,
              (isTargetBase && !droppedSerial) || isBaseTier,
              effectiveCardObj
            );
            if (serialCheck.isOutlier) {
              isOutlier = true;
              outlierReason = serialCheck.reason;
            }
          }

          const compItem: CompSaleItem = {
            title: itemTitle,
            price,
            currency,
            imageUrl,
            itemWebUrl,
            buyingFormat,
            bidCount,
            saleType: "active",
            isOutlier,
            outlierReason,
          };

          allActiveListings.push(compItem);
          if (!isOutlier) {
            tierCandidates.push(compItem);
          }
        }

        if (tierCandidates.length > 0) {
          activeCandidates = tierCandidates;
          successfulQuery = tier.query;
          matchedStage = tier.stage;
          autoAdjusted = true;
          adjustmentReason = tier.reason;
          adjustedFields = tier.dropped;
          if (tier.isBaseFallback) {
            isBaseFallbackMatched = true;
          }
          break; // Found matching comps, stop cascade!
        }
      }
    }

    // 3. Best Offer / Outlier Protection & 1.5x IQR Trimmed Median
    const validPrices = activeCandidates.map((c) => c.price).sort((a, b) => a - b);
    let inlierItems: CompSaleItem[] = [];
    let finalMedianPrice = 0;

    if (validPrices.length > 0) {
      const initialMedian = getPercentile(validPrices, 0.5);
      const lowestBIN =
        activeCandidates
          .filter((c) => c.buyingFormat === "FIXED_PRICE")
          .map((c) => c.price)
          .sort((a, b) => a - b)[0] || validPrices[0];

      // Best Offer Protection: Exclude fixed-price asking prices inflated behind accepted offers
      const maxAllowedAsking = Math.max(15.0, initialMedian * 2.5, lowestBIN * 3.0);

      const boundedCandidates = activeCandidates.filter((c) => {
        if (c.buyingFormat === "FIXED_PRICE" && c.price > maxAllowedAsking) {
          c.isOutlier = true;
          c.outlierReason = "Best Offer Accepted / High Asking Price Outlier";
          return false;
        }
        return true;
      });

      const boundedPrices = boundedCandidates.map((c) => c.price).sort((a, b) => a - b);

      if (boundedPrices.length >= 4) {
        const q1 = getPercentile(boundedPrices, 0.25);
        const q3 = getPercentile(boundedPrices, 0.75);
        const iqr = q3 - q1;
        const lowerBound = Math.max(0.5, q1 - 1.5 * iqr);
        const upperBound = q3 + 1.5 * iqr;

        inlierItems = boundedCandidates.filter((c) => {
          if (c.price < lowerBound || c.price > upperBound) {
            c.isOutlier = true;
            c.outlierReason =
              c.price > upperBound ? "High Price Outlier (IQR 1.5x)" : "Low Price Outlier (IQR 1.5x)";
            return false;
          }
          return true;
        });
      } else {
        // 1 to 3 listings: filter if max is extreme (> 3.5x min)
        if (boundedPrices.length > 1 && boundedPrices[boundedPrices.length - 1] > boundedPrices[0] * 3.5) {
          inlierItems = boundedCandidates.filter((c) => c.price <= boundedPrices[0] * 3.5);
        } else {
          inlierItems = boundedCandidates;
        }
      }

      const inlierPrices = inlierItems.map((c) => c.price);
      if (inlierPrices.length > 0) {
        finalMedianPrice = parseFloat(getPercentile(inlierPrices, 0.5).toFixed(2));
      }
    }

    const hasInliers = inlierItems.length > 0 && finalMedianPrice > 0;
    const status: "success" | "needs_review" = hasInliers ? "success" : "needs_review";

    // 4. Return deterministic response contract + backward compatibility mirrors
    const responsePayload: DualStreamCompResponse = {
      status,
      price: hasInliers ? finalMedianPrice : 0,
      compsFound: inlierItems,
      soldComps: rawSoldComps,
      activeListings: allActiveListings,
      valuation: {
        estimatedValue: hasInliers ? finalMedianPrice : 0,
        confidenceTier: inlierItems.length >= 5 ? "HIGH" : inlierItems.length >= 2 ? "MEDIUM" : "LOW",
        confidenceReason: hasInliers
          ? `Calculated from ${inlierItems.length} verified inlier active listings via 1.5x IQR trimmed median.`
          : "Insufficient market comps found for deterministic valuation.",
        lowestActivePrice: inlierItems[0]?.price || 0,
        soldCount30Days: rawSoldComps.length,
      },
      psaAnalysis: {
        psa10Value: gradedResult.psa10Value,
        psa9Value: gradedResult.psa9Value,
        psa8Value: gradedResult.psa8Value,
        psa10Sales: gradedResult.psa10Sales,
        psa9Sales: gradedResult.psa9Sales,
        psa8Sales: gradedResult.psa8Sales,
      },

      // Backward-compatible mirrors
      totalFound: inlierItems.length,
      medianPrice: hasInliers ? finalMedianPrice : 0,
      estimatedMarketValue: hasInliers ? finalMedianPrice : 0,
      rawEstimatedValue: hasInliers ? finalMedianPrice : 0,
      compIsBaseEstimate: isBaseFallbackMatched,
      autoAdjusted,
      adjustedQueryUsed: autoAdjusted ? successfulQuery : undefined,
      adjustedFields: autoAdjusted ? adjustedFields : undefined,
      adjustmentReason: autoAdjusted ? adjustmentReason : undefined,
      matchedStage: autoAdjusted ? matchedStage : (hasInliers ? "strict" : "none"),
      sanitizedQuery: successfulQuery,
      averagePrice: hasInliers
        ? parseFloat((inlierItems.reduce((sum, item) => sum + item.price, 0) / inlierItems.length).toFixed(2))
        : 0,
      minPrice: inlierItems[0]?.price || 0,
      maxPrice: inlierItems[inlierItems.length - 1]?.price || 0,
      filteredMinPrice: inlierItems[0]?.price || 0,
      filteredMaxPrice: inlierItems[inlierItems.length - 1]?.price || 0,
      outlierCount: allActiveListings.filter((i) => i.isOutlier).length,
      recentSales: rawSoldComps.length > 0 ? rawSoldComps : inlierItems,
      psa10Value: gradedResult.psa10Value,
      psa9Value: gradedResult.psa9Value,
      psa8Value: gradedResult.psa8Value,
      psa10Sales: gradedResult.psa10Sales,
      psa9Sales: gradedResult.psa9Sales,
      psa8Sales: gradedResult.psa8Sales,
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("=== EBAY COMPS API ERROR ===", error.message || error);
    return NextResponse.json(
      {
        status: "needs_review",
        price: 0,
        compsFound: [],
        error: error.message || "Failed to fetch eBay comps",
        totalFound: 0,
        medianPrice: 0,
        estimatedMarketValue: 0,
        rawEstimatedValue: 0,
        activeListings: [],
        soldComps: [],
      },
      { status: 200 }
    );
  }
}
