import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { resolvePfmsLocationCode } from "@/lib/pfms-location-aliases";

// PFMS's Purchase Return stage tracks quantity only — it does NOT reference
// specific serial numbers (confirmed: pfms_purchase-return has no serial
// column, and the free-text serial list captured at Material Testing/QC
// isn't validated or carried forward). So this can only ever be a
// quantity-level stock ADJUSTMENT against the lift's item+location, not a
// precise per-serial removal.
//
// Idempotent: keyed by the pfms_purchase-return row's own id, so re-running
// only processes returns not already recorded as an adjustment.

type PfmsPurchaseReturnRow = {
  id: string;
  liftNo: string;
  returnedQty: number | null;
};

export async function syncPfmsReturns() {
  const supabase = getSupabaseAdmin();

  const [returns, existingAdjustments, lifts, indents, locations, ourItems] = await Promise.all([
    fetchAllRows<PfmsPurchaseReturnRow>(() => supabase.from("pfms_purchase-return").select("id, liftNo, returnedQty")),
    fetchAllRows<{ referenceNo: string | null }>(() =>
      supabase.from("ims_stock_ledger").select("referenceNo").eq("referenceType", "PFMS Purchase Return")
    ),
    fetchAllRows<{ liftNo: string; indentNo: string }>(() => supabase.from("pfms_lift").select("liftNo, indentNo")),
    fetchAllRows<{ indentNo: string; itemCode: string | null; warehouseLocation: string | null }>(() =>
      supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation")
    ),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<{ itemCode: string }>(() => supabase.from("ims_item_master").select("itemCode")),
  ]);

  const alreadyRecorded = new Set(existingAdjustments.map((r) => r.referenceNo));
  const indentNoByLift = new Map(lifts.map((l) => [l.liftNo, l.indentNo]));
  const indentByNo = new Map(indents.map((i) => [i.indentNo, i]));
  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));

  let alreadySynced = 0;
  let unmatchedLift = 0;
  let unmatchedItem = 0;
  let unmatchedLocation = 0;
  let skippedNoQty = 0;

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

    const locationCode = resolvePfmsLocationCode(indent.warehouseLocation);
    const locationId = locationCode ? locationByCode.get(locationCode) : undefined;
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
        referenceType: "PFMS Purchase Return",
        referenceNo: r.referenceNo,
        remarks: `Quantity-level adjustment — PFMS Purchase Return does not track specific serial numbers (lift ${r.liftNo})`,
      }))
    );
    if (error) throw new Error(`Adjustment batch insert failed: ${error.message}`);
  }

  return {
    totalReturns: returns.length,
    created: toCreate.length,
    alreadySynced,
    unmatchedLift,
    unmatchedItem,
    unmatchedLocation,
    skippedNoQty,
  };
}
