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

    // Raw Card Search: Append negative terms to exclude graded slabs & bulk lots
    const rawSearchQuery = `${cleanQuery} -PSA -BGS -SGC -CGC -Graded -Lot -Pack -Box -Digital`;
    const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    searchUrl.searchParams.set("q", rawSearchQuery);
    searchUrl.searchParams.set("limit", "50");

    const ebayRes = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    if (!ebayRes.ok) {
      const errorData = await ebayRes.text();
      console.error("eBay API Error:", errorData);
      throw new Error(`eBay API error: ${ebayRes.statusText}`);
    }

    const searchData = await ebayRes.json();
    const rawItems = searchData.itemSummaries || [];

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
    let gradingAnalysis: any = undefined;

    if (includeGraded) {
      try {
        const queryCleaned = cleanQuery.replace(/\bBase\b/gi, "").replace(/#/g, "").trim();
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
          const valid10Prices = raw10
            .map((i: any) => ({ title: i.title || "", price: parseFloat(i.price?.value || "0") }))
            .filter((s: any) => s.price > 0 && (!isBaseCard || !parallelRegex.test(s.title)))
            .map((s: any) => s.price)
            .sort((a: number, b: number) => a - b);

          if (valid10Prices.length > 0) {
            const median10 = getPercentile(valid10Prices, 0.5);
            if (median10 >= rawVal * 2.0 && median10 <= Math.max(100, rawVal * 70)) {
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
          const valid9Prices = raw9
            .map((i: any) => ({ title: i.title || "", price: parseFloat(i.price?.value || "0") }))
            .filter((s: any) => s.price > 0 && (!isBaseCard || !parallelRegex.test(s.title)))
            .map((s: any) => s.price)
            .sort((a: number, b: number) => a - b);

          if (valid9Prices.length > 0) {
            const median9 = getPercentile(valid9Prices, 0.5);
            if (median9 >= rawVal * 1.1 && median9 <= Math.max(50, rawVal * 25)) {
              psa9Value = parseFloat(median9.toFixed(2));
            }
          }
        }

        // 3. Fallback Multipliers aligned with PSA Market Price Guide
        if (!psa10Value) {
          const psa10Multiplier = rawVal <= 3.0 ? 45.0 : (gradingCompany === "PSA" ? 11.72 : 8.2);
          psa10Value = parseFloat((rawVal * psa10Multiplier).toFixed(2));
        }

        if (!psa9Value) {
          const psa9Multiplier = rawVal <= 3.0 ? 12.0 : (gradingCompany === "PSA" ? 3.41 : 2.8);
          psa9Value = parseFloat((rawVal * psa9Multiplier).toFixed(2));
        }

        const netProfitPSA10 = parseFloat((psa10Value - (rawVal + estimatedGradingFee)).toFixed(2));
        const netProfitPSA9 = parseFloat((psa9Value - (rawVal + estimatedGradingFee)).toFixed(2));
        const roiPSA10 = parseFloat(((netProfitPSA10 / (rawVal + estimatedGradingFee)) * 100).toFixed(1));
        const isRecommended = netProfitPSA10 >= 15.0;

        gradingAnalysis = {
          psa10Value,
          psa9Value,
          gradingFee: estimatedGradingFee,
          netProfitPSA10,
          netProfitPSA9,
          roiPSA10,
          isRecommended,
          recommendationReason: isRecommended
            ? `🔥 High ROI: Est. Net Profit +$${netProfitPSA10.toFixed(2)} on ${gradingCompany} 10`
            : `Low ROI: Net Profit +$${netProfitPSA10.toFixed(2)} on ${gradingCompany} 10`,
          lastEvaluated: new Date().toISOString(),
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
