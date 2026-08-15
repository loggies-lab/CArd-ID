import { GoogleGenAI } from "@google/genai";

const DEFAULT_GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "AIzaSyARlxPXG7-Nqo4_HSzWyYwgS7YGVKIvPtE";

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

/**
 * Executes Gemini 2.0 Flash Vision AI card identification directly in the client browser.
 * Uses built-in Google Cloud API key if no custom key is specified.
 */
export async function identifyCardClientSide(
  frontBase64: string,
  backBase64: string,
  apiKey?: string
) {
  const keyToUse = apiKey || DEFAULT_GEMINI_API_KEY;

  if (!keyToUse) {
    throw new Error("Gemini API Key is required for vision processing.");
  }

  const ai = new GoogleGenAI({ apiKey: keyToUse });

  const promptText = `You are an expert sports trading card cataloging AI strictly compliant with Card Dealer Pro (CDP) standards.
Identify the trading card from these front and back images with 100% precision.

Return valid JSON with these exact keys:
- playerName (string)
- brand (string)
- setName (string)
- cardNumber (string, pure alphanumeric without '#' symbol, e.g., "245" or "BCV-166")
- subsetParallel (string)
- team (string)
- sport (string)
- year (number)
- isRookie (boolean)
- isAutographed (boolean)
- isMemorabilia (boolean)
- isNumbered (boolean)

DO NOT output mock fallbacks or generic default values.`;

  const frontClean = cleanBase64(frontBase64);
  const backClean = cleanBase64(backBase64);

  let responseText = "";
  let primaryError = "";
  const modelsToTry = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-pro-latest"];

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
          maxOutputTokens: 2048,
          temperature: 0.1,
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
    throw new Error(primaryError || "Empty response received from Gemini Vision AI.");
  }

  const parsedData = parseCleanJson(responseText);

  // CDP Rule 1 Enforcement: Never include '#' in cardNumber
  if (parsedData.cardNumber) {
    parsedData.cardNumber = String(parsedData.cardNumber).replace(/#/g, "").trim();
  }

  return parsedData;
}
