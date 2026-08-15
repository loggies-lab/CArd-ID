import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User } from "firebase/auth";

export interface UserProfileDocument {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
  subscriptionTier: "free" | "starter" | "pro";
  scansRemaining: number;
  monthlyScanLimit: number;
  lastLogin: string;
}

export interface BatchSessionDocument {
  batchId: string;
  createdAt: string;
  cardCount: number;
  exportedCsv?: boolean;
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
  return withFirestoreRetry(async () => {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    const nowIso = new Date().toISOString();

    if (!snap.exists()) {
      const newProfile: UserProfileDocument = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        createdAt: nowIso,
        subscriptionTier: "free",
        scansRemaining: 50,
        monthlyScanLimit: 50,
        lastLogin: nowIso,
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    } else {
      const existing = snap.data() as UserProfileDocument;
      const updated = {
        ...existing,
        email: user.email || existing.email,
        displayName: user.displayName || existing.displayName,
        photoURL: user.photoURL || existing.photoURL,
        lastLogin: nowIso,
      };
      await updateDoc(userRef, {
        email: updated.email,
        displayName: updated.displayName,
        photoURL: updated.photoURL,
        lastLogin: nowIso,
      });
      return updated;
    }
  });
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
