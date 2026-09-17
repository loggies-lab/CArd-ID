import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User } from "firebase/auth";
import { UserGradingSettings } from "@/types/card";
import { SubscriptionTier, BillingInterval } from "@/types/subscription";

export interface UserProfileDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus?: "active" | "trialing" | "past_due" | "cancelled";
  billingCycle?: BillingInterval;
  planAmount?: number;
  lastPaymentDate?: string;
  scansRemaining: number;
  monthlyScanLimit: number;
  role?: "user" | "admin";
  totalCardsSaved?: number;
  lastLogin: string;
  gradingSettings?: UserGradingSettings;
}

export interface BatchSessionDocument {
  batchId: string;
  createdAt: string;
  cardCount: number;
  exportedCsv?: boolean;
}

/**
 * Checks if an email belongs to a default platform administrator
 */
export function isDefaultAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return (
    lower.includes("loganmartinez") ||
    lower === "admin@cardid.pro" ||
    lower === "logan@cardid.pro"
  );
}

/**
 * Executes a Firestore operation with exponential backoff retries to handle transient IndexedDB / database closing errors during auth state transitions
 */
async function withFirestoreRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 300): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isClosingError =
        err?.message?.toLowerCase().includes("closing") ||
        err?.message?.toLowerCase().includes("hidden") ||
        err?.code === "unavailable" ||
        err?.code === "failed-precondition";

      if (isClosingError && attempt <= maxRetries) {
        console.warn(`Firestore operation transient error (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, err?.message);
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Provisions or updates user profile document at /users/{uid}
 */
export async function getOrCreateUserProfile(user: User): Promise<UserProfileDocument> {
  const isAdmin = isDefaultAdminEmail(user.email);
  const defaultProfile: UserProfileDocument = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || (user.email ? user.email.split("@")[0] : "Collector"),
    photoURL: user.photoURL || null,
    createdAt: new Date().toISOString(),
    subscriptionTier: isAdmin ? "pro" : "free",
    subscriptionStatus: "active",
    scansRemaining: isAdmin ? 9999 : 25,
    monthlyScanLimit: isAdmin ? 9999 : 25,
    role: isAdmin ? "admin" : "user",
    lastLogin: new Date().toISOString(),
  };

  try {
    return await withFirestoreRetry(async () => {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      const nowIso = new Date().toISOString();

      if (!snap.exists()) {
        const newProfile: UserProfileDocument = {
          ...defaultProfile,
          createdAt: nowIso,
          lastLogin: nowIso,
        };
        await setDoc(userRef, newProfile);
        return newProfile;
      } else {
        const existing = snap.data() as UserProfileDocument;
        const shouldBeAdmin = existing.role === "admin" || isAdmin;
        const updated = {
          ...existing,
          email: user.email || existing.email,
          displayName: user.displayName || existing.displayName || (user.email ? user.email.split("@")[0] : "Collector"),
          photoURL: user.photoURL || existing.photoURL,
          role: shouldBeAdmin ? ("admin" as const) : (existing.role || "user"),
          subscriptionTier: shouldBeAdmin && existing.subscriptionTier === "free" ? ("pro" as const) : existing.subscriptionTier || "free",
          scansRemaining: shouldBeAdmin && (existing.scansRemaining ?? 0) < 100 ? 9999 : (existing.scansRemaining ?? 25),
          lastLogin: nowIso,
        };
        await updateDoc(userRef, {
          email: updated.email,
          displayName: updated.displayName,
          photoURL: updated.photoURL,
          role: updated.role,
          subscriptionTier: updated.subscriptionTier,
          scansRemaining: updated.scansRemaining,
          lastLogin: nowIso,
        });
        return updated;
      }
    });
  } catch (err) {
    console.warn("Firestore profile sync notice, using local profile fallback:", err);
    return defaultProfile;
  }
}

/**
 * Decrements user's scans remaining by 1 upon successful card identification
 */
export async function decrementUserScan(uid: string): Promise<number> {
  if (!uid || uid === "guest_user") return 24;
  try {
    return await withFirestoreRetry(async () => {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfileDocument;
        if (data.subscriptionTier === "pro") {
          return 9999;
        }
        const current = data.scansRemaining ?? 25;
        const next = Math.max(0, current - 1);
        await updateDoc(userRef, { scansRemaining: next });
        return next;
      }
      return 0;
    });
  } catch (err) {
    console.warn("Failed to decrement user scan count in Firestore:", err);
    return 0;
  }
}

/**
 * Allows administrators to update any user's subscription tier, scan balance, or role
 */
export async function updateUserAdminControls(uid: string, updates: Partial<UserProfileDocument>): Promise<void> {
  try {
    await withFirestoreRetry(async () => {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, updates);
    });
  } catch (err) {
    console.error("Failed to update user admin controls in Firestore:", err);
    throw err;
  }
}

/**
 * Persists user's custom grading ROI rules & thresholds directly to their Cloud Firestore profile document
 */
export async function updateUserGradingSettings(uid: string, settings: UserGradingSettings): Promise<void> {
  try {
    await withFirestoreRetry(async () => {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        gradingSettings: settings,
      });
    });
  } catch (err) {
    console.error("Failed to update grading settings in user profile:", err);
  }
}

/**
 * Logs a scanning or export batch session under /users/{uid}/batches/{batchId}
 */
export async function logUserBatchSession(
  uid: string,
  batchId: string,
  cardCount: number,
  exportedCsv: boolean = false
): Promise<void> {
  try {
    await withFirestoreRetry(async () => {
      const batchRef = doc(db, "users", uid, "batches", batchId);
      await setDoc(batchRef, {
        batchId,
        createdAt: new Date().toISOString(),
        cardCount,
        exportedCsv,
      });
    });
  } catch (err) {
    console.error("Failed to log batch session to Firestore:", err);
  }
}

