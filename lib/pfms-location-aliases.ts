// PFMS's warehouseLocation free-text values, normalized -> our fixed
// location codes. "C.G Warehosue" is a real typo present in PFMS's live
// data (verified against pfms_for_ims), kept here deliberately.
export const PFMS_LOCATION_ALIASES: Record<string, string> = {
  "NE WAREHOUSE": "NE",
  "MANIQUIP STORE": "MANIQUIP",
  "C.G WAREHOUSE": "CG",
  "C.G WAREHOSUE": "CG",
  "HEAD OFFICE": "HO",
};

export function resolvePfmsLocationCode(rawWarehouseLocation: string | null | undefined): string | null {
  const key = (rawWarehouseLocation || "").trim().toUpperCase();
  return PFMS_LOCATION_ALIASES[key] ?? null;
}
