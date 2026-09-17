import type { CDPCardSchema, CardItem, SavedCollectionItem } from "@/types/card";
import { generateCdpTitle } from "./titleGenerator";

export interface LegendPlayer {
  canonical: string;
  sport: "Basketball" | "Football" | "Baseball" | "Hockey" | "Soccer" | "Other";
  aliases: string[];
}

export const GOAT_LEGENDS: LegendPlayer[] = [
  // Basketball
  { canonical: "Michael Jordan", sport: "Basketball", aliases: ["michael jordan"] },
  { canonical: "Kobe Bryant", sport: "Basketball", aliases: ["kobe bryant", "kobe"] },
  { canonical: "LeBron James", sport: "Basketball", aliases: ["lebron james", "lebron"] },
  { canonical: "Steph Curry", sport: "Basketball", aliases: ["steph curry", "stephen curry"] },
  { canonical: "Shaquille O'Neal", sport: "Basketball", aliases: ["shaquille o'neal", "shaquille oneal", "shaq"] },
  { canonical: "Magic Johnson", sport: "Basketball", aliases: ["magic johnson", "earvin johnson", "earvin magic johnson"] },
  { canonical: "Larry Bird", sport: "Basketball", aliases: ["larry bird"] },
  { canonical: "Victor Wembanyama", sport: "Basketball", aliases: ["victor wembanyama", "wembanyama"] },

  // Football
  { canonical: "Tom Brady", sport: "Football", aliases: ["tom brady"] },
  { canonical: "Patrick Mahomes", sport: "Football", aliases: ["patrick mahomes", "patrick mahomes ii"] },
  { canonical: "Peyton Manning", sport: "Football", aliases: ["peyton manning"] },
  { canonical: "Joe Montana", sport: "Football", aliases: ["joe montana"] },
  { canonical: "Jerry Rice", sport: "Football", aliases: ["jerry rice"] },
  { canonical: "Dan Marino", sport: "Football", aliases: ["dan marino"] },

  // Baseball
  { canonical: "Mickey Mantle", sport: "Baseball", aliases: ["mickey mantle"] },
  { canonical: "Babe Ruth", sport: "Baseball", aliases: ["babe ruth"] },
  { canonical: "Ken Griffey Jr.", sport: "Baseball", aliases: ["ken griffey jr", "ken griffey jr.", "ken griffey"] },
  { canonical: "Mike Trout", sport: "Baseball", aliases: ["mike trout"] },
  { canonical: "Shohei Ohtani", sport: "Baseball", aliases: ["shohei ohtani"] },
  { canonical: "Derek Jeter", sport: "Baseball", aliases: ["derek jeter"] },
  { canonical: "Aaron Judge", sport: "Baseball", aliases: ["aaron judge"] },

  // Hockey / Other
  { canonical: "Wayne Gretzky", sport: "Hockey", aliases: ["wayne gretzky"] },
  { canonical: "Connor McDavid", sport: "Hockey", aliases: ["connor mcdavid"] },
  { canonical: "Lionel Messi", sport: "Soccer", aliases: ["lionel messi", "leo messi"] },
  { canonical: "Cristiano Ronaldo", sport: "Soccer", aliases: ["cristiano ronaldo", "c. ronaldo", "cr7"] },
];

export interface KeyCardEvaluation {
  isUncomped: boolean;
  isKeyCard: boolean;
  isKeyUncomped: boolean;
  flags: {
    isRookie: boolean;
    isNumbered: boolean;
    numberedLabel?: string; // e.g. "/99", "/25", "/1", "Numbered"
    isAutograph: boolean;
    isGoat: boolean;
    goatName?: string;
  };
  badges: string[]; // e.g. ['RC', 'Numbered /99', 'Autograph', 'GOAT Tier']
}

/**
 * Normalizes text for comparison (removes accents, punctuation, extra spaces).
 */
function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluates whether a card lacks market comps and triggers any of the four high-value priority flags:
 * 1. Rookie Card (RC)
 * 2. Serial Numbered (/X)
 * 3. Autograph (Auto)
 * 4. GOAT / Icon Legend
 */
