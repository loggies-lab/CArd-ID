export function generateCdpTitle(card: {
  year?: number | string;
  setName?: string;
  brand?: string;
  cardNumber?: string;
  playerName?: string;
  subsetParallel?: string;
  isRookie?: boolean;
  isAutographed?: boolean;
  isMemorabilia?: boolean;
  isNumbered?: boolean;
  numberedTo?: string | number;
}): string {
  const parts: string[] = [];

  const yearStr = card.year ? String(card.year).trim() : '';

  // 1. Year & Set Name / Brand
  if (card.setName) {
    const setNameStr = card.setName.trim();
    // Prepend year if it isn't already at the start of setName
    if (yearStr && !setNameStr.startsWith(yearStr)) {
      parts.push(`${yearStr} ${setNameStr}`);
    } else {
      parts.push(setNameStr);
    }
  } else {
    if (yearStr) parts.push(yearStr);
    if (card.brand) parts.push(card.brand.trim());
  }

  // 2. Card Number with '#' (e.g., "#224" or "#BCV-166")
  if (card.cardNumber) {
    const cleanNum = String(card.cardNumber).replace(/^#/, '').trim();
    if (cleanNum) parts.push(`#${cleanNum}`);
  }

  // 3. Player Name
  const playerVal = card.playerName || (card as any).subject || (card as any).player;
  if (playerVal) {
    parts.push(String(playerVal).trim());
  }

  // 4. Subset / Parallel (Ignore if 'Base')
  if (card.subsetParallel && card.subsetParallel.trim().toLowerCase() !== 'base') {
    parts.push(card.subsetParallel.trim());
  }

  // 5. Special Attributes (RC, AUTO, MEM, /XX)
  if (card.isRookie) parts.push('RC');
  if (card.isAutographed) parts.push('AUTO');
  if (card.isMemorabilia) parts.push('PATCH');
  if (card.isNumbered && card.numberedTo) parts.push(`/${card.numberedTo}`);

  return parts.join(' ');
}
