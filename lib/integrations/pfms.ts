import { getSupabaseAdmin, fetchAllRowsIn } from "@/lib/supabase";
import { resolveGodownCode } from "@/lib/godown-codes";
import { resolvePfmsGodownCode, resolvePfmsLocationCode } from "@/lib/pfms-location-aliases";
import { IntegrationError } from "@/lib/integrations/http";

// PFMS -> IMS live movements. PFMS's own API routes call these right after
// a Material Received / Purchase Return is saved; the existing Sync buttons
// run the same logic as a fallback. Every function is idempotent (keyed by
// the PFMS row), so a retry or a Sync click can never double-count.
//
//   Material Received  -> IN  (received qty, at the receiving user's godown)
//   Serial Generation  -> serials attach to that receipt's godown, no extra
//                         qty (see sync-pfms-serials.ts)
//   Purchase Return    -> negative ADJUSTMENT (kept off "OUT" on purpose:
//                         Fast/Slow/Non-Moving status counts OUT only, and a
//                         vendor return isn't sales movement)

export const RECEIPT_REF = "PFMS Material Received";
export const LEGACY_SERIAL_REF = "PFMS Serial Generation";
export const RETURN_REF = "PFMS Purchase Return";

async function liftContext(liftNo: string) {
  const supabase = getSupabaseAdmin();
  const { data: lift } = await supabase.from("pfms_lift").select("liftNo, indentNo").eq("liftNo", liftNo).maybeSingle();
  if (!lift) throw new IntegrationError(`Unknown lift "${liftNo}"`);
  const { data: indent } = await supabase
    .from("pfms_indent_generation")
    .select("indentNo, itemCode, warehouseLocation")
    .eq("indentNo", lift.indentNo)
    .maybeSingle();
  if (!indent) throw new IntegrationError(`No indent found for lift "${liftNo}"`);

  let itemCode: string | null = null;
  if (indent.itemCode) {
    const { data: item } = await supabase.from("ims_item_master").select("itemCode").eq("itemCode", indent.itemCode).maybeSingle();
    itemCode = item?.itemCode ?? null;
  }
  return { indent, itemCode };
}

async function locationIdByCode(code: string | null): Promise<{ id: string; locationCode: string } | null> {
  if (!code) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("ims_location_master").select("id, locationCode").eq("locationCode", code).maybeSingle();
  return data ?? null;
}

/** IN for a received lift, at the godown the receiving user manages. */
export async function recordReceiptIn(params: { liftNo: string; locationCode?: string | null }) {
  const supabase = getSupabaseAdmin();
  const liftNo = (params.liftNo || "").trim();
  if (!liftNo) throw new IntegrationError("liftNo is required");

  const { indent, itemCode } = await liftContext(liftNo);
  const { data: mr } = await supabase
    .from("pfms_material-received")
    .select("liftNo, receivedQty, godownLocation")
    .eq("liftNo", liftNo)
    .maybeSingle();
  if (!mr) throw new IntegrationError(`No Material Received entry for lift "${liftNo}"`);

  if (!itemCode) return { liftNo, recorded: false, skipped: "ITEM_NOT_IN_IMS" };
  if (!(mr.receivedQty > 0)) return { liftNo, recorded: false, skipped: "NO_QTY" };

  const { data: existing } = await supabase
    .from("ims_stock_ledger")
    .select("id")
    .eq("txnType", "IN")
    .eq("referenceNo", liftNo)
    .in("referenceType", [RECEIPT_REF, LEGACY_SERIAL_REF])
    .limit(1);
  if (existing && existing.length > 0) return { liftNo, recorded: false, alreadyRecorded: true };

  const code =
    resolveGodownCode(params.locationCode) ??
    resolvePfmsGodownCode(mr.godownLocation) ??
    resolvePfmsLocationCode(indent.warehouseLocation);
  const location = await locationIdByCode(code);
  if (!location) return { liftNo, recorded: false, skipped: "NO_LOCATION" };

  const { data: entry, error } = await supabase
    .from("ims_stock_ledger")
    .insert({ itemCode, locationId: location.id, txnType: "IN", qty: mr.receivedQty, referenceType: RECEIPT_REF, referenceNo: liftNo })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { liftNo, recorded: true, ledgerId: entry.id, qty: mr.receivedQty, locationCode: location.locationCode };
}

/**
 * Purchase Return submitted: the returned units leave stock. Picked serials
 * are taken out from wherever each one actually is (and flagged
 * RETURNED, so they stop counting as available); any qty beyond the picked
 * serials comes off the returning user's godown as a plain adjustment.
 */
