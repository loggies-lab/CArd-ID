import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing on environment variables." },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { frontBase64, backBase64 } = body;

    if (!frontBase64 || !backBase64) {
      return NextResponse.json(
        { error: "Both frontBase64 and backBase64 image strings are required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(frontBase64);
    const backClean = cleanBase64(backBase64);

    const ai = new GoogleGenAI({ apiKey });

    const promptText = `You are an expert sports trading card cataloging AI strictly compliant with Card Dealer Pro (CDP) standards.
Identify the trading card from these front and back images with 100% precision.

Return ONLY a valid JSON object matching this schema:
{
  "cardFound": true,
  "confidenceScore": 0.98,
  "playerName": "Full Player / Athlete Name (e.g. Michael Jordan, Ken Griffey Jr.)",
  "subject": "Full Player / Athlete Name",
  "cardNumber": "Card Number (pure alphanumeric, no # symbol)",
  "subsetParallel": "Parallels / Refractor / Base",
  "team": "Team Name",
  "sport": "Sport Name (Baseball, Basketball, Football, etc.)",
  "year": 2024,
  "brand": "Topps / Panini / Upper Deck / Fleer / Donruss",
  "publisher": "Publisher / Brand Name",
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
      } catch (mErr: any) {
        const errMsg = mErr.message || String(mErr);
        if (!primaryError || mErr.status === 429) {
          primaryError = errMsg;
        }
        console.warn(`Model ${modelName} failed:`, errMsg);
      }
    }

    if (!responseText) {
      throw new Error(primaryError || "Empty response from Gemini model.");
    }

    let parsed = JSON.parse(responseText);
    const player = parsed.playerName || parsed.subject || parsed.player || "";
    const brand = parsed.brand || parsed.publisher || "";
    parsed.playerName = player;
    parsed.subject = player;
    parsed.brand = brand;
    parsed.publisher = brand;

    if (parsed.cardNumber) {
      parsed.cardNumber = String(parsed.cardNumber).replace(/#/g, "").trim();
    }

    return NextResponse.json(parsed, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Error in POST /api/identify:", error);
    return NextResponse.json(
      { error: error.message || "Failed to identify card" },
      { status: 500, headers: corsHeaders }
    );
  }
}
