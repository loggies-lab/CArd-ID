import { CardItem } from "@/types/card";

/**
 * Parses a list of files and pairs them using filename ID prefixes.
 * Examples:
 * - TCS-00000001-front.jpg + TCS-00000001-back.jpg -> Paired (Prefix: TCS-00000001)
 * - CARD_102_F.PNG + CARD_102_B.PNG -> Paired (Prefix: CARD_102)
 * - IMG_8888_front.jpeg + IMG_8888_back.jpeg -> Paired (Prefix: IMG_8888)
 * - TCS-00000002-front.jpg alone -> Unpaired Card
 */
export function parseAndPairFiles(newFiles: File[], existingItems: CardItem[] = []): CardItem[] {
  // Regex pattern to extract prefix and side indicator
  const sidePattern = /[-_ ]*(front|back|f|b|1|2)[-_ ]*$/i;

  const groupMap = new Map<string, { front?: File; back?: File; rawPrefix: string }>();

  for (const file of newFiles) {
    const filenameNoExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    let side: 'front' | 'back' | 'unknown' = 'unknown';

    // Check if filename ends with side indicator
    const match = filenameNoExt.match(sidePattern);
    let prefix = filenameNoExt;

    if (match) {
      const sideStr = match[1].toLowerCase();
      prefix = filenameNoExt.replace(sidePattern, '').trim();

      if (['front', 'f', '1'].includes(sideStr)) {
        side = 'front';
      } else if (['back', 'b', '2'].includes(sideStr)) {
        side = 'back';
      }
    }

    // Clean up trailing separators in prefix
    prefix = prefix.replace(/[-_ ]+$/, '').trim() || filenameNoExt;
    const key = prefix.toLowerCase();

    const group = groupMap.get(key) || { rawPrefix: prefix };

    if (side === 'front') {
      if (!group.front) group.front = file;
      else if (!group.back) group.back = file;
    } else if (side === 'back') {
      if (!group.back) group.back = file;
      else if (!group.front) group.front = file;
    } else {
      if (!group.front) group.front = file;
      else if (!group.back) group.back = file;
    }

    groupMap.set(key, group);
  }

  const resultItems: CardItem[] = [...existingItems];

  groupMap.forEach((group, key) => {
    // Check if prefix already exists in existing items to pair with
    const existingIndex = resultItems.findIndex(i => i.prefix.toLowerCase() === key);

    if (existingIndex >= 0) {
      const existing = resultItems[existingIndex];
      const updatedFront = existing.frontFile || group.front || null;
      const updatedBack = existing.backFile || group.back || null;
      const isUnpaired = !updatedFront || !updatedBack;

      resultItems[existingIndex] = {
        ...existing,
        frontFile: updatedFront,
        backFile: updatedBack,
        frontPreview: updatedFront ? URL.createObjectURL(updatedFront) : existing.frontPreview,
        backPreview: updatedBack ? URL.createObjectURL(updatedBack) : existing.backPreview,
        isUnpaired,
      };
    } else {
      const isUnpaired = !group.front || !group.back;
      resultItems.push({
        id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        prefix: group.rawPrefix,
        frontFile: group.front || null,
        backFile: group.back || null,
        frontPreview: group.front ? URL.createObjectURL(group.front) : undefined,
        backPreview: group.back ? URL.createObjectURL(group.back) : undefined,
        isUnpaired,
        status: 'idle',
      });
    }
  });

  return resultItems;
}
