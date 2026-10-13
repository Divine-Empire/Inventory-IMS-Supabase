// The 5 physical godowns every system now agrees on. `label` is the exact
// text stored by OTP (otp_users.location / otp_orders.order_location) and by
// PFMS (pfms_User.defaultGodown / godownLocation) — see OTP_Supabase's
// lib/locations.ts, which this mirrors. `code` is ims_location_master's
// locationCode.
export const GODOWNS = [
  { label: "Warehouse-CG", code: "CG-WAREHOUSE" },
  { label: "Head-Office-CG", code: "HO" },
  { label: "Service-Inbound-CG", code: "CG-SERVICE-INBOUND" },
  { label: "Maniquip-CG", code: "MANIQUIP" },
  { label: "Warehouse-NE", code: "NE" },
] as const;

// PFMS's first godown dropdown (Material Received, before the 5-label
// rollout) only had these 4 CG values — rows saved with them stay valid.
const LEGACY_PFMS_GODOWN_VALUES: Record<string, string> = {
  WAREHOUSE: "CG-WAREHOUSE",
  MANIQUIP: "MANIQUIP",
  "SERVICE INBOUND": "CG-SERVICE-INBOUND",
  "HEAD OFFICE": "HO",
};

const BY_KEY = new Map<string, string>();
for (const g of GODOWNS) {
  BY_KEY.set(g.label.toUpperCase(), g.code);
  BY_KEY.set(g.code.toUpperCase(), g.code);
}
for (const [k, v] of Object.entries(LEGACY_PFMS_GODOWN_VALUES)) BY_KEY.set(k, v);
// Plain parent codes are valid locations too (stock that predates the
// sub-godown split sits on "CG").
BY_KEY.set("CG", "CG");

/** Any accepted spelling (label, IMS code, legacy PFMS value) -> IMS locationCode, or null. */
export function resolveGodownCode(raw: string | null | undefined): string | null {
  return BY_KEY.get((raw || "").trim().toUpperCase()) ?? null;
}
