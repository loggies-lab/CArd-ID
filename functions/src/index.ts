import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI, Type } from "@google/genai";

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

function normalizeSport(
  rawSport: string = "",
  playerName: string = "",
  brand: string = "",
  setName: string = ""
): string {
  const s = (rawSport || "").toLowerCase().trim();
  const context = `${s} ${playerName.toLowerCase()} ${brand.toLowerCase()} ${setName.toLowerCase()}`;

  // Pokemon TCG
  if (
    s.includes("pokemon") ||
    s.includes("pokémon") ||
    s.includes("pocket monster") ||
    context.includes("pokemon") ||
    context.includes("pokémon") ||
    context.includes("pikachu") ||
    context.includes("charizard") ||
    context.includes("mewtwo") ||
    context.includes("eevee") ||
    context.includes("blastoise") ||
    context.includes("venusaur") ||
    context.includes("scarlet & violet") ||
    context.includes("sword & shield") ||
    context.includes("crown zenith") ||
    context.includes("paldean fates") ||
    context.includes("prismatic evolutions") ||
    (context.includes("151") && (context.includes("nintendo") || context.includes("creatures") || context.includes("game freak")))
  ) {
    return "Pokemon";
  }

  // One Piece Card Game
  if (
    s.includes("one piece") ||
    s.includes("onepiece") ||
    context.includes("one piece") ||
    context.includes("onepiece") ||
    context.includes("luffy") ||
    context.includes("roronoa zoro") ||
    context.includes("straw hat") ||
    context.includes("romance dawn") ||
    context.includes("paramount war") ||
    context.includes("awakening of the new era") ||
    context.includes("wings of the captain") ||
    context.includes("500 years in the future") ||
    context.includes("two legends") ||
    /\bop0[1-9]\b/.test(context) ||
    /\bop-0[1-9]\b/.test(context)
  ) {
    return "One Piece";
  }

  // Soccer / Association Football
  if (
    s.includes("soccer") ||
    s.includes("futbol") ||
    s.includes("fútbol") ||
    s.includes("football club") ||
    context.includes("premier league") ||
    context.includes("champions league") ||
    context.includes("la liga") ||
    context.includes("serie a") ||
    context.includes("bundesliga") ||
    context.includes("mls") ||
    context.includes("fifa") ||
    context.includes("uefa") ||
    context.includes("world cup") ||
    context.includes("lionel messi") ||
    context.includes("cristiano ronaldo") ||
    context.includes("kylian mbappe") ||
    context.includes("erling haaland")
  ) {
    return "Soccer";
  }

  // Hockey
  if (
    s.includes("hockey") ||
    s.includes("nhl") ||
    context.includes("nhl") ||
    context.includes("stanley cup") ||
    context.includes("connor mcdavid") ||
    context.includes("connor bedard") ||
    context.includes("sidney crosby") ||
    context.includes("alex ovechkin") ||
    context.includes("wayne gretzky")
  ) {
    return "Hockey";
  }

  // Baseball
  if (s.includes("baseball") || s.includes("mlb")) {
    return "Baseball";
  }

  // Basketball
  if (s.includes("basketball") || s.includes("nba")) {
    return "Basketball";
  }

  // American Football
  if (
    s.includes("football") ||
    s.includes("nfl") ||
    s.includes("american football")
  ) {
    return "Football";
  }

  // Racing
  if (s.includes("racing") || s.includes("f1") || s.includes("nascar") || s.includes("formula 1")) {
    return "Racing";
  }

  // Wrestling
  if (s.includes("wrestling") || s.includes("wwe") || s.includes("aew")) {
    return "Wrestling";
  }

  // MMA
  if (s.includes("mma") || s.includes("ufc")) {
    return "MMA";
  }

  if (rawSport && rawSport.trim()) {
    const clean = rawSport.trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return "Other";
}

const cardIdentificationSchema = {
  type: Type.OBJECT,
  properties: {
    year: {
      type: Type.STRING,
      description: "Year of the card release (e.g. '2023', '1986')",
    },
    brand: {
      type: Type.STRING,
      description: "Card brand or manufacturer (e.g. 'Topps', 'Panini', 'Upper Deck', 'Pokemon', 'Bandai')",
    },
    setName: {
      type: Type.STRING,
      description: "Specific set name (e.g. 'Prizm', 'Chrome', 'Crown Zenith', '151')",
    },
    player: {
      type: Type.STRING,
      description: "Full player or character name (e.g. 'Michael Jordan', 'Ken Griffey Jr.', 'Pikachu', 'Monkey D. Luffy')",
    },
    cardNumber: {
      type: Type.STRING,
      description: "Card number without '#' symbol (e.g. '154', 'OP05-119', '025/165')",
    },
    parallelOrVariation: {
      type: Type.STRING,
      nullable: true,
      description: "Parallel, variation, refractor, or base (e.g. 'Silver Prizm', 'Refractor', 'Base', 'Alternate Art')",
    },
    isRookie: {
      type: Type.BOOLEAN,
      description: "True if official rookie card (RC), false otherwise",
    },
  },
  required: [
    "year",
    "brand",
    "setName",
    "player",
    "cardNumber",
    "isRookie",
  ],
};

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

      // Minimal, token-efficient prompt (schema is strictly enforced by responseSchema)
      const promptText = "Identify this trading card from the images. Extract year, brand, setName, player, cardNumber (no '#' symbol), parallelOrVariation, and isRookie.";

      let responseText = "";
      let primaryError = "";
      const modelsToTry = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
      let successfulModel = "gemini-3.5-flash-lite";
      let promptTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;

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
              responseSchema: cardIdentificationSchema,
              maxOutputTokens: 256,
              temperature: 0.1,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          });
          if (res.text) {
            responseText = res.text;
            successfulModel = modelName;
            promptTokens = res.usageMetadata?.promptTokenCount || 0;
            outputTokens = res.usageMetadata?.candidatesTokenCount || 0;
            totalTokens = res.usageMetadata?.totalTokenCount || (promptTokens + outputTokens);
            break;
          }
        } catch (mErr: any) {
          const errMsg = mErr.message || String(mErr);
          if (errMsg.includes("thinkingConfig") || errMsg.includes("thinking")) {
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
                  responseSchema: cardIdentificationSchema,
                  maxOutputTokens: 256,
                  temperature: 0.1,
                },
              });
              if (res.text) {
                responseText = res.text;
                successfulModel = modelName;
                promptTokens = res.usageMetadata?.promptTokenCount || 0;
                outputTokens = res.usageMetadata?.candidatesTokenCount || 0;
                totalTokens = res.usageMetadata?.totalTokenCount || (promptTokens + outputTokens);
                break;
              }
            } catch (retryErr: any) {
              console.warn(`Model ${modelName} retry failed:`, retryErr.message);
            }
          }
          if (!primaryError || mErr.status === 429) {
            primaryError = errMsg;
          }
          console.warn(`Model ${modelName} failed:`, errMsg);
        }
      }

      if (!responseText) {
        let cleanErr = primaryError || "Gemini Vision AI processing failed.";
        try {
          const parsed = JSON.parse(cleanErr);
          if (parsed.error?.message) cleanErr = parsed.error.message;
        } catch {}
        if (cleanErr.includes("depleted") || cleanErr.includes("RESOURCE_EXHAUSTED") || cleanErr.includes("429")) {
          throw new HttpsError("resource-exhausted", cleanErr);
        }
        throw new HttpsError("internal", cleanErr);
      }

      let parsed = JSON.parse(responseText);
      const player = (parsed.player || parsed.playerName || parsed.subject || "").trim();
      const brand = (parsed.brand || parsed.publisher || "").trim();
      const setName = (parsed.setName || "").trim();
      const cardNumber = String(parsed.cardNumber || "").replace(/^[#\s]+/, "").trim();
      const parallel = (parsed.parallelOrVariation || parsed.subsetParallel || "Base").trim() || "Base";
      const rawYear = String(parsed.year || "").replace(/\D/g, "");
      const yearNum = parseInt(rawYear, 10) || new Date().getFullYear();
      const isRookie = Boolean(parsed.isRookie);
      const sport = normalizeSport(parsed.sport || "", player, brand, setName);

      const costUsd = Number(((promptTokens * 0.00000030) + (outputTokens * 0.00000250)).toFixed(6));

      return {
        cardFound: true,
        confidenceScore: 0.98,
        playerName: player,
        subject: player,
        brand: brand,
        publisher: brand,
        setName: setName,
        cardNumber: cardNumber,
        subsetParallel: parallel,
        sport: sport,
        year: yearNum,
        isRookie: isRookie,
        isAutographed: false,
        isMemorabilia: false,
        isNumbered: false,
        condition: "Raw",
        estimatedValue: 0,
        aiUsage: {
          model: successfulModel,
          promptTokens,
          outputTokens,
          totalTokens,
          costUsd,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      console.error("identifyCard Cloud Function error:", err);
      if (err instanceof HttpsError) throw err;
      let msg = err.message || "Failed to identify card with Gemini Vision AI.";
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      throw new HttpsError("internal", msg);
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

      if (!clientId || !clientSecret) {
        res.status(500).json({ error: `Missing eBay credentials: clientId length ${clientId.length}, secret length ${clientSecret.length}` });
        return;
      }

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

      const queryVariations = buildQueryStages(query);

      let rawItems: any[] = [];
      const debugLogs: string[] = [];

      for (const qVar of queryVariations) {
        const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        searchUrl.searchParams.set("q", qVar);
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
          debugLogs.push(`["${qVar}"] -> ${found.length} items (Status ${searchRes.status})`);
          if (found.length > 0) {
            rawItems = found;
            break;
          }
        } else {
          const lastErrText = await searchRes.text();
          debugLogs.push(`["${qVar}"] -> ERROR ${searchRes.status}: ${lastErrText}`);
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
          debugLogs,
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
      let psa10Sales: any[] = [];
      let psa9Sales: any[] = [];
      let gradingAnalysis: any = undefined;

      const shouldIncludeGraded = includeGraded !== undefined ? Boolean(includeGraded) : true;

      if (shouldIncludeGraded) {
        try {
          const cleanQuery = query
            .replace(/Parallel:\s*/gi, "")
            .replace(/Subset:\s*/gi, "")
            .replace(/\b(19\d\d|20\d\d)\s+\1-\d\d\b/gi, (match: string) => match.split(/\s+/)[1])
            .replace(/\bBase\b/gi, "")
            .replace(/#/g, "")
            .replace(/\s+/g, " ")
            .trim();

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
          psa9Url.searchParams.set("q", `${cleanQuery} ${gradingCompany} 9 -Lot -Pack -Bundle`);
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
        psa10Sales,
        psa9Sales,
        gradingAnalysis,
        recentSales: sales,
        debugLogs,
      });
    } catch (err: any) {
      console.error("getEbayComps Cloud Function error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch eBay sales comps." });
    }
  }
);
