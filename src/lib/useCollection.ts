"use client";

import { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { fileToOptimizedBase64, compressBase64DataUrl } from "@/lib/imageOptimizer";

const STORAGE_KEY = "card_id_online_collection_v1";

/**
 * Converts blob: URLs or File instances to permanent compact base64 Data URLs
 * to ensure images fit safely within localStorage quota (5MB limit).
 */
async function ensureDataUrl(preview?: string, file?: File | null): Promise<string | undefined> {
  if (!preview) return undefined;

  if (file) {
    try {
      // Use compact 350px max dimension for localStorage thumbnails (~15KB per image)
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

  // Load from localStorage on mount and sanitize broken blob URLs
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: SavedCollectionItem[] = JSON.parse(stored);
        // Clean out invalid blob: URLs from previous sessions if any exist
        const sanitized = parsed.map((item) => ({
          ...item,
          frontPreview: item.frontPreview?.startsWith("blob:") ? undefined : item.frontPreview,
          backPreview: item.backPreview?.startsWith("blob:") ? undefined : item.backPreview,
        }));
        setSavedCards(sanitized);
      }
    } catch (e) {
      console.error("Failed to load collection from localStorage:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Multi-tiered Storage updater helper with QuotaExceededError recovery
  const updateStorage = (updated: SavedCollectionItem[]) => {
    setSavedCards(updated);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("localStorage quota exceeded. Executing multi-tiered storage recovery...", e);

      // Attempt 1: Strip image previews from older cards while preserving ALL CDP card metadata & prices
      const lightweight = updated.map((item, idx) => {
        // Retain preview thumbnails only for the 15 most recently added cards
        if (idx < updated.length - 15) {
          return {
            ...item,
            frontPreview: undefined,
            backPreview: undefined,
          };
        }
        return item;
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
        console.log("Successfully saved collection using lightweight storage format.");
      } catch (err2) {
        // Attempt 2: Clear all image previews, guaranteeing 100% of metadata, player names & valuations fit safely
        const metadataOnly = updated.map((item) => ({
          ...item,
          frontPreview: undefined,
          backPreview: undefined,
        }));

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(metadataOnly));
          console.log("Saved collection metadata successfully (image previews cleared to preserve quota).");
        } catch (err3) {
          console.error("Critical localStorage quota failure:", err3);
        }
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

    const updated = [newItem, ...savedCards];
    updateStorage(updated);
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

    const updated = [...newSavedItems, ...savedCards];
    updateStorage(updated);
    return newSavedItems.length;
  };

  const removeCard = (id: string) => {
    const updated = savedCards.filter((c) => c.id !== id);
    updateStorage(updated);
  };

  const clearCollection = () => {
    updateStorage([]);
  };

  const updateSavedCardData = (id: string, data: CDPCardSchema) => {
    const updated = savedCards.map((c) => (c.id === id ? { ...c, data } : c));
    updateStorage(updated);
  };

  const updateSavedCardDataBatch = (updates: { id: string; data: CDPCardSchema }[]) => {
    const updateMap = new Map(updates.map((u) => [u.id, u.data]));
    const updated = savedCards.map((c) => {
      const newData = updateMap.get(c.id);
      return newData ? { ...c, data: newData } : c;
    });
    updateStorage(updated);
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
