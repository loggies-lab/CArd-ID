import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allows requests from card-id-app.web.app
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 1. Handle browser preflight OPTIONS request
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// 2. Main POST endpoint with CORS headers
export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBCleNRqRE2YP4aVgNUVNU4WLiygjmrrPI";

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing on environment variables." },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();

    if (!body.frontBase64 || !body.backBase64) {
      return NextResponse.json(
        { error: "Both frontBase64 and backBase64 image strings are required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(body.frontBase64);
    const backClean = cleanBase64(body.backBase64);

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
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro"];

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
        if (!primaryError) {
          primaryError = errMsg;
        }
        console.warn(`Model ${modelName} failed:`, errMsg);
      }
    }

    if (!responseText) {
      throw new Error(primaryError || "Empty response from Gemini model.");
    }

    let parsed = JSON.parse(responseText);
    if (parsed.cardNumber) {
      parsed.cardNumber = String(parsed.cardNumber).replace(/#/g, "").trim();
    }

    return NextResponse.json(parsed, { headers: corsHeaders });

  } catch (error: any) {
    console.error("=== API SERVER ERROR ===");
    console.error(error.stack || error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
