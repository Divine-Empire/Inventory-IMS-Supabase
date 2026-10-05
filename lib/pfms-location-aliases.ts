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

// PFMS's NEW "CG Godown" dropdown (captured at Material Received only, see
// pfms_material-received.godownLocation) -> our CG sub-godown codes. Kept
// separate from PFMS_LOCATION_ALIASES above, which resolves the INDENT's
// top-level "Wharehouse" field (unchanged, still CG/NE/MANIQUIP/HO-shaped).
export const PFMS_GODOWN_ALIASES: Record<string, string> = {
  WAREHOUSE: "CG-WAREHOUSE",
  MANIQUIP: "MANIQUIP",
  "SERVICE INBOUND": "CG-SERVICE-INBOUND",
  "HEAD OFFICE": "HO",
};

export function resolvePfmsGodownCode(rawGodownLocation: string | null | undefined): string | null {
  const key = (rawGodownLocation || "").trim().toUpperCase();
  return PFMS_GODOWN_ALIASES[key] ?? null;
}
