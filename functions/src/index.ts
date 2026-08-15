import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { GoogleGenAI } from "@google/genai";

initializeApp();

export const identifyCard = onCall(
  {
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (request) => {
    const { frontBase64, backBase64, apiKeyOverride } = request.data || {};

    const apiKey =
      apiKeyOverride ||
      process.env.GEMINI_API_KEY ||
      "AIzaSyARlxPXG7-Nqo4_HSzWyYwgS7YGVKIvPtE";

    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY is missing on server environment variables."
      );
    }

    if (!frontBase64 || !backBase64) {
      throw new HttpsError(
        "invalid-argument",
        "Both frontBase64 and backBase64 image strings are required."
      );
    }

    const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(frontBase64);
    const backClean = cleanBase64(backBase64);

    try {
      const ai = new GoogleGenAI({ apiKey });

      const promptText = `You are an expert sports trading card cataloging AI strictly compliant with Card Dealer Pro (CDP) standards.
Identify the trading card from these front and back images with 100% precision.

Return valid JSON with these exact keys:
- playerName (string)
- brand (string)
- setName (string)
- cardNumber (string, pure alphanumeric without '#' symbol)
- subsetParallel (string)
- team (string)
- sport (string)
- year (number)
- isRookie (boolean)
- isAutographed (boolean)
- isMemorabilia (boolean)
- isNumbered (boolean)`;

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
      if (parsed.cardNumber) {
        parsed.cardNumber = String(parsed.cardNumber).replace(/#/g, "").trim();
      }

      return parsed;
    } catch (err: any) {
      console.error("identifyCard Cloud Function Error:", err);
      if (err instanceof HttpsError) {
        throw err;
      }
      throw new HttpsError("internal", err.message || "Card identification failed.");
    }
  }
);
