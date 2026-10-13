import { getSupabaseAdmin, fetchAllRows, fetchAllRowsIn } from "@/lib/supabase";
import { resolvePfmsLocationCode, resolvePfmsGodownCode } from "@/lib/pfms-location-aliases";
import { RECEIPT_REF, LEGACY_SERIAL_REF } from "@/lib/integrations/pfms";

// Pulls newly-generated serials from PFMS's Serial Generation stage
// (pfms_serial-number) into ims_serial_number. Item + location are resolved
// via pfms_lift.indentNo -> pfms_indent_generation.itemCode, and the godown
// the lift was received into (Material Received's godownLocation).
//
// Stock QTY comes IN once per lift at Material Received
// (lib/integrations/pfms.ts recordReceiptIn). Serials only attach to that
// receipt's godown — adding another IN per serial would count every unit
// twice. Two exceptions, both handled here:
//   - legacy lifts, whose serials were already IN'd one-by-one by an older
//     version of this job: any further serial on them keeps that behaviour;
//   - a lift whose Material Received push never reached IMS: the receipt IN
//     is created here (qty = received qty), same as the live push would have.
//
// OPENING-STOCK CUTOVER: the CSV Live Stock imported into IMS ("Opening Import"
// ledger entries) is what was physically on the shelf at that moment, so every
// PFMS receipt / serial generated BEFORE it is already inside that stock.
// Pulling those in again would count them twice — so serials generated before
// the cutover are skipped here, and a lift received before it never gets a
// receipt IN. (The one-time historical backfill of still-in-stock serials was
// done separately, capped at each item's on-hand qty, with no ledger entry.)
//
// Idempotent: re-running only processes serials not already in
// ims_serial_number. `liftNos` scopes it to specific lifts (the live push
// from Serial Generation); without it, it's the full manual Sync.
//
// Batched (not one row at a time): sequential per-serial inserts were
// observed to take 65s for ~500 serials.

type PfmsSerialRow = {
  liftNo: string;
  serialNo: string;
  warrantyExpiry: string | null;
  productExpiry: string | null; // a real date at the serial level (unlike material-received's same-named flag column)
  timestamp: string | null;
};

const BATCH_SIZE = 500;

