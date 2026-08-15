import { GoogleGenAI } from "@google/genai";

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
 * Executes Gemini Vision AI card identification directly in the client browser.
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

  const ai = new GoogleGenAI({ apiKey });

  const promptText = `You are an expert sports trading card cataloging AI strictly compliant with Card Dealer Pro (CDP) standards.
Identify the trading card from these front and back images with 100% precision.

Return ONLY a valid JSON object matching this schema:
{
  "cardFound": true,
  "confidenceScore": 0.98,
  "subject": "Player Name",
  "cardNumber": "Card Number (pure alphanumeric, no # symbol)",
  "subsetParallel": "Parallels / Refractor / Base",
  "team": "Team Name",
  "sport": "Sport Name (Baseball, Basketball, Football, etc.)",
  "year": 2024,
  "publisher": "Topps / Panini / Upper Deck",
  "setName": "Set Name",
  "isRookie": false,
  "isAutographed": false,
  "isMemorabilia": false,
  "isNumbered": false,
  "numberedTo": 99,
  "notes": "Any distinguishing features"
}

CRITICAL CDP COMPLIANCE RULES:
1. "cardNumber": Must NEVER contain a '#' symbol (e.g., use "101" instead of "#101").
2. "confidenceScore": Float between 0.0 and 1.0.
3. If no card is visible or image is unreadable, set "cardFound": false.
4. DO NOT wrap JSON in markdown syntax if possible, or return clean JSON code block.
DO NOT output mock fallbacks or generic default values.`;

  const frontClean = cleanBase64(frontBase64);
  const backClean = cleanBase64(backBase64);

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

  if (parsedData.cardNumber) {
    parsedData.cardNumber = String(parsedData.cardNumber).replace(/#/g, "").trim();
  }

  return parsedData;
}
