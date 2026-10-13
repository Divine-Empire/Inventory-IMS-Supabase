import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { resolvePfmsLocationCode, resolvePfmsGodownCode } from "@/lib/pfms-location-aliases";
import { RECEIPT_REF, LEGACY_SERIAL_REF, RETURN_REF, recordPurchaseReturnOut } from "@/lib/integrations/pfms";

// Fallback for lib/integrations/pfms.ts's live Purchase Return push: picks up
// any return that never reached IMS. A return with picked serials goes
// through recordPurchaseReturnOut (those serials leave stock, flagged
// RETURNED); a qty-only return is batched here as a negative ADJUSTMENT at
// the godown the returning user manages (pfms_purchase-return.godownLocation),
// else where the lift was received, else the indent's top-level warehouse.
//
// Idempotent: keyed by the pfms_purchase-return row's own id, so re-running
// only processes returns not already recorded.

type PfmsPurchaseReturnRow = {
  id: string;
  liftNo: string;
  returnedQty: number | null;
  godownLocation: string | null;
  serialNumbers: string[] | null;
};

export async function syncPfmsReturns() {
  const supabase = getSupabaseAdmin();

  const [returns, existingAdjustments, lifts, indents, locations, ourItems, receipts] = await Promise.all([
    fetchAllRows<PfmsPurchaseReturnRow>(() =>
      supabase.from("pfms_purchase-return").select("id, liftNo, returnedQty, godownLocation, serialNumbers")
    ),
    fetchAllRows<{ referenceNo: string | null }>(() =>
      supabase.from("ims_stock_ledger").select("referenceNo").eq("referenceType", RETURN_REF)
    ),
    fetchAllRows<{ liftNo: string; indentNo: string }>(() => supabase.from("pfms_lift").select("liftNo, indentNo")),
    fetchAllRows<{ indentNo: string; itemCode: string | null; warehouseLocation: string | null }>(() =>
      supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation")
    ),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<{ itemCode: string }>(() => supabase.from("ims_item_master").select("itemCode")),
    fetchAllRows<{ referenceNo: string | null; locationId: string }>(() =>
      supabase.from("ims_stock_ledger").select("referenceNo, locationId").eq("txnType", "IN").in("referenceType", [RECEIPT_REF, LEGACY_SERIAL_REF])
    ),
  ]);

  const alreadyRecorded = new Set(existingAdjustments.map((r) => r.referenceNo));
  const indentNoByLift = new Map(lifts.map((l) => [l.liftNo, l.indentNo]));
  const indentByNo = new Map(indents.map((i) => [i.indentNo, i]));
  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));
  const receiptLocationByLift = new Map<string, string>();
  for (const r of receipts) if (r.referenceNo && !receiptLocationByLift.has(r.referenceNo)) receiptLocationByLift.set(r.referenceNo, r.locationId);

  let alreadySynced = 0;
  let unmatchedLift = 0;
  let unmatchedItem = 0;
  let unmatchedLocation = 0;
  let skippedNoQty = 0;
  let withSerials = 0;

  const toCreate: { itemCode: string; locationId: string; qty: number; referenceNo: string; liftNo: string }[] = [];

  for (const ret of returns) {
    if (alreadyRecorded.has(ret.id)) {
      alreadySynced++;
      continue;
    }
    if (!ret.returnedQty || ret.returnedQty <= 0) {
      skippedNoQty++;
      continue;
    }

    if (ret.serialNumbers && ret.serialNumbers.length > 0) {
      // Few and heavier (per-serial lookups) — handled by the live-push function.
      await recordPurchaseReturnOut({ returnId: ret.id });
      withSerials++;
      continue;
    }

    const indentNo = indentNoByLift.get(ret.liftNo);
    const indent = indentNo ? indentByNo.get(indentNo) : undefined;
    if (!indent) {
      unmatchedLift++;
      continue;
    }

    const itemCode = indent.itemCode && ourItemCodes.has(indent.itemCode) ? indent.itemCode : null;
    if (!itemCode) {
      unmatchedItem++;
      continue;
    }

    const godownCode = resolvePfmsGodownCode(ret.godownLocation);
    const locationId =
      (godownCode ? locationByCode.get(godownCode) : undefined) ??
      receiptLocationByLift.get(ret.liftNo) ??
      (resolvePfmsLocationCode(indent.warehouseLocation) ? locationByCode.get(resolvePfmsLocationCode(indent.warehouseLocation)!) : undefined);
    if (!locationId) {
      unmatchedLocation++;
      continue;
    }

    toCreate.push({ itemCode, locationId, qty: -ret.returnedQty, referenceNo: ret.id, liftNo: ret.liftNo });
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("ims_stock_ledger").insert(
      batch.map((r) => ({
        itemCode: r.itemCode,
        locationId: r.locationId,
        txnType: "ADJUSTMENT",
        qty: r.qty, // signed: negative = stock decrease
        referenceType: RETURN_REF,
        referenceNo: r.referenceNo,
        remarks: `Quantity-level adjustment — no serials picked on this return (lift ${r.liftNo})`,
      }))
    );
    if (error) throw new Error(`Adjustment batch insert failed: ${error.message}`);
  }

  return {
    totalReturns: returns.length,
    created: toCreate.length,
    withSerials,
    alreadySynced,
    unmatchedLift,
    unmatchedItem,
    unmatchedLocation,
    skippedNoQty,
  };
}