export async function recordPurchaseReturnOut(params: { returnId: string; locationCode?: string | null; serialNumbers?: string[] | null }) {
  const supabase = getSupabaseAdmin();
  const returnId = (params.returnId || "").trim();
  if (!returnId) throw new IntegrationError("returnId is required");

  const { data: ret } = await supabase
    .from("pfms_purchase-return")
    .select("id, liftNo, returnedQty, godownLocation, serialNumbers")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) throw new IntegrationError(`Unknown purchase return "${returnId}"`);

  const { data: already } = await supabase
    .from("ims_stock_ledger")
    .select("id")
    .eq("referenceType", RETURN_REF)
    .eq("referenceNo", returnId)
    .limit(1);
  if (already && already.length > 0) return { returnId, recorded: false, alreadyRecorded: true };

  const { indent, itemCode } = await liftContext(ret.liftNo);
  if (!itemCode) return { returnId, recorded: false, skipped: "ITEM_NOT_IN_IMS" };
  if (!(ret.returnedQty > 0)) return { returnId, recorded: false, skipped: "NO_QTY" };

  // Target godown: the returning user's own (stored on the return row), else
  // where this lift was received, else the indent's top-level warehouse.
  let code: string | null = resolveGodownCode(params.locationCode) ?? resolvePfmsGodownCode(ret.godownLocation);
  if (!code) {
    const { data: receipt } = await supabase
      .from("ims_stock_ledger")
      .select("locationId")
      .eq("txnType", "IN")
      .eq("referenceNo", ret.liftNo)
      .in("referenceType", [RECEIPT_REF, LEGACY_SERIAL_REF])
      .limit(1)
      .maybeSingle();
    if (receipt) {
      const { data: loc } = await supabase.from("ims_location_master").select("locationCode").eq("id", receipt.locationId).maybeSingle();
      code = loc?.locationCode ?? null;
    }
  }
  code = code ?? resolvePfmsLocationCode(indent.warehouseLocation);
  const target = await locationIdByCode(code);

  const picked: string[] = Array.from(
    new Set<string>((params.serialNumbers ?? (ret.serialNumbers as string[] | null) ?? []).map((s) => s.trim()).filter(Boolean))
  );
  const ledger: Record<string, unknown>[] = [];
  const serialUpdates: { serialNo: string; itemCode: string }[] = [];
  const skippedSerials: { serialNo: string; reason: string }[] = [];
  const otherLocationSerials: string[] = [];

  if (picked.length) {
    const rows = await fetchAllRowsIn<{ serialNo: string; itemCode: string; status: string; currentLocationId: string | null }>(
      (chunk) => supabase.from("ims_serial_number").select("serialNo, itemCode, status, currentLocationId").in("serialNo", chunk),
      picked
    );
    const byNo = new Map(rows.map((r) => [r.serialNo, r]));
    for (const serialNo of picked) {
      const rec = byNo.get(serialNo);
      if (!rec) skippedSerials.push({ serialNo, reason: "UNKNOWN_SERIAL" });
      else if (rec.status !== "IN_STOCK" || !rec.currentLocationId) skippedSerials.push({ serialNo, reason: `NOT_IN_STOCK (${rec.status})` });
      else {
        if (target && rec.currentLocationId !== target.id) otherLocationSerials.push(serialNo);
        ledger.push({
          itemCode: rec.itemCode,
          locationId: rec.currentLocationId,
          txnType: "ADJUSTMENT",
          qty: -1,
          serialNo,
          referenceType: RETURN_REF,
          referenceNo: returnId,
          remarks: `Purchase return (lift ${ret.liftNo})`,
        });
        serialUpdates.push({ serialNo, itemCode: rec.itemCode });
      }
    }
  }

  const remaining = Math.max(0, ret.returnedQty - serialUpdates.length);
  if (remaining > 0) {
    if (!target) {
      if (ledger.length === 0) return { returnId, recorded: false, skipped: "NO_LOCATION" };
    } else {
      ledger.push({
        itemCode,
        locationId: target.id,
        txnType: "ADJUSTMENT",
        qty: -remaining,
        referenceType: RETURN_REF,
        referenceNo: returnId,
        remarks: `Purchase return (lift ${ret.liftNo})${serialUpdates.length ? " — qty beyond the picked serials" : ""}`,
      });
    }
  }

  const { data: inserted, error } = await supabase.from("ims_stock_ledger").insert(ledger).select("id, serialNo");
  if (error) throw new Error(error.message);

  if (serialUpdates.length) {
    const txnBySerial = new Map((inserted || []).filter((l) => l.serialNo).map((l) => [l.serialNo, l.id]));
    const { error: serialErr } = await supabase
      .from("ims_serial_number")
      .upsert(serialUpdates.map((s) => ({ ...s, status: "RETURNED", outTxnId: txnBySerial.get(s.serialNo) ?? null })), { onConflict: "serialNo" });
    if (serialErr) throw new Error(serialErr.message);
  }

  return {
    returnId,
    recorded: true,
    locationCode: target?.locationCode ?? null,
    serialsReturned: serialUpdates.length,
    qtyAdjusted: remaining,
    skippedSerials,
    otherLocationSerials,
  };
}
