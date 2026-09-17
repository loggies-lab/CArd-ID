import { GoogleGenAI, Type } from "@google/genai";
import { downscaleCardImageForAi } from "@/lib/imageOptimizer";

const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");

function parseCleanJson(rawText: string) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  } else {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  return JSON.parse(cleaned);
}

export const cardIdentificationSchema = {
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

export function normalizeSport(
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

/**
 * Executes Gemini Vision AI card identification directly in the client browser.
 * Stateless per-scan request with strict schema, zero thinking overhead, and downscaling.
 */
export async function identifyCardClientSide(
  frontBase64: string,
  backBase64: string,
  customApiKey?: string
) {
  const apiKey = customApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("No Gemini API key provided for client-side identification.");
  }

  // Pre-downscale client-side images before payload generation: max 1200px, JPEG ~82% (<300KB)
  let frontClean = cleanBase64(frontBase64);
  let backClean = cleanBase64(backBase64);

  if (typeof window !== "undefined") {
    try {
      const optFront = await downscaleCardImageForAi(frontBase64, 1200, 0.82);
      if (optFront) frontClean = cleanBase64(optFront);
      const optBack = await downscaleCardImageForAi(backBase64, 1200, 0.82);
      if (optBack) backClean = cleanBase64(optBack);
    } catch (downscaleErr) {
      console.warn("Client image downscale warning:", downscaleErr);
    }
  }

  const ai = new GoogleGenAI({ apiKey });

  // Minimal, token-efficient prompt (schema is enforced by responseSchema)
  const promptText = "Identify this trading card from the images. Extract year, brand, setName, player, cardNumber (no '#' symbol), parallelOrVariation, and isRookie.";

  let responseText = "";
  let primaryError = "";
  let successfulModel = "gemini-3.5-flash-lite";
  let promptTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  const modelsToTry = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

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
      // Fallback: if a model doesn't support thinkingConfig, retry without it
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
    let cleanErr = primaryError || "Empty response received from Gemini Vision AI.";
    try {
      const parsed = JSON.parse(cleanErr);
      if (parsed.error?.message) cleanErr = parsed.error.message;
    } catch {}
    throw new Error(cleanErr);
  }

  const parsedData = parseCleanJson(responseText);
  const player = (parsedData.player || parsedData.playerName || parsedData.subject || "").trim();
  const brand = (parsedData.brand || parsedData.publisher || "").trim();
  const setName = (parsedData.setName || "").trim();
  const cardNumber = String(parsedData.cardNumber || "").replace(/^[#\s]+/, "").trim();
  const parallelOrVariation = (parsedData.parallelOrVariation || parsedData.subsetParallel || "Base").trim() || "Base";
  const rawYear = String(parsedData.year || "").replace(/\D/g, "");
  const yearNum = parseInt(rawYear, 10) || new Date().getFullYear();
  const isRookie = Boolean(parsedData.isRookie);

  const sport = normalizeSport("", player, brand, setName);

  // Gemini 3.5 Flash-Lite pricing: $0.30 per 1M input tokens, $2.50 per 1M output tokens
  const costUsd = Number(((promptTokens * 0.00000030) + (outputTokens * 0.00000250)).toFixed(6));

  return {
    playerName: player,
    brand,
    setName,
    cardNumber,
    subsetParallel: parallelOrVariation,
    team: "",
    sport,
    year: yearNum,
    isRookie,
    isAutographed: false,
    isMemorabilia: false,
    isNumbered: false,
    condition: "Raw" as const,
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
}
