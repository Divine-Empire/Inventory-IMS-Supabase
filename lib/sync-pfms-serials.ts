import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { resolvePfmsLocationCode, resolvePfmsGodownCode } from "@/lib/pfms-location-aliases";

// Pulls newly-generated serials from PFMS's Serial Generation stage
// (pfms_serial-number) into our own ims_serial_number + an "IN" stock
// ledger entry. Item + location are resolved via
// pfms_lift.indentNo -> pfms_indent_generation.{itemCode, warehouseLocation}
// — the same join PFMS's own material-received/serial-generation/
// purchase-return API routes use internally.
//
// Idempotent: re-running only processes serials this system hasn't already
// recorded (checked against ims_serial_number.serialNo), so it's safe to
// click "Sync" repeatedly.
//
// Batched (not one row at a time): sequential per-serial inserts were
// observed to take 65s for ~500 matched serials — well past a typical
// serverless function's time budget, and it only gets slower as the Item
// Master fills in and more serials start matching. Two bulk-insert passes
// (ledger, then serial rows) instead.

type PfmsSerialRow = {
  liftNo: string;
  serialNo: string;
  warrantyExpiry: string | null;
  productExpiry: string | null; // a real date at the serial level (unlike material-received's same-named flag column)
};

const BATCH_SIZE = 500;

export async function syncPfmsSerials() {
  const supabase = getSupabaseAdmin();

  const [pfmsSerials, existingSerials, lifts, indents, materialReceived, locations, ourItems] = await Promise.all([
    fetchAllRows<PfmsSerialRow>(() => supabase.from("pfms_serial-number").select("liftNo, serialNo, warrantyExpiry, productExpiry")),
    fetchAllRows<{ serialNo: string }>(() => supabase.from("ims_serial_number").select("serialNo")),
    fetchAllRows<{ liftNo: string; indentNo: string }>(() => supabase.from("pfms_lift").select("liftNo, indentNo")),
    fetchAllRows<{ indentNo: string; itemCode: string | null; warehouseLocation: string | null }>(() =>
      supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation")
    ),
    fetchAllRows<{ liftNo: string; invoiceDate: string | null; godownLocation: string | null }>(() =>
      supabase.from("pfms_material-received").select("liftNo, invoiceDate, godownLocation")
    ),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<{ itemCode: string }>(() => supabase.from("ims_item_master").select("itemCode")),
  ]);

  const existingSerialSet = new Set(existingSerials.map((s) => s.serialNo));
  const indentNoByLift = new Map(lifts.map((l) => [l.liftNo, l.indentNo]));
  const indentByNo = new Map(indents.map((i) => [i.indentNo, i]));
  const invoiceDateByLift = new Map(materialReceived.map((m) => [m.liftNo, m.invoiceDate]));
  const materialReceivedByLift = new Map(materialReceived.map((m) => [m.liftNo, m]));
  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));

  let alreadySynced = 0;
  let unmatchedLift = 0;
  let unmatchedItem = 0;
  let unmatchedLocation = 0;

  const toCreate: { itemCode: string; locationId: string; serialNo: string; liftNo: string; warrantyExpiryDate: string | null; invoiceDate: string | null }[] = [];

  for (const row of pfmsSerials) {
    if (existingSerialSet.has(row.serialNo)) {
      alreadySynced++;
      continue;
    }

    const indentNo = indentNoByLift.get(row.liftNo);
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

    // Prefer the exact CG sub-godown captured at Material Received (more
    // precise) over the indent's top-level warehouse (coarse, unchanged).
    const godownCode = resolvePfmsGodownCode(materialReceivedByLift.get(row.liftNo)?.godownLocation);
    const locationCode = godownCode ?? resolvePfmsLocationCode(indent.warehouseLocation);
    const locationId = locationCode ? locationByCode.get(locationCode) : undefined;
    if (!locationId) {
      unmatchedLocation++;
      continue;
    }

    // Warranty expiry wins if present; else the (per-serial) product expiry;
    // else fall back to the lift's purchase invoice date — matches the
    // original "warranty expiry, or invoice date if no warranty" spec.
    const warrantyExpiryDate = row.warrantyExpiry;
    const invoiceDate = !warrantyExpiryDate ? row.productExpiry ?? invoiceDateByLift.get(row.liftNo) ?? null : null;

    toCreate.push({ itemCode, locationId, serialNo: row.serialNo, liftNo: row.liftNo, warrantyExpiryDate, invoiceDate });
  }

  let created = 0;

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);

    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from("ims_stock_ledger")
      .insert(
        batch.map((r) => ({
          itemCode: r.itemCode,
          locationId: r.locationId,
          txnType: "IN",
          qty: 1,
          serialNo: r.serialNo,
          referenceType: "PFMS Serial Generation",
          referenceNo: r.liftNo,
        }))
      )
      .select("id, serialNo");
    if (ledgerErr) throw new Error(`Ledger batch insert failed: ${ledgerErr.message}`);

    const ledgerIdBySerial = new Map((ledgerRows || []).map((l) => [l.serialNo, l.id]));

    const { error: serialErr } = await supabase.from("ims_serial_number").insert(
      batch.map((r) => ({
        itemCode: r.itemCode,
        serialNo: r.serialNo,
        currentLocationId: r.locationId,
        status: "IN_STOCK",
        warrantyExpiryDate: r.warrantyExpiryDate,
        invoiceDate: r.invoiceDate,
        inTxnId: ledgerIdBySerial.get(r.serialNo) ?? null,
      }))
    );
    if (serialErr) throw new Error(`Serial batch insert failed: ${serialErr.message}`);

    created += batch.length;
  }

  return {
    totalPfmsSerials: pfmsSerials.length,
    created,
    alreadySynced,
    unmatchedLift,
    unmatchedItem,
    unmatchedLocation,
  };
}
