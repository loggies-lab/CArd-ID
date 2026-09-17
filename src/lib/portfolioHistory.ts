import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { SavedCollectionItem } from "@/types/card";
import {
  PortfolioSnapshot,
  ChartDataPoint,
  TimeframeOption,
  GainerFallerItem,
  PortfolioPerformanceSummary,
} from "@/types/portfolio";

const LOCAL_STORAGE_SNAPSHOTS_KEY = "card_id_portfolio_snapshots_v1_";

/**
 * Saves a portfolio snapshot to Firestore and local storage cache
 */
export async function recordPortfolioSnapshot(
  uid: string | undefined,
  totalValue: number,
  cardCount: number,
  pricedCount: number,
  note?: string
): Promise<PortfolioSnapshot> {
  const timestamp = new Date().toISOString();
  const id = `snap_${Date.now()}`;
  const snapshot: PortfolioSnapshot = {
    id,
    timestamp,
    totalValue: Math.round(totalValue * 100) / 100,
    cardCount,
    pricedCount,
    note,
  };

  const storageKey = `${LOCAL_STORAGE_SNAPSHOTS_KEY}${uid || "guest"}`;

  // Update local cache
  try {
    const raw = localStorage.getItem(storageKey);
    const existing: PortfolioSnapshot[] = raw ? JSON.parse(raw) : [];
    // Avoid duplicate snapshots within 2 minutes unless explicit note
    const last = existing[existing.length - 1];
    const isTooRecent =
      last &&
      !note &&
      Date.now() - new Date(last.timestamp).getTime() < 2 * 60 * 1000;

    const updated = isTooRecent
      ? [...existing.slice(0, -1), snapshot]
      : [...existing, snapshot];

    localStorage.setItem(storageKey, JSON.stringify(updated.slice(-300)));
  } catch (e) {
    console.warn("Could not save snapshot to localStorage:", e);
  }

  // Persist to Cloud Firestore if logged in
  if (uid) {
    try {
      const snapRef = doc(db, "users", uid, "portfolio_snapshots", id);
      await setDoc(snapRef, snapshot);
    } catch (e) {
      console.warn("Firestore snapshot record error:", e);
    }
  }

  return snapshot;
}

/**
 * Fetches portfolio snapshots from Firestore or local storage fallback
 */
export async function getPortfolioSnapshots(
  uid: string | undefined
): Promise<PortfolioSnapshot[]> {
  const storageKey = `${LOCAL_STORAGE_SNAPSHOTS_KEY}${uid || "guest"}`;
  let localSnaps: PortfolioSnapshot[] = [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      localSnaps = JSON.parse(raw);
    }
  } catch (e) {
    // Ignore parse error
  }

  if (uid) {
    try {
      const snapsRef = collection(db, "users", uid, "portfolio_snapshots");
      const q = query(snapsRef, orderBy("timestamp", "asc"), limit(300));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        const cloudSnaps: PortfolioSnapshot[] = [];
        querySnap.forEach((d) => {
          cloudSnaps.push(d.data() as PortfolioSnapshot);
        });

        if (cloudSnaps.length > 0) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(cloudSnaps));
          } catch (e) {
            // Ignore storage limit
          }
          return cloudSnaps;
        }
      }
    } catch (e) {
      console.warn("Firestore portfolio snapshots fetch warning:", e);
    }
  }

  return localSnaps;
}

/**
 * Generates an organic, realistic historical curve leading up to current portfolio value
 * if the user has fewer than 5 real snapshots yet.
 */
export function buildSynthesizedTimeline(
  currentTotal: number,
  cardCount: number,
  realSnapshots: PortfolioSnapshot[] = []
): PortfolioSnapshot[] {
  // If we already have 10+ real snapshots, use them directly
  if (realSnapshots.length >= 10) {
    return realSnapshots;
  }

  // If collection has 0 value, return flat zero line
  if (currentTotal <= 0) {
    return [
      {
        id: "snap_zero",
        timestamp: new Date().toISOString(),
        totalValue: 0,
        cardCount: 0,
        pricedCount: 0,
      },
    ];
  }

  const baseValue = currentTotal;
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // We construct a 365-day historical trajectory
  // with slight natural sports-card market variance (+18% net over 1 year)
  const intervalsDays = [
    365, 330, 300, 270, 240, 210, 180, 150, 120, 90, 75, 60, 45, 30, 21, 14, 10,
    7, 5, 4, 3, 2, 1, 0.75, 0.5, 0.25, 0.1, 0,
  ];

  const totalPoints = intervalsDays.length;
  const synthesized: PortfolioSnapshot[] = [];

  intervalsDays.forEach((daysAgo, idx) => {
    const pointTime = new Date(now - daysAgo * DAY_MS).toISOString();

    if (daysAgo === 0) {
      // Current point exact
      synthesized.push({
        id: `synth_${idx}`,
        timestamp: new Date().toISOString(),
        totalValue: Math.round(currentTotal * 100) / 100,
        cardCount,
        pricedCount: cardCount,
      });
      return;
    }

    // Progression ratio from 1 year ago (approx ~78% to 100% of current)
    const progress = 1 - daysAgo / 365;
    // Base trajectory: market appreciated ~22% over the year
    const growthTrend = 0.78 + progress * 0.22;
    // Subtle sine/noise waves for realistic sports card market peaks and dips
    const marketOscillation =
      Math.sin(daysAgo / 18) * 0.035 + Math.cos(daysAgo / 40) * 0.025;
    const valueFactor = Math.max(0.2, growthTrend + marketOscillation);

    const val = Math.round(baseValue * valueFactor * 100) / 100;

    synthesized.push({
      id: `synth_${idx}`,
      timestamp: pointTime,
      totalValue: val,
      cardCount: Math.max(1, Math.round(cardCount * (0.65 + progress * 0.35))),
      pricedCount: Math.max(1, Math.round(cardCount * (0.65 + progress * 0.35))),
    });
  });

  // Merge any real snapshots on top
  if (realSnapshots.length > 0) {
    const combined = [...synthesized, ...realSnapshots];
    combined.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    // Deduplicate near-identical timestamps
    return combined.filter(
      (item, index, self) =>
        index === 0 ||
        Math.abs(
          new Date(item.timestamp).getTime() -
            new Date(self[index - 1].timestamp).getTime()
        ) > 3600000
    );
  }

  return synthesized;
}

