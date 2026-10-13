import { resolveGodownCode } from "@/lib/godown-codes";

// PFMS's warehouseLocation free-text values, normalized -> our fixed
// location codes. "C.G Warehosue" is a real typo present in PFMS's live
// data (verified against pfms_for_ims), kept here deliberately.
//
// All three CG spellings resolve to the Warehouse-CG GODOWN (CG-WAREHOUSE),
// not the bare "CG" parent: that's where the opening stock and the item
// location settings live, so serials, indents and lead times must land on the
// same row. ("Main Warehouse" is the same place — confirmed by the owner.)
export const PFMS_LOCATION_ALIASES: Record<string, string> = {
  "NE WAREHOUSE": "NE",
  "MANIQUIP STORE": "MANIQUIP",
  "C.G WAREHOUSE": "CG-WAREHOUSE",
  "C.G WAREHOSUE": "CG-WAREHOUSE",
  "MAIN WAREHOUSE": "CG-WAREHOUSE",
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
// Accepts both the first 4-value godown dropdown and the 5-label one — see
// lib/godown-codes.ts. A bare "CG" is rejected here (it's not a godown pick).
export function resolvePfmsGodownCode(rawGodownLocation: string | null | undefined): string | null {
  const code = resolveGodownCode(rawGodownLocation);
  return code === "CG" ? null : code;
}
