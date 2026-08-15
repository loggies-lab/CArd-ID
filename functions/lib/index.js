"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEbayComps = exports.identifyCard = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const genai_1 = require("@google/genai");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const ebayClientId = (0, params_1.defineSecret)("EBAY_CLIENT_ID");
const ebayClientSecret = (0, params_1.defineSecret)("EBAY_CLIENT_SECRET");
function getPercentile(arr, q) {
    if (arr.length === 0)
        return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
}
exports.identifyCard = (0, https_1.onCall)({ cors: true, secrets: [geminiApiKey] }, async (request) => {
    const { frontBase64, backBase64, apiKeyOverride } = request.data || {};
    const apiKey = apiKeyOverride ||
        geminiApiKey.value() ||
        process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "GEMINI_API_KEY is missing on server environment variables.");
    }
    if (!frontBase64 || !backBase64) {
        throw new https_1.HttpsError("invalid-argument", "Both frontBase64 and backBase64 image strings are required.");
    }
    const cleanBase64 = (str) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(frontBase64);
    const backClean = cleanBase64(backBase64);
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey });
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
            }
            catch (mErr) {
                const errMsg = mErr.message || String(mErr);
                if (!primaryError || mErr.status === 429) {
                    primaryError = errMsg;
                }
                console.warn(`Model ${modelName} failed:`, errMsg);
            }
        }
        if (!responseText) {
            throw new https_1.HttpsError("internal", primaryError || "Gemini Vision AI processing failed.");
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
    }
    catch (err) {
        console.error("identifyCard Cloud Function error:", err);
        throw new https_1.HttpsError("internal", err.message || "Failed to identify card with Gemini Vision AI.");
    }
});
exports.getEbayComps = (0, https_1.onRequest)({ cors: true, secrets: [ebayClientId, ebayClientSecret] }, async (req, res) => {
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
        // Raw card query: Append negative keywords to exclude slabs and bulk lots
        const rawQuery = `${query} -PSA -BGS -SGC -CGC -Graded -Lot -Pack -Box -Digital`;
        const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        searchUrl.searchParams.set("q", rawQuery);
        searchUrl.searchParams.set("limit", "50");
        const searchRes = await fetch(searchUrl.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            },
        });
        if (!searchRes.ok) {
            const errText = await searchRes.text();
            throw new Error(`eBay Search API Error: ${errText}`);
        }
        const searchData = await searchRes.json();
        const rawItems = searchData.itemSummaries || [];
        // Regex patterns for pre-filtering non-raw cards
        const gradedRegex = /\b(PSA|BGS|SGC|CGC|GMA|TAG|HGA|BVG|GAI|KSA|SLAB|GRADED|GEM\s*MINT|MINT\s*10|PSA\s*\d+|BGS\s*\d+)\b/i;
        const lotRegex = /\b(LOT\s*OF|BUNDLE|PACK|BOX|CASE|SET|REPRINT|DIGITAL)\b/i;
        const sales = [];
        for (const item of rawItems) {
            const title = item.title || "";
            const price = parseFloat(item.price?.value || "0");
            const currency = item.price?.currency || "USD";
            const imageUrl = item.image?.imageUrl || "";
            const itemWebUrl = item.itemWebUrl || "";
            if (price <= 0)
                continue;
            let isOutlier = false;
            let outlierReason = undefined;
            if (gradedRegex.test(title)) {
                isOutlier = true;
                outlierReason = "Graded Slab (PSA/BGS/SGC)";
            }
            else if (lotRegex.test(title)) {
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
        const q1 = getPercentile(validPrices, 0.25);
        const q3 = getPercentile(validPrices, 0.75);
        const iqr = q3 - q1;
        const lowerBound = Math.max(0.5, q1 - 1.5 * iqr);
        const upperBound = q3 + 1.5 * iqr;
        let inlierPrices = [];
        let outliersCount = 0;
        sales.forEach((s) => {
            if (!s.isOutlier) {
                const isPriceOutlier = s.price < lowerBound ||
                    s.price > upperBound ||
                    (medianPrice > 5 && s.price > 3.0 * medianPrice);
                if (isPriceOutlier) {
                    s.isOutlier = true;
                    s.outlierReason = s.price > upperBound ? "High Price Outlier" : "Low Price Outlier";
                    outliersCount++;
                }
                else {
                    inlierPrices.push(s.price);
                }
            }
            else {
                outliersCount++;
            }
        });
        if (inlierPrices.length === 0) {
            inlierPrices = validPrices;
        }
        const estMarketValue = inlierPrices.reduce((a, b) => a + b, 0) / inlierPrices.length;
        const rawAvgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
        res.json({
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
    }
    catch (err) {
        console.error("getEbayComps Cloud Function error:", err);
        res.status(500).json({ error: err.message || "Failed to fetch eBay sales comps." });
    }
});
//# sourceMappingURL=index.js.map