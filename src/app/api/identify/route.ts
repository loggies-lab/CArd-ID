import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");

// Client Singleton Cache to reuse keep-alive HTTP sockets
let vertexAiClientCache: GoogleGenAI | null = null;
const apiKeyClientCache = new Map<string, GoogleGenAI>();

function getGenAiClient(apiKey?: string): { ai: GoogleGenAI; modelName: string } {
  if (apiKey) {
    if (!apiKeyClientCache.has(apiKey)) {
      apiKeyClientCache.set(apiKey, new GoogleGenAI({ apiKey }));
    }
    return { ai: apiKeyClientCache.get(apiKey)!, modelName: "gemini-2.0-flash" };
  }

  if (!vertexAiClientCache) {
    vertexAiClientCache = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || "project-51730e6d-a5b5-4744-89d",
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    });
  }
  return { ai: vertexAiClientCache, modelName: "gemini-2.5-flash" };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("--> API Received Card Payload for ID:", body.id || "Batch Pair");

    const frontInput = body.frontBase64 || body.frontImage;
    const backInput = body.backBase64 || body.backImage;
    const apiKey = body.apiKeyOverride || process.env.GEMINI_API_KEY;

    if (!frontInput || !backInput) {
      return NextResponse.json(
        { error: "Both front and back image base64 strings are required." },
        { status: 400 }
      );
    }

    const frontClean = cleanBase64(frontInput);
    const backClean = cleanBase64(backInput);

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

    const { ai, modelName } = getGenAiClient(apiKey);
    let responseText: string | undefined;

    // Optimized generation configuration: cap tokens & set low temperature for fast, deterministic output
    const generationConfig = {
      responseMimeType: "application/json",
      maxOutputTokens: 350,
      temperature: 0.1,
    };

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { text: promptText },
          { inlineData: { mimeType: "image/jpeg", data: frontClean } },
          { inlineData: { mimeType: "image/jpeg", data: backClean } },
        ],
        config: generationConfig,
      });
      responseText = response.text;
    } catch (modelErr: any) {
      if (!apiKey && modelErr?.message?.includes("404")) {
        console.log("--> Retrying with gemini-2.5-flash on Vertex AI...");
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            { text: promptText },
            { inlineData: { mimeType: "image/jpeg", data: frontClean } },
            { inlineData: { mimeType: "image/jpeg", data: backClean } },
          ],
          config: generationConfig,
        });
        responseText = response.text;
      } else {
        throw modelErr;
      }
    }

    console.log("--> RAW GEMINI RESPONSE:", responseText);

    if (!responseText) {
      throw new Error("Empty response received from Gemini model.");
    }

    const parsedData = JSON.parse(responseText);

    // Rule 1 Enforcement: NEVER include '#' symbol in cardNumber
    if (parsedData.cardNumber) {
      parsedData.cardNumber = String(parsedData.cardNumber).replace(/#/g, "").trim();
    }

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("=== API SERVER CRASH ERROR ===");
    console.error(error.stack || error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
