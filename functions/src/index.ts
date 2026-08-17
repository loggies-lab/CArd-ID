import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI } from "@google/genai";

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const ebayClientId = defineSecret("EBAY_CLIENT_ID");
const ebayClientSecret = defineSecret("EBAY_CLIENT_SECRET");

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

export const identifyCard = onCall(
  { cors: true, secrets: [geminiApiKey] },
  async (request) => {
    const frontBase64 = request.data?.frontBase64;
    const backBase64 = request.data?.backBase64;
    const apiKeyOverride = request.data?.apiKeyOverride;

    const apiKey =
      apiKeyOverride ||
      geminiApiKey.value() ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY is missing on server environment variables."
      );
    }

    let front = frontBase64 || backBase64;
    let back = backBase64 || frontBase64;

    if (!front || !back) {
      throw new HttpsError(
        "invalid-argument",
        "At least one valid image (front or back) is required for card identification."
      );
    }

    const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(front);
    const backClean = cleanBase64(back);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const promptText = `You are an expert sports trading card cataloging AI strictly compliant with Card Dealer Pro (CDP) standards.
Identify the trading card from these front and back images with 100% precision.

Return ONLY a valid JSON object matching this schema:
{
  "cardFound": true,
  "confidenceScore": 0.98,
  "playerName": "Full Player / Athlete Name (e.g. Michael Jordan, Ken Griffey Jr.)",
  "subject": "Full Player / Athlete Name",
  "cardNumber": "Card Number (pure alphanumeric, no # symbol)",
  "subsetParallel": "Parallels / Refractor / Base",
  "team": "Team Name",
  "sport": "Sport Name (Baseball, Basketball, Football, etc.)",
  "year": 2024,
  "brand": "Topps / Panini / Upper Deck / Fleer / Donruss",
  "publisher": "Publisher / Brand Name",
  "setName": "Set Name",
  "isRookie": false,
  "isAutographed": false,
  "isMemorabilia": false,
  "isNumbered": false,
  "numberedTo": 99,
  "notes": "Any distinguishing features"
}`;

      let responseText = "";
      let primaryError = "";
      const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.5-flash"];

      for (const modelName of modelsToTry) {
        try {
          const res = await ai.models.generateContent({
            model: modelName,
            contents: [
              { text: promptText },
              { inlineData: { mimeType: "image/jpeg", data: frontClean } },
              { inlineData: { mimeType: "image/jpeg", data: backClean } },
            ],
            config: {
              responseMimeType: "application/json",
            },
          });
          if (res.text) {
            responseText = res.text;
            break;
          }
        } catch (mErr: any) {
          const errMsg = mErr.message || String(mErr);
          if (!primaryError || mErr.status === 429) {
            primaryError = errMsg;
          }
          console.warn(`Model ${modelName} failed:`, errMsg);
        }
      }

      if (!responseText) {
        throw new HttpsError("internal", primaryError || "Gemini Vision AI processing failed.");
      }

      let parsed = JSON.parse(responseText);
      const player = parsed.playerName || parsed.subject || parsed.player || "";
      const brand = parsed.brand || parsed.publisher || "";
      parsed.playerName = player;
      parsed.subject = player;
      parsed.brand = brand;
      parsed.publisher = brand;
      if (parsed.cardNumber) {
        parsed.cardNumber = String(parsed.cardNumber).replace(/#/g, "").trim();
      }
      return parsed;
    } catch (err: any) {
      console.error("identifyCard Cloud Function error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err.message || "Failed to identify card with Gemini Vision AI.");
    }
  }
);

export const getEbayComps = onRequest(
  { cors: true, secrets: [ebayClientId, ebayClientSecret] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      let query = req.body?.query || req.query?.query;
      if (typeof query !== "string" || !query.trim()) {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }

      query = query.trim();
      console.log("--> getEbayComps Cloud Function searching for raw comps:", query);

      const clientId = ebayClientId.value() || process.env.EBAY_CLIENT_ID || "";
      const clientSecret = ebayClientSecret.value() || process.env.EBAY_CLIENT_SECRET || "";

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
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

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`eBay OAuth Error: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      // Helper to generate cleaned fallback query variations
      const cleanSearchStr = (str: string) => {
        return str
          .replace(/#/g, "")
          .replace(/\b(202[4-9]|2030)\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
      };

      const queryVariations = [
        query,
        cleanSearchStr(query),
      ].filter((q, idx, self) => q.length > 0 && self.indexOf(q) === idx);

      let rawItems: any[] = [];

      for (const qVar of queryVariations) {
        const rawQuery = `${qVar} -PSA -BGS -SGC -CGC -Graded -Lot -Pack -Box -Digital`;
        const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        searchUrl.searchParams.set("q", rawQuery);
        searchUrl.searchParams.set("limit", "50");

        const searchRes = await fetch(searchUrl.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          },
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const found = searchData.itemSummaries || [];
          if (found.length > 0) {
            rawItems = found;
            break;
          }
        }
      }

      // Regex patterns for pre-filtering non-raw cards
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
        res.json({
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
        return;
      }

      // Statistical Outlier Elimination (IQR + Median Multiplier)
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

      const reqBodyData = req.body || {};
      const includeGraded = reqBodyData.includeGraded || req.query?.includeGraded || false;
      const gradingCompany = (reqBodyData.gradingCompany || req.query?.gradingCompany || "PSA").toUpperCase();
      const estimatedGradingFee = parseFloat(reqBodyData.estimatedGradingFee || "19.00");

      const rawValInput = reqBodyData.rawMarketValue || req.query?.rawMarketValue;
      const rawVal = rawValInput && parseFloat(rawValInput) > 0 ? parseFloat(rawValInput) : parseFloat(estMarketValue.toFixed(2));

      let psa10Value: number | undefined = undefined;
      let psa9Value: number | undefined = undefined;
      let gradingAnalysis: any = undefined;

      if (includeGraded) {
        try {
          const cleanQuery = query.replace(/\bBase\b/gi, "").replace(/#/g, "").trim();
          const isBaseCard = /\bBase\b/i.test(query) || !/\b(Refractor|Prizm|Parallel|\/\d+)\b/i.test(query);
          const parallelRegex = /\b(\d+\s*\/\s*\d+|\/\d+|Shimmer|Choice|Pandora|Scope|Camo|Black|Orange|Gold|Silver|Hyper|Velocity|Red|Blue|Green|Purple|Pink|Pulsar|Mosaic|Optic|Refractor|Disco|Ice|Wave|Sparkle|Cherry|Auto|Autograph|Patch|Jersey)\b/i;

          // 1. Live eBay PSA 10 Search
          const psa10Url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
          psa10Url.searchParams.set("q", `${cleanQuery} ${gradingCompany} 10 -Lot -Pack -Bundle`);
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
          psa9Url.searchParams.set("q", `${cleanQuery} ${gradingCompany} 9 -Lot -Pack -Bundle`);
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

      res.json({
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
    } catch (err: any) {
      console.error("getEbayComps Cloud Function error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch eBay sales comps." });
    }
  }
);
