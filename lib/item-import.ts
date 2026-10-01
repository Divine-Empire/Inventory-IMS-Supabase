export const LOCATIONS = [
  { code: "CG", name: "CG" },
  { code: "NE", name: "NE" },
  { code: "MANIQUIP", name: "Maniquip" },
  { code: "HO", name: "Head Office" },
] as const;

export const LOCATION_CODES = LOCATIONS.map((l) => l.code);

export const ITEM_IMPORT_HEADERS = [
  "GROUP",
  "CATEGORY",
  "ITEM CODE",
  "NAME OF ITEM",
  "IMAGE",
  "LOCATION",
  "AVG SALE (PEAK)",
  "MAX LEVEL",
  "MAX LEVEL (PEAK)",
  "LIVE STOCK",
] as const;

export type ItemImportRow = {
  group: string;
  category: string;
  itemCode: string;
  itemName: string;
  imageUrl: string;
  locationCode: string;
  avgSalePeak: number | null;
  maxLevel: number | null;
  maxLevelPeak: number | null;
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
      avgSalePeak: toNumberOrNull(raw["AVG SALE (PEAK)"]),
      maxLevel: toNumberOrNull(raw["MAX LEVEL"]),
      maxLevelPeak: toNumberOrNull(raw["MAX LEVEL (PEAK)"]),
      liveStock: toNumberOrNull(raw["LIVE STOCK"]),
    },
    error: null,
  };
}
