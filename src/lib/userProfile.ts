import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
 * Provisions or updates user profile document at /users/{uid}
 */
export async function getOrCreateUserProfile(user: User): Promise<UserProfileDocument> {
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
    const batchRef = doc(db, "users", uid, "batches", batchId);
    await setDoc(batchRef, {
      batchId,
      createdAt: new Date().toISOString(),
      cardCount,
      exportedCsv,
    });
  } catch (err) {
    console.error("Failed to log batch session to Firestore:", err);
  }
}
