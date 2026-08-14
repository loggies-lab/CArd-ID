"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyCard = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const genai_1 = require("@google/genai");
(0, app_1.initializeApp)();
exports.identifyCard = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
}, async (request) => {
    const { frontBase64, backBase64, apiKeyOverride } = request.data || {};
    const apiKey = apiKeyOverride ||
        process.env.GEMINI_API_KEY ||
        process.env.GEMINI_KEY ||
        "AIzaSyBCleNRqRE2YP4aVgNUVNU4WLiygjmrrPI";
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
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                { text: promptText },
                { inlineData: { mimeType: "image/jpeg", data: frontClean } },
                { inlineData: { mimeType: "image/jpeg", data: backClean } },
            ],
            config: {
                responseMimeType: "application/json",
            },
        });
        const responseText = response.text;
        if (!responseText) {
            throw new https_1.HttpsError("internal", "Empty response from Gemini model.");
        }
        let parsed = JSON.parse(responseText);
        if (parsed.cardNumber) {
            parsed.cardNumber = String(parsed.cardNumber).replace(/#/g, "").trim();
        }
        return parsed;
    }
    catch (err) {
        console.error("identifyCard Cloud Function Error:", err);
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        throw new https_1.HttpsError("internal", err.message || "Card identification failed.");
    }
});
//# sourceMappingURL=index.js.map