export async function syncPfmsSerials(opts: { liftNos?: string[] } = {}) {
  const supabase = getSupabaseAdmin();
  const scoped = opts.liftNos && opts.liftNos.length > 0 ? Array.from(new Set(opts.liftNos)) : null;

  const pfmsSerials = scoped
    ? await fetchAllRowsIn<PfmsSerialRow>(
        (c) => supabase.from("pfms_serial-number").select("liftNo, serialNo, warrantyExpiry, productExpiry, timestamp").in("liftNo", c),
        scoped
      )
    : await fetchAllRows<PfmsSerialRow>(() => supabase.from("pfms_serial-number").select("liftNo, serialNo, warrantyExpiry, productExpiry, timestamp"));

  const { data: cutoverRow } = await supabase
    .from("ims_stock_ledger")
    .select("createdAt")
    .eq("referenceType", "Opening Import")
    .order("createdAt", { ascending: true })
    .limit(1)
    .maybeSingle();
  const cutoverMs = cutoverRow?.createdAt ? new Date(cutoverRow.createdAt).getTime() : null;
  const beforeCutover = (ts: string | null | undefined) => cutoverMs !== null && !!ts && new Date(ts).getTime() < cutoverMs;

  const serialNos = pfmsSerials.map((s) => s.serialNo);
  type MrRow = { liftNo: string; invoiceDate: string | null; godownLocation: string | null; receivedQty: number | null; timestamp: string | null };
  type LedgerRef = { id: string; referenceNo: string | null; locationId: string };

  const [existingSerials, lifts, materialReceived, receiptEntries, legacyEntries, locations, ourItems] = await Promise.all([
    scoped
      ? fetchAllRowsIn<{ serialNo: string }>((c) => supabase.from("ims_serial_number").select("serialNo").in("serialNo", c), serialNos)
      : fetchAllRows<{ serialNo: string }>(() => supabase.from("ims_serial_number").select("serialNo")),
    scoped
      ? fetchAllRowsIn<{ liftNo: string; indentNo: string }>((c) => supabase.from("pfms_lift").select("liftNo, indentNo").in("liftNo", c), scoped)
      : fetchAllRows<{ liftNo: string; indentNo: string }>(() => supabase.from("pfms_lift").select("liftNo, indentNo")),
    scoped
      ? fetchAllRowsIn<MrRow>(
          (c) => supabase.from("pfms_material-received").select("liftNo, invoiceDate, godownLocation, receivedQty, timestamp").in("liftNo", c),
          scoped
        )
      : fetchAllRows<MrRow>(() => supabase.from("pfms_material-received").select("liftNo, invoiceDate, godownLocation, receivedQty, timestamp")),
    scoped
      ? fetchAllRowsIn<LedgerRef>(
          (c) =>
            supabase.from("ims_stock_ledger").select("id, referenceNo, locationId").eq("txnType", "IN").eq("referenceType", RECEIPT_REF).in("referenceNo", c),
          scoped
        )
      : fetchAllRows<LedgerRef>(() =>
          supabase.from("ims_stock_ledger").select("id, referenceNo, locationId").eq("txnType", "IN").eq("referenceType", RECEIPT_REF)
        ),
    scoped
      ? fetchAllRowsIn<{ referenceNo: string | null }>(
          (c) => supabase.from("ims_stock_ledger").select("referenceNo").eq("referenceType", LEGACY_SERIAL_REF).in("referenceNo", c),
          scoped
        )
      : fetchAllRows<{ referenceNo: string | null }>(() => supabase.from("ims_stock_ledger").select("referenceNo").eq("referenceType", LEGACY_SERIAL_REF)),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<{ itemCode: string }>(() => supabase.from("ims_item_master").select("itemCode")),
  ]);

  const indentNos = Array.from(new Set(lifts.map((l) => l.indentNo)));
  const indents = scoped
    ? await fetchAllRowsIn<{ indentNo: string; itemCode: string | null; warehouseLocation: string | null }>(
        (c) => supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation").in("indentNo", c),
        indentNos
      )
    : await fetchAllRows<{ indentNo: string; itemCode: string | null; warehouseLocation: string | null }>(() =>
        supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation")
      );

  const existingSerialSet = new Set(existingSerials.map((s) => s.serialNo));
  const indentNoByLift = new Map(lifts.map((l) => [l.liftNo, l.indentNo]));
  const indentByNo = new Map(indents.map((i) => [i.indentNo, i]));
  const mrByLift = new Map(materialReceived.map((m) => [m.liftNo, m]));
  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));
  const receiptByLift = new Map<string, { id: string; locationId: string }>();
  for (const r of receiptEntries) if (r.referenceNo) receiptByLift.set(r.referenceNo, { id: r.id, locationId: r.locationId });
  const legacyLifts = new Set(legacyEntries.map((e) => e.referenceNo).filter(Boolean) as string[]);

  let alreadySynced = 0;
  let unmatchedLift = 0;
  let unmatchedItem = 0;
  let unmatchedLocation = 0;
  let skippedBeforeCutover = 0;

  type NewSerial = {
    itemCode: string;
    locationId: string;
    serialNo: string;
    liftNo: string;
    warrantyExpiryDate: string | null;
    invoiceDate: string | null;
  };
  const toCreate: NewSerial[] = [];
  const receiptsNeeded = new Map<string, { itemCode: string; locationId: string; fallbackQty: number }>();

  for (const row of pfmsSerials) {
    if (existingSerialSet.has(row.serialNo)) {
      alreadySynced++;
      continue;
    }
    if (beforeCutover(row.timestamp)) {
      skippedBeforeCutover++;
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

    const mr = mrByLift.get(row.liftNo);
    // The godown the lift was received into wins; else the indent's top-level warehouse.
    const locationCode = resolvePfmsGodownCode(mr?.godownLocation) ?? resolvePfmsLocationCode(indent.warehouseLocation);
    const locationId = receiptByLift.get(row.liftNo)?.locationId ?? (locationCode ? locationByCode.get(locationCode) : undefined);
    if (!locationId) {
      unmatchedLocation++;
      continue;
    }

    // A lift received before the cutover is already inside the opening stock — no receipt IN.
    if (!receiptByLift.has(row.liftNo) && !legacyLifts.has(row.liftNo) && !beforeCutover(mr?.timestamp)) {
      const prev = receiptsNeeded.get(row.liftNo);
      receiptsNeeded.set(row.liftNo, { itemCode, locationId, fallbackQty: (prev?.fallbackQty ?? 0) + 1 });
    }

    // Warranty expiry wins if present; else the (per-serial) product expiry;
    // else fall back to the lift's purchase invoice date — matches the
    // original "warranty expiry, or invoice date if no warranty" spec.
    const warrantyExpiryDate = row.warrantyExpiry;
    const invoiceDate = !warrantyExpiryDate ? row.productExpiry ?? mr?.invoiceDate ?? null : null;

    toCreate.push({ itemCode, locationId, serialNo: row.serialNo, liftNo: row.liftNo, warrantyExpiryDate, invoiceDate });
  }

  // Lifts whose Material Received IN never reached IMS: create it now.
  let receiptsCreated = 0;
  const receiptEntriesToInsert = Array.from(receiptsNeeded.entries()).map(([liftNo, r]) => ({
    itemCode: r.itemCode,
    locationId: r.locationId,
    txnType: "IN",
    qty: mrByLift.get(liftNo)?.receivedQty || r.fallbackQty,
    referenceType: RECEIPT_REF,
    referenceNo: liftNo,
  }));
  for (let i = 0; i < receiptEntriesToInsert.length; i += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("ims_stock_ledger")
      .insert(receiptEntriesToInsert.slice(i, i + BATCH_SIZE))
      .select("id, referenceNo, locationId");
    if (error) throw new Error(`Receipt IN batch insert failed: ${error.message}`);
    for (const r of data || []) if (r.referenceNo) receiptByLift.set(r.referenceNo, { id: r.id, locationId: r.locationId });
    receiptsCreated += (data || []).length;
  }

  let created = 0;

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);

    // Only legacy lifts still get a per-serial IN entry.
    const legacyBatch = batch.filter((r) => legacyLifts.has(r.liftNo));
    const ledgerIdBySerial = new Map<string, string>();
    if (legacyBatch.length) {
      const { data: ledgerRows, error: ledgerErr } = await supabase
        .from("ims_stock_ledger")
        .insert(
          legacyBatch.map((r) => ({
            itemCode: r.itemCode,
            locationId: r.locationId,
            txnType: "IN",
            qty: 1,
            serialNo: r.serialNo,
            referenceType: LEGACY_SERIAL_REF,
            referenceNo: r.liftNo,
          }))
        )
        .select("id, serialNo");
      if (ledgerErr) throw new Error(`Ledger batch insert failed: ${ledgerErr.message}`);
      for (const l of ledgerRows || []) if (l.serialNo) ledgerIdBySerial.set(l.serialNo, l.id);
    }

    const { error: serialErr } = await supabase.from("ims_serial_number").insert(
      batch.map((r) => ({
        itemCode: r.itemCode,
        serialNo: r.serialNo,
        currentLocationId: receiptByLift.get(r.liftNo)?.locationId ?? r.locationId,
        status: "IN_STOCK",
        warrantyExpiryDate: r.warrantyExpiryDate,
        invoiceDate: r.invoiceDate,
        inTxnId: ledgerIdBySerial.get(r.serialNo) ?? receiptByLift.get(r.liftNo)?.id ?? null,
      }))
    );
    if (serialErr) throw new Error(`Serial batch insert failed: ${serialErr.message}`);

    created += batch.length;
  }

  return {
    totalPfmsSerials: pfmsSerials.length,
    created,
    receiptsCreated,
    alreadySynced,
    skippedBeforeCutover,
    unmatchedLift,
    unmatchedItem,
    unmatchedLocation,
  };
}
