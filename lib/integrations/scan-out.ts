import { getSupabaseAdmin } from "@/lib/supabase";
import { resolvePfmsLocationCode } from "@/lib/pfms-location-aliases";

export class ScanOutIntegrationError extends Error {}

export type ScanOutRequest = {
  serialNo: string;
  /** Either one of our own codes (CG/NE/MANIQUIP/HO) or the raw label OTP's
   * own warehouse-location dropdown uses ("C.G Warehouse", "NE Warehouse",
   * "Maniquip Store", "Head Office") — resolved via the same alias table
   * the PFMS sync jobs use, so OTP doesn't need to know our internal codes. */
  locationCode: string;
  itemCode?: string;
  itemName?: string;
  qty?: number;
  source?: string; // e.g. "otp-check-inventory" | "otp-pre-invoice"
  referenceNo?: string; // OTP order number / invoice number, for traceability
};

export type ScanOutResult = {
  matched: boolean;
  alreadyOut: boolean;
  alert: string | null;
};

function expiryKey(s: { warrantyExpiryDate: string | null; invoiceDate: string | null }): string {
  return s.warrantyExpiryDate ?? s.invoiceDate ?? "9999-12-31";
}

/**
 * Called live by OTP_Supabase when a serial is scanned at Check Inventory
 * or Pre-Invoice — this both answers "is older stock available?" (the
 * alert) AND immediately records the OUT event, so no separate polling
 * sync is needed for OUT data. IMS never blocks OTP's own dispatch flow;
 * it only reports back what it observed.
 */
export async function recordScanOut(req: ScanOutRequest): Promise<ScanOutResult> {
  const supabase = getSupabaseAdmin();
  const serialNo = req.serialNo.trim();
  if (!serialNo) throw new ScanOutIntegrationError("serialNo is required");

  const resolvedCode = resolvePfmsLocationCode(req.locationCode) ?? req.locationCode.trim().toUpperCase();

  const { data: location, error: locErr } = await supabase
    .from("ims_location_master")
    .select("id, locationCode")
    .eq("locationCode", resolvedCode)
    .maybeSingle();
  if (locErr) throw new Error(locErr.message);
  if (!location) throw new ScanOutIntegrationError(`Unknown location "${req.locationCode}"`);

  const { data: serial, error: serialErr } = await supabase
    .from("ims_serial_number")
    .select("*")
    .eq("serialNo", serialNo)
    .maybeSingle();
  if (serialErr) throw new Error(serialErr.message);

  const referenceType = req.source === "otp-pre-invoice" ? "OTP Pre-Invoice Dispatch" : "OTP Check Inventory Dispatch";

  // Case: IMS never saw this serial come IN (not yet synced from PFMS, a
  // Direct Entry serial, or genuinely unknown). Best effort: still record
  // it as OUT (using whatever item info OTP sent) so a future scan of the
  // SAME serial won't be silently treated as available.
  if (!serial) {
    const itemCode = req.itemCode ? await resolveItemCode(req.itemCode, req.itemName) : req.itemName ? await resolveItemCode(undefined, req.itemName) : null;

    if (itemCode) {
      const qty = req.qty ?? 1;
      const { data: ledgerEntry, error: ledgerErr } = await supabase
        .from("ims_stock_ledger")
        .insert({
          itemCode,
          locationId: location.id,
          txnType: "OUT",
          qty,
          serialNo,
          referenceType,
          referenceNo: req.referenceNo ?? null,
          remarks: "Best-effort — this serial was never recorded IN by IMS (not yet synced from PFMS, or untracked source)",
        })
        .select("id")
        .single();
      if (ledgerErr) throw new Error(ledgerErr.message);

      await supabase.from("ims_serial_number").insert({
        itemCode,
        serialNo,
        currentLocationId: null,
        status: "OUT",
        outTxnId: ledgerEntry.id,
      });
    }

    return {
      matched: false,
      alreadyOut: false,
      alert: "This serial was not previously tracked by IMS (recorded as best-effort OUT).",
    };
  }

  // Case: IMS already has this marked OUT/TRANSFERRED — the important
  // "duplicate/older-invoice stock" signal the original spec asked for.
  if (serial.status !== "IN_STOCK") {
    return {
      matched: true,
      alreadyOut: true,
      alert: `This serial was already dispatched earlier (current status: ${serial.status}). Please verify before proceeding.`,
    };
  }

  // FIFO / oldest-stock-first advisory.
  const { data: siblings, error: siblingsErr } = await supabase
    .from("ims_serial_number")
    .select("serialNo, warrantyExpiryDate, invoiceDate")
    .eq("itemCode", serial.itemCode)
    .eq("currentLocationId", serial.currentLocationId)
    .eq("status", "IN_STOCK");
  if (siblingsErr) throw new Error(siblingsErr.message);

  const sorted = [...(siblings || [])].sort((a, b) => (expiryKey(a) < expiryKey(b) ? -1 : expiryKey(a) > expiryKey(b) ? 1 : 0));
  const oldest = sorted[0];

  const alert =
    oldest && oldest.serialNo !== serial.serialNo
      ? `Older stock is available for this item: Serial "${oldest.serialNo}" (${
          oldest.warrantyExpiryDate ? "warranty expiry" : "invoice date"
        } ${(oldest.warrantyExpiryDate ?? oldest.invoiceDate)?.slice(0, 10)}). Consider dispatching that one first.`
      : null;

  const { data: ledgerEntry, error: ledgerErr } = await supabase
    .from("ims_stock_ledger")
    .insert({
      itemCode: serial.itemCode,
      locationId: serial.currentLocationId,
      txnType: "OUT",
      qty: 1,
      serialNo,
      referenceType,
      referenceNo: req.referenceNo ?? null,
    })
    .select("id")
    .single();
  if (ledgerErr) throw new Error(ledgerErr.message);

  const { error: updateErr } = await supabase
    .from("ims_serial_number")
    .update({ status: "OUT", outTxnId: ledgerEntry.id })
    .eq("serialNo", serialNo);
  if (updateErr) throw new Error(updateErr.message);

  return { matched: true, alreadyOut: false, alert };
}

async function resolveItemCode(itemCode?: string, itemName?: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  if (itemCode) {
    const { data } = await supabase.from("ims_item_master").select("itemCode").eq("itemCode", itemCode).maybeSingle();
    if (data) return data.itemCode;
  }

  if (itemName) {
    const { data } = await supabase
      .from("ims_item_master")
      .select("itemCode")
      .ilike("itemName", itemName.trim())
      .maybeSingle();
    if (data) return data.itemCode;
  }

  return null;
}
