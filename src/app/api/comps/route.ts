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
    searchUrl.searchParams.set("limit", "10");

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
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
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

    const validPrices = sales.map((s: any) => s.price).filter((p: number) => p > 0);

    const avgPrice = validPrices.length > 0 
      ? validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length 
      : 0;

    return NextResponse.json({
      totalFound: sales.length,
      averagePrice: parseFloat(avgPrice.toFixed(2)),
      minPrice: validPrices.length > 0 ? Math.min(...validPrices) : 0,
      maxPrice: validPrices.length > 0 ? Math.max(...validPrices) : 0,
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
