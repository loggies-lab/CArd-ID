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

  // 1. Year & Set Name (e.g., "2025-26 Topps Chrome" or "1991 Upper Deck")
  if (card.setName) {
    parts.push(card.setName);
  } else {
    if (card.year) parts.push(String(card.year));
    if (card.brand) parts.push(card.brand);
  }

  // 2. Card Number with '#' (e.g., "#224" or "#BCV-166")
  if (card.cardNumber) {
    const cleanNum = String(card.cardNumber).replace(/^#/, '');
    parts.push(`#${cleanNum}`);
  }

  // 3. Player Name
  if (card.playerName) {
    parts.push(card.playerName);
  }

  // 4. Subset / Parallel (Ignore if 'Base')
  if (card.subsetParallel && card.subsetParallel.toLowerCase() !== 'base') {
    parts.push(card.subsetParallel);
  }

  // 5. Special Attributes (RC, AUTO, MEM, /XX)
  if (card.isRookie) parts.push('RC');
  if (card.isAutographed) parts.push('AUTO');
  if (card.isMemorabilia) parts.push('PATCH');
  if (card.isNumbered && card.numberedTo) parts.push(`/${card.numberedTo}`);

  return parts.join(' ');
}
