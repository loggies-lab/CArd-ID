"use client";

import { useState, useEffect } from "react";
import { CardItem, SavedCollectionItem } from "@/types/card";

const STORAGE_KEY = "card_id_online_collection_v1";

export function useCollection() {
  const [savedCards, setSavedCards] = useState<SavedCollectionItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedCards(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load collection from localStorage:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save helper
  const updateStorage = (updated: SavedCollectionItem[]) => {
    setSavedCards(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save collection to localStorage:", e);
    }
  };

  const saveCard = (item: CardItem): boolean => {
    if (!item.data) return false;
    if (savedCards.some((c) => c.id === item.id)) return false;

    const newItem: SavedCollectionItem = {
      id: item.id,
      prefix: item.prefix,
      frontPreview: item.frontPreview,
      backPreview: item.backPreview,
      dateAdded: new Date().toISOString(),
      data: item.data,
    };

    updateStorage([newItem, ...savedCards]);
    return true;
  };

  const saveBatch = (items: CardItem[]): number => {
    const validItems = items.filter((i) => i.status === "success" && i.data);
    let addedCount = 0;
    const newItems: SavedCollectionItem[] = [...savedCards];

    for (const item of validItems) {
      if (!newItems.some((c) => c.id === item.id) && item.data) {
        newItems.unshift({
          id: item.id,
          prefix: item.prefix,
          frontPreview: item.frontPreview,
          backPreview: item.backPreview,
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

  const isSaved = (id: string) => {
    return savedCards.some((c) => c.id === id);
  };

  return {
    savedCards,
    isLoaded,
    saveCard,
    saveBatch,
    removeCard,
    clearCollection,
    isSaved,
  };
}
