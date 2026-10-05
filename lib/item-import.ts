export const LOCATIONS = [
  { code: "CG", name: "CG" },
  { code: "NE", name: "NE" },
  { code: "WB", name: "West Bengal" },
  { code: "OD", name: "Odisha" },
  { code: "CG-WAREHOUSE", name: "Warehouse" },
  { code: "MANIQUIP", name: "Maniquip" },
  { code: "CG-SERVICE-INBOUND", name: "Service Inbound" },
  { code: "HO", name: "Head Office" },
] as const;

export const LOCATION_CODES = LOCATIONS.map((l) => l.code);

// MAX LEVEL / MAX LEVEL (PEAK) / AVG SALE (PEAK) are no longer imported from
// CSV — they're system-calculated (see lib/max-level-calc.ts) from actual
// sales history + lead time via the "Max Level" button on the Inventory page.
export const ITEM_IMPORT_HEADERS = [
  "GROUP",
  "CATEGORY",
  "ITEM CODE",
  "NAME OF ITEM",
  "IMAGE",
  "LOCATION",
  "LIVE STOCK",
] as const;

export type ItemImportRow = {
  group: string;
  category: string;
  itemCode: string;
  itemName: string;
  imageUrl: string;
  locationCode: string;
  liveStock: number | null;
};

function toNumberOrNull(val: string | undefined): number | null {
  if (val === undefined || val === null || val.trim() === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/** Maps a papaparse header-keyed row into a typed ItemImportRow. Returns
 * null (with an error message) if a required column is missing/invalid. */
export function parseItemImportRow(
  raw: Record<string, string>,
  rowNumber: number
): { row: ItemImportRow | null; error: string | null } {
  const itemCode = (raw["ITEM CODE"] || "").trim();
  const itemName = (raw["NAME OF ITEM"] || "").trim();
  const locationCode = (raw["LOCATION"] || "").trim().toUpperCase();

  if (!itemCode) return { row: null, error: `Row ${rowNumber}: ITEM CODE is required` };
  if (!itemName) return { row: null, error: `Row ${rowNumber}: NAME OF ITEM is required` };
  if (!locationCode) return { row: null, error: `Row ${rowNumber}: LOCATION is required` };
  if (!LOCATION_CODES.includes(locationCode as (typeof LOCATION_CODES)[number])) {
    return {
      row: null,
      error: `Row ${rowNumber}: LOCATION "${raw["LOCATION"]}" must be one of ${LOCATION_CODES.join(", ")}`,
    };
  }

  return {
    row: {
      group: (raw["GROUP"] || "").trim(),
      category: (raw["CATEGORY"] || "").trim(),
      itemCode,
      itemName,
      imageUrl: (raw["IMAGE"] || "").trim(),
      locationCode,
      liveStock: toNumberOrNull(raw["LIVE STOCK"]),
    },
    error: null,
  };
}
