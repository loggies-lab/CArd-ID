import { NextResponse } from "next/server";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getEbayAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env.local");
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

// Statistical calculation helper for Percentiles (Q1, Median, Q3)
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

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    console.log("--> Fetching eBay sold comps for query:", query);

    const token = await getEbayAccessToken();

    const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", "15");

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
    const items = searchData.itemSummaries || [];

    if (items.length === 0) {
      return NextResponse.json({
        totalFound: 0,
        medianPrice: 0,
        estimatedMarketValue: 0,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        filteredMinPrice: 0,
        filteredMaxPrice: 0,
        outlierCount: 0,
        recentSales: [],
      });
    }

    const sales = items.map((item: any) => ({
      title: item.title,
      price: parseFloat(item.price?.value || "0"),
      currency: item.price?.currency || "USD",
      imageUrl: item.image?.imageUrl || "",
      itemWebUrl: item.itemWebUrl || "",
    }));

    const validPrices = sales
      .map((s: any) => s.price)
      .filter((p: number) => p > 0)
      .sort((a: number, b: number) => a - b);

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
        outlierCount: 0,
        recentSales: sales,
      });
    }

    // 1. Median Price (Outlier-Immune Middle Value)
    const medianPrice = getPercentile(validPrices, 0.5);

    // 2. Interquartile Range (IQR) Outlier Filtering (1.5x IQR Rule)
    const q1 = getPercentile(validPrices, 0.25);
    const q3 = getPercentile(validPrices, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    // Filter out extreme prices (e.g. $36.00 signed card when base is $1-$2)
    const filteredPrices = validPrices.filter((p: number) => p >= lowerBound && p <= upperBound);
    const outliersCount = validPrices.length - filteredPrices.length;

    // 3. Estimated Fair Market Value (Trimmed Mean)
    const estMarketValue =
      filteredPrices.length > 0
        ? filteredPrices.reduce((a: number, b: number) => a + b, 0) / filteredPrices.length
        : medianPrice;

    // Raw Arithmetic Average
    const rawAvgPrice = validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length;

    // Mark individual sales as outliers if price falls outside normal bounds
    const annotatedSales = sales.map((sale: any) => ({
      ...sale,
      isOutlier: sale.price < lowerBound || sale.price > upperBound,
    }));

    return NextResponse.json({
      totalFound: sales.length,
      medianPrice: parseFloat(medianPrice.toFixed(2)),
      estimatedMarketValue: parseFloat(estMarketValue.toFixed(2)),
      averagePrice: parseFloat(rawAvgPrice.toFixed(2)),
      minPrice: validPrices[0] || 0,
      maxPrice: validPrices[validPrices.length - 1] || 0,
      filteredMinPrice: filteredPrices[0] || validPrices[0] || 0,
      filteredMaxPrice: filteredPrices[filteredPrices.length - 1] || validPrices[validPrices.length - 1] || 0,
      outlierCount: outliersCount,
      recentSales: annotatedSales,
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
