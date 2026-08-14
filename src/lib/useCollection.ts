"use client";

import { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem, CDPCardSchema } from "@/types/card";
import { fileToOptimizedBase64 } from "@/lib/imageOptimizer";

const STORAGE_KEY = "card_id_online_collection_v1";

/**
 * Converts blob: URLs or File instances to permanent base64 Data URLs
 * to ensure images persist across page refreshes.
 */
async function ensureDataUrl(preview?: string, file?: File | null): Promise<string | undefined> {
  if (!preview) return undefined;
  if (preview.startsWith("data:")) return preview;

  if (file) {
    try {
      return await fileToOptimizedBase64(file, 800, 0.85);
    } catch (e) {
      console.error("Failed to convert File to base64 Data URL:", e);
    }
  }

  if (preview.startsWith("blob:")) {
    try {
      const response = await fetch(preview);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
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

  // Storage updater helper
  const updateStorage = (updated: SavedCollectionItem[]) => {
    setSavedCards(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save collection to localStorage:", e);
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

    updateStorage([newItem, ...savedCards]);
    return true;
  };

  const saveBatch = async (items: CardItem[]): Promise<number> => {
    const validItems = items.filter((i) => i.status === "success" && i.data);
    let addedCount = 0;
    const newItems: SavedCollectionItem[] = [...savedCards];

    for (const item of validItems) {
      if (!newItems.some((c) => c.id === item.id) && item.data) {
        const frontPreview = await ensureDataUrl(item.frontPreview, item.frontFile);
        const backPreview = await ensureDataUrl(item.backPreview, item.backFile);

        newItems.unshift({
          id: item.id,
          prefix: item.prefix,
          frontPreview,
          backPreview,
          dateAdded: new Date().toISOString(),
          data: item.data,
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      updateStorage(newItems);
    }

    return addedCount;
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
