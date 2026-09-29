import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";

// PFMS's warehouseLocation free-text values, normalized -> our fixed
// location codes. "C.G Warehosue" is a real typo present in PFMS's live
// data (verified against pfms_for_ims), kept here deliberately.
const LOCATION_ALIASES: Record<string, string> = {
  "NE WAREHOUSE": "NE",
  "MANIQUIP STORE": "MANIQUIP",
  "C.G WAREHOUSE": "CG",
  "C.G WAREHOSUE": "CG",
  "HEAD OFFICE": "HO",
};

// Batched (not one row at a time): with 1000+ indent rows, upserting them
// one by one was observed to take minutes. supabase-js's .upsert() accepts
// an array, turning this into one REST call per batch.
const BATCH_SIZE = 500;

export async function syncPfms() {
  const supabase = getSupabaseAdmin();

  // Same physical Supabase project as PFMS — pfms_* tables are readable via
  // our own project's REST API (service role key bypasses RLS), even though
  // they're owned/migrated by PFMS's own repo, not ours.
  const [forIms, itemMasters, indentGen, locations, ourItems] = await Promise.all([
    fetchAllRows<any>(() =>
      supabase
        .from("pfms_for_ims")
        .select(
          'indentNo:"indent no.", materialName:"material name", warehouseLocation:"warehouse location", indentQty:"indent qty", poQty:"po qty", receivingQty:"receiving qty", intransitQty:"intransit qty"'
        )
    ),
    fetchAllRows<any>(() => supabase.from("pfms_item_master").select('itemCode:"ITEM CODE", itemName:"ITEM NAME"')),
    fetchAllRows<any>(() => supabase.from("pfms_indent_generation").select("indentNo, leadTime")),
    fetchAllRows<any>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<any>(() => supabase.from("ims_item_master").select("itemCode")),
  ]);

  // pfms_item_master has duplicate ITEM NAMEs (up to 3x in live data) —
  // dedupe here (first-wins) so a fan-out join can't produce two rows for
  // the same indentNo, which a single-statement upsert can't handle.
  const itemCodeByName = new Map<string, string>();
  for (const im of itemMasters) {
    const key = (im.itemName || "").trim().toUpperCase();
    if (!key || itemCodeByName.has(key)) continue;
    itemCodeByName.set(key, im.itemCode);
  }

  const leadTimeByIndentNo = new Map(indentGen.map((ig: any) => [ig.indentNo, ig.leadTime]));

  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));

  let unmatchedItem = 0;
  let unmatchedLocation = 0;

  const rows = forIms.filter((r: any) => !!r.indentNo);

  const toUpsert = rows.map((row: any) => {
    const nameKey = (row.materialName || "").trim().toUpperCase();
    const candidateItemCode = itemCodeByName.get(nameKey) || null;
    const itemCode = candidateItemCode && ourItemCodes.has(candidateItemCode) ? candidateItemCode : null;
    if (!itemCode) unmatchedItem++;

    const locKey = (row.warehouseLocation || "").trim().toUpperCase();
    const locationId = LOCATION_ALIASES[locKey] ? locationByCode.get(LOCATION_ALIASES[locKey]) : undefined;
    if (!locationId) unmatchedLocation++;

    return {
      indentNo: row.indentNo,
      itemCode,
      locationId: locationId ?? null,
      indentQty: row.indentQty,
      poQty: row.poQty,
      receivedQty: row.receivingQty,
      intransitQty: row.intransitQty,
      leadTimeDays: leadTimeByIndentNo.get(row.indentNo) ?? null,
    };
  });

  // Defensive de-dupe by indentNo (last write wins) — pfms_for_ims itself
  // has one row per indentNo, but this keeps the batch upsert safe even if
  // that ever changes.
  const dedupedByIndentNo = [...new Map(toUpsert.map((r) => [r.indentNo, r])).values()];

  for (let i = 0; i < dedupedByIndentNo.length; i += BATCH_SIZE) {
    const batch = dedupedByIndentNo.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("ims_indent_po_sync").upsert(batch, { onConflict: "indentNo" });
    if (error) throw new Error(`Batch upsert failed: ${error.message}`);
  }

  return { totalRows: rows.length, upserted: dedupedByIndentNo.length, unmatchedItem, unmatchedLocation };
}
