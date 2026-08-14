"use client";

import { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { fileToOptimizedBase64, compressBase64DataUrl } from "@/lib/imageOptimizer";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";

const LOCAL_STORAGE_KEY = "card_id_online_collection_v1";

/**
 * Converts blob: URLs or File instances to permanent compact base64 Data URLs
 * to ensure preview thumbnails remain lightweight.
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
  const [savedCards, setSavedCards] = useState<SavedCollectionItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Real-time Cloud Firestore Listener & Sync + localStorage Fallback
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    try {
      // Connect real-time Firestore listener to collection/
      const colRef = collection(db, "collection");
      unsubscribeFirestore = onSnapshot(
        colRef,
        (snapshot) => {
          const cloudCards: SavedCollectionItem[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as SavedCollectionItem;
            cloudCards.push({
              ...data,
              id: docSnap.id,
            });
          });

          // Sort by dateAdded descending
          cloudCards.sort(
            (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
          );

          setSavedCards(cloudCards);
          setIsLoaded(true);

          // Update local cache
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudCards));
          } catch (e) {
            // Ignore quota errors on cache update since Firestore is the primary cloud source
          }
        },
        (error) => {
          console.warn("Firestore listener error, falling back to local storage cache:", error);
          loadFromLocalStorage();
        }
      );
    } catch (err) {
      console.warn("Firestore initialization error, falling back to local storage:", err);
      loadFromLocalStorage();
    }

    function loadFromLocalStorage() {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed: SavedCollectionItem[] = JSON.parse(stored);
          const sanitized = parsed.map((item) => ({
            ...item,
            frontPreview: item.frontPreview?.startsWith("blob:") ? undefined : item.frontPreview,
            backPreview: item.backPreview?.startsWith("blob:") ? undefined : item.backPreview,
          }));
          setSavedCards(sanitized);
        }
      } catch (e) {
        console.error("Failed to load local storage collection fallback:", e);
      } finally {
        setIsLoaded(true);
      }
    }

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []);

  // Sync to Cloud Firestore + Local Cache
  const saveCardToCloudAndLocal = async (items: SavedCollectionItem[]) => {
    setSavedCards(items);

    // 1. Save to Local Storage Cache
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // Quota exceeded fallback for local cache
      try {
        const lightweight = items.map((item, idx) =>
          idx < items.length - 15 ? { ...item, frontPreview: undefined, backPreview: undefined } : item
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lightweight));
      } catch (err2) {
        // Ignore local cache error since Cloud Firestore persists all data
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
      frontPreview,
      backPreview,
      dateAdded: new Date().toISOString(),
      data: item.data,
    };

    // Save to Cloud Firestore
    try {
      await setDoc(doc(db, "collection", newItem.id), newItem);
    } catch (e) {
      console.error("Failed to save card to Cloud Firestore:", e);
    }

    const updated = [newItem, ...savedCards];
    await saveCardToCloudAndLocal(updated);
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
          frontPreview,
          backPreview,
          dateAdded: new Date().toISOString(),
          data: item.data!,
        };
      })
    );

    // Save batch to Cloud Firestore using WriteBatch
    try {
      const batch = writeBatch(db);
      newSavedItems.forEach((savedItem) => {
        batch.set(doc(db, "collection", savedItem.id), savedItem);
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to save batch to Cloud Firestore:", e);
    }

    const updated = [...newSavedItems, ...savedCards];
    await saveCardToCloudAndLocal(updated);
    return newSavedItems.length;
  };

  const removeCard = async (id: string) => {
    try {
      await deleteDoc(doc(db, "collection", id));
    } catch (e) {
      console.error("Failed to delete card from Cloud Firestore:", e);
    }

    const updated = savedCards.filter((c) => c.id !== id);
    await saveCardToCloudAndLocal(updated);
  };

  const clearCollection = async () => {
    try {
      const batch = writeBatch(db);
      savedCards.forEach((c) => {
        batch.delete(doc(db, "collection", c.id));
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to clear Cloud Firestore collection:", e);
    }

    await saveCardToCloudAndLocal([]);
  };

  const updateSavedCardData = async (id: string, data: CDPCardSchema) => {
    const target = savedCards.find((c) => c.id === id);
    if (!target) return;

    const updatedItem = { ...target, data };

    try {
      await setDoc(doc(db, "collection", id), updatedItem);
    } catch (e) {
      console.error("Failed to update card in Cloud Firestore:", e);
    }

    const updated = savedCards.map((c) => (c.id === id ? updatedItem : c));
    await saveCardToCloudAndLocal(updated);
  };

  const updateSavedCardDataBatch = async (updates: { id: string; data: CDPCardSchema }[]) => {
    const updateMap = new Map(updates.map((u) => [u.id, u.data]));

    const updated = savedCards.map((c) => {
      const newData = updateMap.get(c.id);
      return newData ? { ...c, data: newData } : c;
    });

    try {
      const batch = writeBatch(db);
      updates.forEach(({ id, data }) => {
        const existing = savedCards.find((c) => c.id === id);
        if (existing) {
          batch.set(doc(db, "collection", id), { ...existing, data });
        }
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to update batch in Cloud Firestore:", e);
    }

    await saveCardToCloudAndLocal(updated);
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
