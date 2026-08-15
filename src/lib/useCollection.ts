"use client";

import { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { fileToOptimizedBase64, compressBase64DataUrl } from "@/lib/imageOptimizer";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";

const LOCAL_STORAGE_KEY_PREFIX = "card_id_collection_v1_";

/**
 * Converts blob: URLs or File instances to permanent compact base64 Data URLs
 */
async function ensureDataUrl(preview?: string, file?: File | null): Promise<string | undefined> {
  if (!preview) return undefined;

  if (file) {
    try {
      return await fileToOptimizedBase64(file, 350, 0.65);
    } catch (e) {
      console.error("Failed to convert File to base64 Data URL:", e);
    }
  }

  if (preview.startsWith("data:")) {
    try {
      return await compressBase64DataUrl(preview, 350, 0.65);
    } catch (e) {
      return preview;
    }
  }

  if (preview.startsWith("blob:")) {
    try {
      const response = await fetch(preview);
      const blob = await response.blob();
      const rawBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
      if (rawBase64) {
        return await compressBase64DataUrl(rawBase64, 350, 0.65);
      }
    } catch (e) {
      console.error("Failed to convert blob URL to base64 Data URL:", e);
      return undefined;
    }
  }

  return preview;
}

export function useCollection() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;

  const storageKey = uid ? `${LOCAL_STORAGE_KEY_PREFIX}${uid}` : `${LOCAL_STORAGE_KEY_PREFIX}guest`;

  const [savedCards, setSavedCards] = useState<SavedCollectionItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Real-time Cloud Firestore Listener for /users/{uid}/cards
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let isCancelled = false;
    setIsLoaded(false);

    if (uid) {
      // Small timeout to allow Firebase auth token exchange and IndexedDB connection to stabilize
      const timer = setTimeout(() => {
        if (isCancelled) return;
        try {
          const userCardsRef = collection(db, "users", uid, "cards");
          unsubscribeFirestore = onSnapshot(
            userCardsRef,
            (snapshot) => {
              const cloudCards: SavedCollectionItem[] = [];
              snapshot.forEach((docSnap) => {
                const data = docSnap.data() as SavedCollectionItem;
                cloudCards.push({
                  ...data,
                  id: docSnap.id,
                });
              });

              cloudCards.sort(
                (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
              );

              setSavedCards(cloudCards);
              setIsLoaded(true);

              try {
                localStorage.setItem(storageKey, JSON.stringify(cloudCards));
              } catch (e) {
                // Ignore quota error
              }
            },
            (error) => {
              console.warn("User collection Firestore listener transient notice:", error?.message);
              loadFromLocalStorage();
            }
          );
        } catch (err) {
          console.warn("Firestore listener initialization fallback:", err);
          loadFromLocalStorage();
        }
      }, 150);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        if (unsubscribeFirestore) unsubscribeFirestore();
      };
    } else {
      loadFromLocalStorage();
    }

    function loadFromLocalStorage() {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed: SavedCollectionItem[] = JSON.parse(stored);
          const sanitized = parsed.map((item) => ({
            ...item,
            frontPreview: item.frontPreview?.startsWith("blob:") ? undefined : item.frontPreview,
            backPreview: item.backPreview?.startsWith("blob:") ? undefined : item.backPreview,
          }));
          setSavedCards(sanitized);
        } else {
          setSavedCards([]);
        }
      } catch (e) {
        console.error("Failed to load local storage collection:", e);
        setSavedCards([]);
      } finally {
        setIsLoaded(true);
      }
    }

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [uid, storageKey]);

  // Sync state to local cache
  const updateLocalCache = (items: SavedCollectionItem[]) => {
    setSavedCards(items);
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (e) {
      try {
        const lightweight = items.map((item, idx) =>
          idx < items.length - 15 ? { ...item, frontPreview: undefined, backPreview: undefined } : item
        );
        localStorage.setItem(storageKey, JSON.stringify(lightweight));
      } catch (err2) {
        // Ignore local cache error
      }
    }
  };

  const saveCard = async (item: CardItem): Promise<boolean> => {
    if (!item.data) return false;
    if (savedCards.some((c) => c.id === item.id)) return false;

    const frontPreview = await ensureDataUrl(item.frontPreview, item.frontFile);
    const backPreview = await ensureDataUrl(item.backPreview, item.backFile);

    const newItem: SavedCollectionItem = {
      id: item.id,
      prefix: item.prefix,
      batchId: item.batchId,
      batchName: item.batchName,
      frontPreview,
      backPreview,
      dateAdded: new Date().toISOString(),
      data: item.data,
    };

    if (uid) {
      try {
        await setDoc(doc(db, "users", uid, "cards", newItem.id), newItem);
      } catch (e) {
        console.error("Failed to save card to user Firestore collection:", e);
      }
    }

    const updated = [newItem, ...savedCards];
    updateLocalCache(updated);
    return true;
  };

  const saveBatch = async (items: CardItem[]): Promise<number> => {
    const validItems = items.filter((item) => item.data && !savedCards.some((c) => c.id === item.id));

    if (validItems.length === 0) return 0;

    const newSavedItems: SavedCollectionItem[] = await Promise.all(
      validItems.map(async (item) => {
        const frontPreview = await ensureDataUrl(item.frontPreview, item.frontFile);
        const backPreview = await ensureDataUrl(item.backPreview, item.backFile);
        return {
          id: item.id,
          prefix: item.prefix,
          batchId: item.batchId,
          batchName: item.batchName,
          frontPreview,
          backPreview,
          dateAdded: new Date().toISOString(),
          data: item.data!,
        };
      })
    );

    if (uid) {
      try {
        const batch = writeBatch(db);
        newSavedItems.forEach((savedItem) => {
          batch.set(doc(db, "users", uid, "cards", savedItem.id), savedItem);
        });
        await batch.commit();
      } catch (e) {
        console.error("Failed to save card batch to user Firestore collection:", e);
      }
    }

    const updated = [...newSavedItems, ...savedCards];
    updateLocalCache(updated);
    return newSavedItems.length;
  };

  const removeCard = async (id: string) => {
    if (uid) {
      try {
        await deleteDoc(doc(db, "users", uid, "cards", id));
      } catch (e) {
        console.error("Failed to delete card from user Firestore collection:", e);
      }
    }

    const updated = savedCards.filter((c) => c.id !== id);
    updateLocalCache(updated);
  };

  const clearCollection = async () => {
    if (uid) {
      try {
        const batch = writeBatch(db);
        savedCards.forEach((c) => {
          batch.delete(doc(db, "users", uid, "cards", c.id));
        });
        await batch.commit();
      } catch (e) {
        console.error("Failed to clear user Firestore collection:", e);
      }
    }

    updateLocalCache([]);
  };

  const updateSavedCardData = async (id: string, data: CDPCardSchema) => {
    const target = savedCards.find((c) => c.id === id);
    if (!target) return;

    const updatedItem = { ...target, data };

    if (uid) {
      try {
        await setDoc(doc(db, "users", uid, "cards", id), updatedItem);
      } catch (e) {
        console.error("Failed to update card in user Firestore collection:", e);
      }
    }

    const updated = savedCards.map((c) => (c.id === id ? updatedItem : c));
    updateLocalCache(updated);
  };

  const updateSavedCardDataBatch = async (updates: { id: string; data: CDPCardSchema }[]) => {
    const updateMap = new Map(updates.map((u) => [u.id, u.data]));

    const updated = savedCards.map((c) => {
      const newData = updateMap.get(c.id);
      return newData ? { ...c, data: newData } : c;
    });

    if (uid) {
      try {
        const batch = writeBatch(db);
        updates.forEach(({ id, data }) => {
          const existing = savedCards.find((c) => c.id === id);
          if (existing) {
            batch.set(doc(db, "users", uid, "cards", id), { ...existing, data });
          }
        });
        await batch.commit();
      } catch (e) {
        console.error("Failed to update batch in user Firestore collection:", e);
      }
    }

    updateLocalCache(updated);
  };

  const isSaved = (id: string) => {
    return savedCards.some((c) => c.id === id);
  };

  return {
    savedCards,
    isLoaded,
    saveCard,
    saveBatch,
    updateSavedCardData,
    updateSavedCardDataBatch,
    removeCard,
    clearCollection,
    isSaved,
  };
}
