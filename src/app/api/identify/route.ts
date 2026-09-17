import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { normalizeSport, cardIdentificationSchema } from "@/lib/geminiClient";

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
    const rawData = body?.data || body || {};
    let frontBase64 = rawData.frontBase64;
    let backBase64 = rawData.backBase64;

    if (frontBase64 && !backBase64) backBase64 = frontBase64;
    if (backBase64 && !frontBase64) frontBase64 = backBase64;

    if (!frontBase64 || !backBase64) {
      return NextResponse.json(
        { error: "At least one valid image (front or back) is required for card identification." },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");
    const frontClean = cleanBase64(frontBase64);
    const backClean = cleanBase64(backBase64);

    const ai = new GoogleGenAI({ apiKey });

    // Minimal, token-efficient prompt (schema is strictly enforced by responseSchema)
    const promptText = "Identify this trading card from the images. Extract year, brand, setName, player, cardNumber (no '#' symbol), parallelOrVariation, and isRookie.";

    let responseText = "";
    let primaryError = "";
    const modelsToTry = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
    let successfulModel = "gemini-3.5-flash-lite";
    let promptTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

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
      let cleanErr = primaryError || "Empty response from Gemini model.";
      try {
        const parsed = JSON.parse(cleanErr);
        if (parsed.error?.message) cleanErr = parsed.error.message;
      } catch {}
      throw new Error(cleanErr);
    }

    let parsed = JSON.parse(responseText);
    const player = (parsed.player || parsed.playerName || parsed.subject || "").trim();
    const brand = (parsed.brand || parsed.publisher || "").trim();
    const setName = (parsed.setName || "").trim();
    const cardNumber = String(parsed.cardNumber || "").replace(/^[#\s]+/, "").trim();
    const parallel = (parsed.parallelOrVariation || parsed.subsetParallel || "Base").trim() || "Base";
    const rawYear = String(parsed.year || "").replace(/\D/g, "");
    const yearNum = parseInt(rawYear, 10) || new Date().getFullYear();
    const isRookie = Boolean(parsed.isRookie);
    const sport = normalizeSport(parsed.sport || "", player, brand, setName);

    const costUsd = Number(((promptTokens * 0.00000030) + (outputTokens * 0.00000250)).toFixed(6));

    const responsePayload = {
      cardFound: true,
      confidenceScore: 0.98,
      playerName: player,
      subject: player,
      brand: brand,
      publisher: brand,
      setName: setName,
      cardNumber: cardNumber,
      subsetParallel: parallel,
      sport: sport,
      year: yearNum,
      isRookie: isRookie,
      isAutographed: false,
      isMemorabilia: false,
      isNumbered: false,
      condition: "Raw",
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

    return NextResponse.json(responsePayload, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Error in POST /api/identify:", error);
    return NextResponse.json(
      { error: error.message || "Failed to identify card" },
      { status: 500, headers: corsHeaders }
    );
  }
}
