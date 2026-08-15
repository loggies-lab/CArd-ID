import Papa from "papaparse";
import { CardItem, SavedCollectionItem } from "@/types/card";

/**
 * Formats identified sports cards into a Card Dealer Pro (CDP) / Shopify compliant CSV file.
 */
export function exportCardsToCSV(items: CardItem[], customFilename = "cdp_card_inventory_export.csv") {
  const exportData = items.map((item) => {
    const card = item.data;
    return {
      "Prefix / ID": item.prefix,
      "Card Number": card?.cardNumber || "",
      "Player Name": card?.playerName || (card as any)?.subject || (card as any)?.player || "",
      "Set Name": card?.setName || "",
      "Brand": card?.brand || (card as any)?.publisher || "",
      "Subset / Parallel": card?.subsetParallel || "",
      "Team": card?.team || "",
      "Sport": card?.sport || "",
      "Year": card?.year || "",
      "Rookie": card?.isRookie ? "Yes" : "No",
      "Autograph": card?.isAutographed ? "Yes" : "No",
      "Memorabilia": card?.isMemorabilia ? "Yes" : "No",
      "Numbered": card?.isNumbered ? "Yes" : "No",
      "Front Image Filename": item.frontFile?.name || "",
      "Back Image Filename": item.backFile?.name || "",
      "Pair Status": item.isUnpaired ? "Unpaired" : "Paired",
      "Identification Status": item.status === "success" ? "Identified" : item.status,
    };
  });

  const csv = Papa.unparse(exportData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", customFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats saved online collection items into a CDP compliant CSV file.
 */
export function exportSavedCollectionToCSV(items: SavedCollectionItem[], customFilename = "cdp_online_collection_export.csv") {
  const exportData = items.map((item) => {
    const card = item.data;
    return {
      "Prefix / ID": item.prefix,
      "Card Number": card.cardNumber || "",
      "Player Name": card.playerName || "",
      "Set Name": card.setName || "",
      "Brand": card.brand || "",
      "Subset / Parallel": card.subsetParallel || "",
      "Team": card.team || "",
      "Sport": card.sport || "",
      "Year": card.year || "",
      "Rookie": card.isRookie ? "Yes" : "No",
      "Autograph": card.isAutographed ? "Yes" : "No",
      "Memorabilia": card.isMemorabilia ? "Yes" : "No",
      "Numbered": card.isNumbered ? "Yes" : "No",
      "Date Added": item.dateAdded ? new Date(item.dateAdded).toLocaleString() : "",
      "Notes": item.notes || "",
    };
  });

  const csv = Papa.unparse(exportData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", customFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
