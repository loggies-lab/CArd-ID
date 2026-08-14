export interface CDPCardSchema {
  playerName: string;
  brand: string;
  setName: string;
  cardNumber: string;
  subsetParallel: string;
  team: string;
  sport: string;
  year: number;
  isRookie: boolean;
  isAutographed: boolean;
  isMemorabilia: boolean;
  isNumbered: boolean;
  numberedTo?: string;
  condition?: "Raw" | "Graded";
  gradingCompany?: "None" | "PSA" | "BGS" | "SGC" | "CGC" | string;
  grade?: string;
  location?: string;
  estimatedValue?: number;
  valueLastUpdated?: string;
}

export interface CardItem {
  id: string;
  prefix: string;
  frontFile: File | null;
  backFile: File | null;
  frontPreview?: string;
  backPreview?: string;
  isUnpaired: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  data?: CDPCardSchema;
}

export interface SavedCollectionItem {
  id: string;
  prefix: string;
  frontPreview?: string;
  backPreview?: string;
  dateAdded: string;
  notes?: string;
  data: CDPCardSchema;
}
