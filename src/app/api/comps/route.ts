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
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const cleanQuery = query.trim();
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
    const q1 = getPercentile(validPrices, 0.25);
    const q3 = getPercentile(validPrices, 0.75);
    const iqr = q3 - q1;
    const lowerBound = Math.max(0.5, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    let inlierPrices: number[] = [];
    let outliersCount = 0;

    sales.forEach((s) => {
      if (!s.isOutlier) {
        const isPriceOutlier =
          s.price < lowerBound ||
          s.price > upperBound ||
          (medianPrice > 5 && s.price > 3.0 * medianPrice);

        if (isPriceOutlier) {
          s.isOutlier = true;
          s.outlierReason = s.price > upperBound ? "High Price Outlier" : "Low Price Outlier";
          outliersCount++;
        } else {
          inlierPrices.push(s.price);
        }
      } else {
        outliersCount++;
      }
    });

    if (inlierPrices.length === 0) {
      inlierPrices = validPrices;
    }

    const estMarketValue = inlierPrices.reduce((a, b) => a + b, 0) / inlierPrices.length;
    const rawAvgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;

    return NextResponse.json({
      totalFound: sales.length,
      medianPrice: parseFloat(medianPrice.toFixed(2)),
      estimatedMarketValue: parseFloat(estMarketValue.toFixed(2)),
      averagePrice: parseFloat(rawAvgPrice.toFixed(2)),
      minPrice: validPrices[0] || 0,
      maxPrice: validPrices[validPrices.length - 1] || 0,
      filteredMinPrice: inlierPrices[0] || validPrices[0] || 0,
      filteredMaxPrice: inlierPrices[inlierPrices.length - 1] || validPrices[validPrices.length - 1] || 0,
      outlierCount: outliersCount,
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
