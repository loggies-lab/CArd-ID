import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");

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

    let ai: GoogleGenAI;
    let modelName = "gemini-2.0-flash";

    if (apiKey) {
      console.log("--> Authenticating via Gemini Developer API Key...");
      ai = new GoogleGenAI({ apiKey });
    } else {
      console.log("--> Authenticating via Google Cloud Vertex AI ADC...");
      ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "project-51730e6d-a5b5-4744-89d",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });
      modelName = "gemini-2.5-flash";
    }

    let responseText: string | undefined;

    try {
      const response = await ai.models.generateContent({
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
          config: {
            responseMimeType: "application/json",
          },
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
