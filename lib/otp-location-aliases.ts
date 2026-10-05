// OTP's otp_pre_invoice_queue.dispatch_location free-text dropdown values,
// normalized -> our fixed location codes. "Direct Dispatch" (and a blank
// value) have no corresponding physical warehouse, so they resolve to null
// — sales dispatched that way are honestly recorded as location-unknown
// rather than guessed into one of the 4 warehouses.
export const OTP_DISPATCH_LOCATION_ALIASES: Record<string, string> = {
  "BY N.E WAREHOUSE": "NE",
  "BY C.G.WAREHOUSE": "CG",
  "BY HEAD OFFICE": "HO",
  "MANIQUIP STORE": "MANIQUIP",
};

export function resolveOtpDispatchLocationCode(rawDispatchLocation: string | null | undefined): string | null {
  const key = (rawDispatchLocation || "").trim().toUpperCase();
  return OTP_DISPATCH_LOCATION_ALIASES[key] ?? null;
}

// OTP's NEW "sub_godown" dropdown (captured at Packing List, see
// otp_pre_invoice_queue.sub_godown) -> our CG sub-godown codes. Kept
// separate from OTP_DISPATCH_LOCATION_ALIASES above, which resolves
// `dispatch_location` (unchanged, still set later at Pre-Invoice).
export const OTP_SUB_GODOWN_ALIASES: Record<string, string> = {
  WAREHOUSE: "CG-WAREHOUSE",
  MANIQUIP: "MANIQUIP",
  "SERVICE INBOUND": "CG-SERVICE-INBOUND",
  "HEAD OFFICE": "HO",
};

export function resolveOtpSubGodownCode(rawSubGodown: string | null | undefined): string | null {
  const key = (rawSubGodown || "").trim().toUpperCase();
  return OTP_SUB_GODOWN_ALIASES[key] ?? null;
}