export function getKeyCardFlags(
  card: CardItem | SavedCollectionItem | { data?: CDPCardSchema; [key: string]: any }
): KeyCardEvaluation {
  const data: CDPCardSchema | undefined = card.data || (card as any);

  // 1. Check if card lacks market comps
  const rawEstVal =
    (card as any).rawEstimatedValue ??
    data?.estimatedValue ??
    (card as any).estimatedValue;

  const hasCompsData =
    Boolean(data?.gradingAnalysis?.psa10Value && data.gradingAnalysis.psa10Value > 0) ||
    Boolean(data?.gradingAnalysis?.psa9Value && data.gradingAnalysis.psa9Value > 0) ||
    Boolean(data?.gradingAnalysis?.psa10Sales && data.gradingAnalysis.psa10Sales.length > 0);

  const isUncomped =
    (rawEstVal === undefined || rawEstVal === null || Number(rawEstVal) <= 0) &&
    !hasCompsData;

  // Gather searchable text from all relevant metadata fields
  const title = generateCdpTitle(data) || (card as any).title || "";
  const setName = data?.setName || "";
  const subsetParallel = data?.subsetParallel || "";
  const notes = (card as any).notes || "";
  const cardNumber = data?.cardNumber || "";
  const serialNumberField = (card as any).serialNumber || (card as any).serialNumbered || data?.numberedTo || "";

  // Combine metadata strings for feature searching
  const combinedMetadata = `${title} ${setName} ${subsetParallel} ${notes} ${cardNumber} ${serialNumberField}`;
  const normalizedCombined = normalizeText(combinedMetadata);

  // --- Flag 1: Rookie Card (RC) ---
  const isRookieExplicit = Boolean(data?.isRookie || (card as any).isRookie);
  const rcRegex = /\b(rc|rookie)\b/i;
  const isRookieInText =
    rcRegex.test(title) ||
    rcRegex.test(setName) ||
    rcRegex.test(subsetParallel) ||
    rcRegex.test(notes) ||
    rcRegex.test(String((data as any)?.attributes || "")) ||
    rcRegex.test(String((card as any)?.attributes || ""));
  const isRookie = isRookieExplicit || isRookieInText;

  // --- Flag 2: Serial Numbered ---
  let isNumbered = Boolean(data?.isNumbered || (card as any).isNumbered);
  let numberedLabel: string | undefined = undefined;

  if (data?.numberedTo) {
    const cleanNumberedTo = String(data.numberedTo).replace(/^[#/]/, "").trim();
    if (cleanNumberedTo) {
      isNumbered = true;
      numberedLabel = `/${cleanNumberedTo}`;
    }
  }

  if (!numberedLabel && serialNumberField) {
    const sField = String(serialNumberField).trim();
    const slashMatch = sField.match(/(?:#|\b)(\d+)\s*\/\s*(\d+)\b/);
    if (slashMatch) {
      isNumbered = true;
      numberedLabel = `/${slashMatch[2]}`;
    } else {
      const singleMatch = sField.match(/\/?(\d+)\b/);
      if (singleMatch) {
        isNumbered = true;
        numberedLabel = `/${singleMatch[1]}`;
      }
    }
  }

  // Check text patterns in combined metadata (e.g., /99, /25, /1, 25/99, 1/1, 1 of 1)
  if (!numberedLabel) {
    const ratioMatch = combinedMetadata.match(/(?:#|\b)(\d+)\s*\/\s*(\d+)\b/);
    if (ratioMatch) {
      isNumbered = true;
      numberedLabel = `/${ratioMatch[2]}`;
    } else {
      const slashMatch = combinedMetadata.match(/(?:#|\b)\/(\d+)\b/);
      if (slashMatch) {
        isNumbered = true;
        numberedLabel = `/${slashMatch[1]}`;
      } else if (/\b(1\s*of\s*1|one\s*of\s*one|1\/1)\b/i.test(combinedMetadata)) {
        isNumbered = true;
        numberedLabel = "/1";
      }
    }
  }

  if (isNumbered && !numberedLabel) {
    numberedLabel = "";
  }

  // --- Flag 3: Autograph (Auto) ---
  const isAutoExplicit = Boolean(
    data?.isAutographed || (card as any).isAutograph || (card as any).isAutographed
  );
  const autoRegex = /\b(auto|autograph|autographed|sign|signed|signature|signatures|autos)\b/i;
  const isAutoInText =
    autoRegex.test(title) ||
    autoRegex.test(setName) ||
    autoRegex.test(subsetParallel) ||
    autoRegex.test(notes) ||
    autoRegex.test(String((data as any)?.attributes || "")) ||
    autoRegex.test(String((data as any)?.features || "")) ||
    autoRegex.test(String((card as any)?.attributes || ""));
  const isAutograph = isAutoExplicit || isAutoInText;

  // --- Flag 4: GOAT / Icon ---
  const rawPlayerName =
    data?.playerName ||
    (data as any)?.subject ||
    (data as any)?.player ||
    (card as any)?.playerName ||
    (card as any)?.subject ||
    "";
  const normalizedPlayer = normalizeText(rawPlayerName);

  let isGoat = false;
  let goatName: string | undefined = undefined;

  if (normalizedPlayer.length > 0) {
    for (const legend of GOAT_LEGENDS) {
      for (const alias of legend.aliases) {
        const normAlias = normalizeText(alias);
        // Exact match or contains whole alias
        const regex = new RegExp(`\\b${normAlias}\\b`, "i");
        if (regex.test(normalizedPlayer) || regex.test(normalizedCombined)) {
          isGoat = true;
          goatName = legend.canonical;
          break;
        }
      }
      if (isGoat) break;
    }
  }

  // Build the badges array
  const badges: string[] = [];
  if (isRookie) {
    badges.push("RC");
  }
  if (isNumbered) {
    badges.push(numberedLabel ? `Numbered ${numberedLabel}` : "Numbered");
  }
  if (isAutograph) {
    badges.push("Autograph");
  }
  if (isGoat) {
    badges.push("GOAT Tier");
  }

  const isKeyCard = isRookie || isNumbered || isAutograph || isGoat;
  const isKeyUncomped = isUncomped && isKeyCard;

  return {
    isUncomped,
    isKeyCard,
    isKeyUncomped,
    flags: {
      isRookie,
      isNumbered,
      numberedLabel,
      isAutograph,
      isGoat,
      goatName,
    },
    badges,
  };
}
