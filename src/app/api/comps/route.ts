import { NextResponse } from "next/server";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getEbayAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID || "";
  const clientSecret = process.env.EBAY_CLIENT_SECRET || "";

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

  return cachedToken;
}

function getPercentile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export async function POST(req: Request) {
  try {
    const bodyData = await req.json();
    const { query, includeGraded, gradingCompany: companyInput, estimatedGradingFee: feeInput, rawMarketValue: rawInput } = bodyData;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const cleanQuery = query.trim();
    const gradingCompany = (companyInput || "PSA").toUpperCase();
    const estimatedGradingFee = parseFloat(feeInput || "19.00");
    const rawValOverride = rawInput && parseFloat(rawInput) > 0 ? parseFloat(rawInput) : undefined;
    console.log("--> Fetching raw eBay comps for query:", cleanQuery);

    const token = await getEbayAccessToken();

    // Ultra-smart multi-stage search query generator for eBay API
    const buildQueryStages = (raw: string): string[] => {
      const cleanNoSymbol = raw.replace(/#/g, "").replace(/\s+/g, " ").trim();
      const cleanNoYear = cleanNoSymbol.replace(/\b(202[0-9]|2030)\b/g, "").replace(/\s+/g, " ").trim();
      const noSport = cleanNoYear.replace(/\b(Basketball|Football|Baseball|Soccer|Hockey)\b/gi, "").replace(/\s+/g, " ").trim();

      const stages = [
        raw,
        cleanNoSymbol,
        cleanNoYear,
        noSport,
      ];

      return stages.filter((q, idx, self) => q.length > 0 && self.indexOf(q) === idx);
    };

    const queryVariations = buildQueryStages(cleanQuery);

    let rawItems: any[] = [];

    for (const qVar of queryVariations) {
      const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
      searchUrl.searchParams.set("q", qVar);
      searchUrl.searchParams.set("limit", "50");

      const ebayRes = await fetch(searchUrl.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      });

      if (ebayRes.ok) {
        const searchData = await ebayRes.json();
        const found = searchData.itemSummaries || [];
        if (found.length > 0) {
          rawItems = found;
          break;
        }
      }
    }

    const gradedRegex = /\b(PSA|BGS|SGC|CGC|GMA|TAG|HGA|BVG|GAI|KSA|SLAB|GRADED|GEM\s*MINT|MINT\s*10|PSA\s*\d+|BGS\s*\d+)\b/i;
    const lotRegex = /\b(LOT\s*OF|BUNDLE|PACK|BOX|CASE|SET|REPRINT|DIGITAL)\b/i;

    const sales: Array<{
      title: string;
      price: number;
      currency: string;
      imageUrl: string;
      itemWebUrl: string;
      isOutlier: boolean;
      outlierReason?: string;
    }> = [];

    for (const item of rawItems) {
      const title = item.title || "";
      const price = parseFloat(item.price?.value || "0");
      const currency = item.price?.currency || "USD";
      const imageUrl = item.image?.imageUrl || "";
      const itemWebUrl = item.itemWebUrl || "";

      if (price <= 0) continue;

      let isOutlier = false;
      let outlierReason: string | undefined = undefined;

      if (gradedRegex.test(title)) {
        isOutlier = true;
        outlierReason = "Graded Slab (PSA/BGS/SGC)";
      } else if (lotRegex.test(title)) {
        isOutlier = true;
        outlierReason = "Bulk Lot / Bundle";
      }

      sales.push({
        title,
        price,
        currency,
        imageUrl,
        itemWebUrl,
        isOutlier,
        outlierReason,
      });
    }

    const nonGradedSales = sales.filter((s) => !s.isOutlier);
    const validPrices = (nonGradedSales.length > 0 ? nonGradedSales : sales)
      .map((s) => s.price)
      .sort((a, b) => a - b);

    if (validPrices.length === 0) {
      return NextResponse.json({
        totalFound: 0,
        medianPrice: 0,
        estimatedMarketValue: 0,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        filteredMinPrice: 0,
        filteredMaxPrice: 0,
        outlierCount: sales.length,
        recentSales: sales,
      });
    }

    const medianPrice = getPercentile(validPrices, 0.5);
    const minPrice = validPrices[0] || 0;
    const maxRawCap = minPrice <= 5.0 ? Math.max(10.0, minPrice * 4.0) : Math.max(25.0, medianPrice * 2.5);

    const q1 = getPercentile(validPrices, 0.25);
    const q3 = getPercentile(validPrices, 0.75);
    const iqr = q3 - q1;
    const lowerBound = Math.max(0.5, q1 - 1.5 * iqr);

    let inlierPrices: number[] = [];
    let outliersCount = 0;

    sales.forEach((s) => {
      if (!s.isOutlier) {
        const isPriceOutlier =
          s.price < lowerBound ||
          s.price > maxRawCap;

        if (isPriceOutlier) {
          s.isOutlier = true;
          s.outlierReason = s.price > maxRawCap ? "Unrealistic Active Asking Price (Overpriced)" : "Low Price Outlier";
          outliersCount++;
        } else {
          inlierPrices.push(s.price);
        }
      } else {
        outliersCount++;
      }
    });

    if (inlierPrices.length === 0 && validPrices.length > 0) {
      inlierPrices = [validPrices[0]];
    }

    inlierPrices.sort((a, b) => a - b);
    const estMarketValue = getPercentile(inlierPrices, 0.5);
    const rawAvgPrice = inlierPrices.reduce((a, b) => a + b, 0) / inlierPrices.length;
    const rawVal = rawValOverride || parseFloat(estMarketValue.toFixed(2));

    let psa10Value: number | undefined = undefined;
    let psa9Value: number | undefined = undefined;
    let psa10Sales: any[] = [];
    let psa9Sales: any[] = [];
    let gradingAnalysis: any = undefined;

    const shouldIncludeGraded = includeGraded !== undefined ? Boolean(includeGraded) : true;

    if (shouldIncludeGraded) {
      try {
        const queryCleaned = cleanQuery
          .replace(/Parallel:\s*/gi, "")
          .replace(/Subset:\s*/gi, "")
          .replace(/\b(19\d\d|20\d\d)\s+\1-\d\d\b/gi, (match) => match.split(/\s+/)[1])
          .replace(/\bBase\b/gi, "")
          .replace(/#/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const isBaseCard = /\bBase\b/i.test(cleanQuery) || !/\b(Refractor|Prizm|Parallel|\/\d+)\b/i.test(cleanQuery);
        const parallelRegex = /\b(\d+\s*\/\s*\d+|\/\d+|Shimmer|Choice|Pandora|Scope|Camo|Black|Orange|Gold|Silver|Hyper|Velocity|Red|Blue|Green|Purple|Pink|Pulsar|Mosaic|Optic|Refractor|Disco|Ice|Wave|Sparkle|Cherry|Auto|Autograph|Patch|Jersey)\b/i;

        // 1. Live eBay PSA 10 Search
        const psa10Url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        psa10Url.searchParams.set("q", `${queryCleaned} ${gradingCompany} 10 -Lot -Pack -Bundle`);
        psa10Url.searchParams.set("limit", "30");

        const psa10Res = await fetch(psa10Url.toString(), {
          headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
        });

        if (psa10Res.ok) {
          const data10 = await psa10Res.json();
          const raw10 = data10.itemSummaries || [];
          const filtered10 = raw10.filter((i: any) => {
            const price = parseFloat(i.price?.value || "0");
            const title = i.title || "";
            return price > 0 && (!isBaseCard || !parallelRegex.test(title));
          });

          psa10Sales = filtered10.map((i: any) => ({
            title: i.title || "",
            price: parseFloat(i.price?.value || "0"),
            currency: i.price?.currency || "USD",
            imageUrl: i.image?.imageUrl || i.thumbnailImages?.[0]?.imageUrl || "",
            itemWebUrl: i.itemWebUrl || "",
            grade: `${gradingCompany} 10`,
          }));

          const valid10Prices = psa10Sales
            .map((s: any) => s.price)
            .sort((a: number, b: number) => a - b);

          if (valid10Prices.length > 0) {
            const median10 = getPercentile(valid10Prices, 0.5);
            if (median10 >= rawVal * 1.2) {
              psa10Value = parseFloat(median10.toFixed(2));
            }
          }
        }

        // 2. Live eBay PSA 9 Search
        const psa9Url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        psa9Url.searchParams.set("q", `${queryCleaned} ${gradingCompany} 9 -Lot -Pack -Bundle`);
        psa9Url.searchParams.set("limit", "30");

        const psa9Res = await fetch(psa9Url.toString(), {
          headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
        });

        if (psa9Res.ok) {
          const data9 = await psa9Res.json();
          const raw9 = data9.itemSummaries || [];
          const filtered9 = raw9.filter((i: any) => {
            const price = parseFloat(i.price?.value || "0");
            const title = i.title || "";
            return price > 0 && (!isBaseCard || !parallelRegex.test(title));
          });

          psa9Sales = filtered9.map((i: any) => ({
            title: i.title || "",
            price: parseFloat(i.price?.value || "0"),
            currency: i.price?.currency || "USD",
            imageUrl: i.image?.imageUrl || i.thumbnailImages?.[0]?.imageUrl || "",
            itemWebUrl: i.itemWebUrl || "",
            grade: `${gradingCompany} 9`,
          }));

          const valid9Prices = psa9Sales
            .map((s: any) => s.price)
            .sort((a: number, b: number) => a - b);

          if (valid9Prices.length > 0) {
            const median9 = getPercentile(valid9Prices, 0.5);
            if (median9 >= rawVal * 1.0) {
              psa9Value = parseFloat(median9.toFixed(2));
            }
          }
        }

        // 3. Intelligent Cross-Anchoring & Sanity Check
        if (psa10Value && psa9Value && psa10Value > psa9Value * 12) {
          psa10Value = undefined;
        }

        if (psa9Value && !psa10Value) {
          psa10Value = parseFloat((psa9Value * 2.8).toFixed(2));
        } else if (psa10Value && !psa9Value) {
          psa9Value = parseFloat((psa10Value * 0.40).toFixed(2));
        } else if (!psa10Value && !psa9Value) {
          const mult10 = rawVal <= 5.0 ? 3.5 : 2.8;
          const mult9 = rawVal <= 5.0 ? 1.8 : 1.4;
          psa10Value = parseFloat((rawVal * mult10).toFixed(2));
          psa9Value = parseFloat((rawVal * mult9).toFixed(2));
        }

        // 4. Strict Hierarchy Invariants: PSA 10 >= PSA 9 >= Raw
        let safePsa10 = psa10Value ?? parseFloat((rawVal * 2.8).toFixed(2));
        let safePsa9 = psa9Value ?? parseFloat((rawVal * 1.4).toFixed(2));

        if (safePsa9 >= safePsa10) {
          safePsa10 = parseFloat((safePsa9 * 2.5).toFixed(2));
        }
        if (safePsa9 < rawVal) {
          safePsa9 = parseFloat((rawVal * 1.15).toFixed(2));
        }
        if (safePsa10 < rawVal * 1.4) {
          safePsa10 = parseFloat((rawVal * 2.5).toFixed(2));
        }

        psa10Value = safePsa10;
        psa9Value = safePsa9;

        const totalInvestment = rawVal + estimatedGradingFee;
        const netProfitPSA10 = parseFloat((psa10Value - totalInvestment).toFixed(2));
        const netProfitPSA9 = parseFloat((psa9Value - totalInvestment).toFixed(2));
        const roiPSA10 = parseFloat(((netProfitPSA10 / totalInvestment) * 100).toFixed(1));
        const isRecommended = netProfitPSA10 >= 20.0 && roiPSA10 >= 25.0;

        gradingAnalysis = {
          psa10Value,
          psa9Value,
          gradingFee: estimatedGradingFee,
          netProfitPSA10,
          netProfitPSA9,
          roiPSA10,
          isRecommended,
          recommendationReason: isRecommended
            ? `🔥 High ROI: Est. Net Profit +$${netProfitPSA10.toFixed(2)} (${roiPSA10}% ROI) on ${gradingCompany} 10`
            : `Low ROI: Est. Net Profit $${netProfitPSA10.toFixed(2)} on ${gradingCompany} 10`,
          lastEvaluated: new Date().toISOString(),
          psa10Sales,
          psa9Sales,
        };
      } catch (gErr) {
        console.warn("Graded comps query warning:", gErr);
      }
    }

    return NextResponse.json({
      totalFound: sales.length,
      medianPrice: parseFloat(medianPrice.toFixed(2)),
      estimatedMarketValue: rawVal,
      averagePrice: parseFloat(rawAvgPrice.toFixed(2)),
      minPrice: validPrices[0] || 0,
      maxPrice: validPrices[validPrices.length - 1] || 0,
      filteredMinPrice: inlierPrices[0] || validPrices[0] || 0,
      filteredMaxPrice: inlierPrices[inlierPrices.length - 1] || validPrices[validPrices.length - 1] || 0,
      outlierCount: outliersCount,
      psa10Value,
      psa9Value,
      psa10Sales,
      psa9Sales,
      gradingAnalysis,
      recentSales: sales,
    });
  } catch (error: any) {
    console.error("=== EBAY COMPS API ERROR ===");
    console.error(error.stack || error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch eBay comps" },
      { status: 500 }
    );
  }
}
