"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyCard = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const genai_1 = require("@google/genai");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
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
//# sourceMappingURL=index.js.map