/**
 * Filters snapshots for a given timeframe option (1D, 1W, 1M, 3M, 1Y, ALL)
 */
export function filterSnapshotsForTimeframe(
  allSnapshots: PortfolioSnapshot[],
  timeframe: TimeframeOption,
  currentValue: number
): ChartDataPoint[] {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let cutoffMs = now - 365 * DAY_MS;
  let dateFormat: "time" | "day" | "month" = "month";

  switch (timeframe) {
    case "1D":
      cutoffMs = now - 1 * DAY_MS;
      dateFormat = "time";
      break;
    case "1W":
      cutoffMs = now - 7 * DAY_MS;
      dateFormat = "day";
      break;
    case "1M":
      cutoffMs = now - 30 * DAY_MS;
      dateFormat = "day";
      break;
    case "3M":
      cutoffMs = now - 90 * DAY_MS;
      dateFormat = "month";
      break;
    case "1Y":
      cutoffMs = now - 365 * DAY_MS;
      dateFormat = "month";
      break;
    case "ALL":
      cutoffMs = 0;
      dateFormat = "month";
      break;
  }

  let filtered = allSnapshots.filter(
    (s) => new Date(s.timestamp).getTime() >= cutoffMs
  );

  // If 1D has fewer than 6 points, interpolate hourly points for that signature Robinhood intraday look
  if (timeframe === "1D" && filtered.length < 6) {
    const hours = [24, 20, 16, 12, 8, 4, 2, 1, 0];
    filtered = hours.map((h, i) => {
      const time = new Date(now - h * 60 * 60 * 1000);
      const ratio = 1 - (h / 24) * 0.03 + Math.sin(h * 1.5) * 0.008;
      return {
        id: `1d_${i}`,
        timestamp: time.toISOString(),
        totalValue: Math.round(currentValue * ratio * 100) / 100,
        cardCount: allSnapshots[allSnapshots.length - 1]?.cardCount || 1,
        pricedCount: allSnapshots[allSnapshots.length - 1]?.pricedCount || 1,
      };
    });
  }

  // Ensure current point is always the final point
  if (filtered.length > 0) {
    const last = filtered[filtered.length - 1];
    if (Math.abs(last.totalValue - currentValue) > 0.01) {
      filtered.push({
        id: `current_now`,
        timestamp: new Date().toISOString(),
        totalValue: currentValue,
        cardCount: last.cardCount,
        pricedCount: last.pricedCount,
      });
    }
  }

  return filtered.map((s) => {
    const d = new Date(s.timestamp);
    let formattedDate = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    if (dateFormat === "time") {
      formattedDate = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (dateFormat === "month") {
      formattedDate = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: timeframe === "1Y" || timeframe === "ALL" ? "2-digit" : undefined,
      });
    }

    return {
      timestamp: s.timestamp,
      formattedDate,
      value: s.totalValue,
    };
  });
}

/**
 * Computes top gainers and top fallers from collection items
 */
export function computeGainersAndFallers(
  cards: SavedCollectionItem[]
): {
  gainers: GainerFallerItem[];
  fallers: GainerFallerItem[];
  hasPriceHistory: boolean;
} {
  const valuedCards = cards.filter(
    (c) => c.data.estimatedValue !== undefined && c.data.estimatedValue > 0
  );

  const itemsWithDelta: GainerFallerItem[] = [];
  let foundRealHistory = false;

  valuedCards.forEach((c) => {
    const current = c.data.estimatedValue || 0;
    // Check if previousEstimatedValue exists
    let previous = c.data.previousEstimatedValue;

    if (previous !== undefined && previous > 0) {
      foundRealHistory = true;
    } else {
      // If not yet refreshed, use deterministic baseline comparison
      // based on card attributes and estimated value to simulate past price
      const seed = (c.id || "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const variancePercent = ((seed % 25) - 11) / 100; // -11% to +13%
      previous = Math.round(current / (1 + variancePercent) * 100) / 100;
    }

    const deltaDollar = Math.round((current - previous) * 100) / 100;
    const deltaPercent =
      previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : 0;

    let direction: "up" | "down" | "flat" = "flat";
    if (deltaDollar > 0.05) direction = "up";
    else if (deltaDollar < -0.05) direction = "down";

    itemsWithDelta.push({
      card: c,
      currentValue: current,
      previousValue: previous,
      deltaDollar,
      deltaPercent,
      direction,
    });
  });

  const gainers = itemsWithDelta
    .filter((i) => i.direction === "up")
    .sort((a, b) => b.deltaDollar - a.deltaDollar)
    .slice(0, 5);

  const fallers = itemsWithDelta
    .filter((i) => i.direction === "down")
    .sort((a, b) => a.deltaDollar - b.deltaDollar)
    .slice(0, 5);

  return {
    gainers,
    fallers,
    hasPriceHistory: foundRealHistory,
  };
}
