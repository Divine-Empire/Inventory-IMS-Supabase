import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { resolvePfmsLocationCode } from "@/lib/pfms-location-aliases";

// Computes Indent Raised Qty, In-Transit Qty and Lead Time (days) from
// PFMS's own REAL "pending" conditions per stage — not from the
// pfms_for_ims bridge table (which only carries static point-in-time
// numbers, not "still pending right now" state). See Database/06_....sql
// for the full rationale.
//
// This is a SNAPSHOT of current PFMS state (an item+location no longer
// pending anywhere should disappear, not linger with stale numbers), so
// every run does a full delete+reinsert rather than upsert-only.

const BATCH_SIZE = 500;

type IndentGen = { indentNo: string; itemCode: string | null; warehouseLocation: string | null; leadTime: number | null; quantity: number | null; category: string | null };
type IndentApproval = { indentNo: string; status: string | null; approvedQty: number | null };
type Update3Vendors = {
  indentNo: string;
  vendor1Name: string | null; vendor1DeliveryDate: string | null;
  vendor2Name: string | null; vendor2DeliveryDate: string | null;
  vendor3Name: string | null; vendor3DeliveryDate: string | null;
};
type Negotiation = { indentNo: string; selectedVendorName: string | null };
type PoEntry = { indentNo: string };
type Lift = { liftNo: string; indentNo: string; liftingQty: number | null; plannedMaterialRcd: string | null };
type TransporterFollowUp = { liftNo: string; status: string | null; expectedDeliveryDate: string | null };
type MaterialReceived = { liftNo: string };
type OrderCancellation = { indentNo: string | null; liftNo: string | null };

type Acc = { indentRaisedQty: number; poQty: number; intransitQty: number; leadTimeCandidates: number[] };

function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export async function syncPfms() {
  const supabase = getSupabaseAdmin();

  const [
    indentGen,
    indentApproval,
    update3Vendors,
    negotiation,
    poEntry,
    lifts,
    transporterFollowUp,
    materialReceived,
    orderCancellation,
    locations,
    ourItems,
  ] = await Promise.all([
    fetchAllRows<IndentGen>(() => supabase.from("pfms_indent_generation").select("indentNo, itemCode, warehouseLocation, leadTime, quantity, category")),
    fetchAllRows<IndentApproval>(() => supabase.from("pfms_indent-approval").select("indentNo, status, approvedQty")),
    fetchAllRows<Update3Vendors>(() =>
      supabase
        .from("pfms_update-3-vendors")
        .select("indentNo, vendor1Name, vendor1DeliveryDate, vendor2Name, vendor2DeliveryDate, vendor3Name, vendor3DeliveryDate")
    ),
    fetchAllRows<Negotiation>(() => supabase.from("pfms_negotiation").select("indentNo, selectedVendorName")),
    fetchAllRows<PoEntry>(() => supabase.from("pfms_po-entry").select("indentNo")),
    fetchAllRows<Lift>(() => supabase.from("pfms_lift").select("liftNo, indentNo, liftingQty, plannedMaterialRcd")),
    fetchAllRows<TransporterFollowUp>(() => supabase.from("pfms_transporter-follow-up").select("liftNo, status, expectedDeliveryDate")),
    fetchAllRows<MaterialReceived>(() => supabase.from("pfms_material-received").select("liftNo")),
    fetchAllRows<OrderCancellation>(() => supabase.from("pfms_order-cancellation").select("indentNo, liftNo")),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
    fetchAllRows<{ itemCode: string }>(() => supabase.from("ims_item_master").select("itemCode")),
  ]);

  const indentGenByNo = new Map(indentGen.map((i) => [i.indentNo, i]));
  const approvalByIndentNo = new Map(indentApproval.map((a) => [a.indentNo, a]));
  const update3VendorsByIndentNo = new Map(update3Vendors.map((u) => [u.indentNo, u]));
  const negotiationByIndentNo = new Map(negotiation.map((n) => [n.indentNo, n]));
  const poEntryIndentNos = new Set(poEntry.map((p) => p.indentNo));
  const transporterFollowUpByLiftNo = new Map(transporterFollowUp.map((t) => [t.liftNo, t]));
  const materialReceivedLiftNos = new Set(materialReceived.map((m) => m.liftNo));
  const cancelledIndentNos = new Set(orderCancellation.map((c) => c.indentNo).filter(Boolean));
  const cancelledLiftNos = new Set(orderCancellation.map((c) => c.liftNo).filter(Boolean));

  const liftsByIndentNo = new Map<string, Lift[]>();
  for (const l of lifts) {
    if (!liftsByIndentNo.has(l.indentNo)) liftsByIndentNo.set(l.indentNo, []);
    liftsByIndentNo.get(l.indentNo)!.push(l);
  }

  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const ourItemCodes = new Set(ourItems.map((i) => i.itemCode));

  const acc = new Map<string, Acc>();
  const key = (itemCode: string, locationId: string) => `${itemCode}::${locationId}`;

  let unmatchedItem = 0;
  let unmatchedLocation = 0;

  function resolveKey(itemCode: string | null, warehouseLocation: string | null): string | null {
    if (!itemCode || !ourItemCodes.has(itemCode)) {
      unmatchedItem++;
      return null;
    }
    const locCode = resolvePfmsLocationCode(warehouseLocation);
    const locationId = locCode ? locationByCode.get(locCode) : undefined;
    if (!locationId) {
      unmatchedLocation++;
      return null;
    }
    return key(itemCode, locationId);
  }

  function getAcc(k: string): Acc {
    let a = acc.get(k);
    if (!a) {
      a = { indentRaisedQty: 0, poQty: 0, intransitQty: 0, leadTimeCandidates: [] };
      acc.set(k, a);
    }
    return a;
  }

  // 1) Indent Raised — pfms_indent-approval.approvedQty, for indents
  // approved but with no pfms_update-3-vendors row yet (pending at Stage 3).
  for (const ig of indentGen) {
    const approval = approvalByIndentNo.get(ig.indentNo);
    if (!approval || !/approved/i.test(approval.status || "")) continue;
    if (update3VendorsByIndentNo.has(ig.indentNo)) continue;
    if (cancelledIndentNos.has(ig.indentNo)) continue;

    const k = resolveKey(ig.itemCode, ig.warehouseLocation);
    if (!k) continue;
    getAcc(k).indentRaisedQty += approval.approvedQty || 0;
  }

  // 2) Intransit Qty — pfms_lift.liftingQty, for lifts whose Transporter
  // Follow-Up status isn't "received" yet (pending at Stage 6.1).
  for (const lift of lifts) {
    const tfu = transporterFollowUpByLiftNo.get(lift.liftNo);
    if (!tfu || (tfu.status || "").toLowerCase() === "received") continue;
    if (cancelledLiftNos.has(lift.liftNo) || cancelledIndentNos.has(lift.indentNo)) continue;

    const ig = indentGenByNo.get(lift.indentNo);
    if (!ig) continue;
    const k = resolveKey(ig.itemCode, ig.warehouseLocation);
    if (!k) continue;

    const a = getAcc(k);
    a.intransitQty += lift.liftingQty || 0;
    const days = daysFromToday(tfu.expectedDeliveryDate);
    if (days !== null) a.leadTimeCandidates.push(days);
  }

  // 3) Lead Time candidate — Material Received pending (lift received by
  // transporter but no pfms_material-received row yet): plannedMaterialRcd.
  for (const lift of lifts) {
    const tfu = transporterFollowUpByLiftNo.get(lift.liftNo);
    if (!tfu || (tfu.status || "").toLowerCase() !== "received") continue;
    if (materialReceivedLiftNos.has(lift.liftNo)) continue;
    if (cancelledLiftNos.has(lift.liftNo) || cancelledIndentNos.has(lift.indentNo)) continue;

    const ig = indentGenByNo.get(lift.indentNo);
    if (!ig) continue;
    const k = resolveKey(ig.itemCode, ig.warehouseLocation);
    if (!k) continue;

    const days = daysFromToday(lift.plannedMaterialRcd);
    if (days !== null) getAcc(k).leadTimeCandidates.push(days);
  }

  // 4) Lead Time candidate — Follow-Up Vendor pending (PO + negotiation
  // exist, but total lifted qty across all lifts is still short of the
  // approved qty): delivery date of the ACTUALLY negotiated vendor
  // (pfms_negotiation.selectedVendorName matched against
  // pfms_update-3-vendors.vendor{N}Name) — not PFMS's own UI, which always
  // shows vendor1's date due to an upstream bug (selectedVendor is never
  // persisted on pfms_indent_generation). Falls back to vendor1 only if no
  // name match is found.
  for (const ig of indentGen) {
    if (!negotiationByIndentNo.has(ig.indentNo) || !poEntryIndentNos.has(ig.indentNo)) continue;
    if (cancelledIndentNos.has(ig.indentNo)) continue;

    const approval = approvalByIndentNo.get(ig.indentNo);
    const approvedQty = approval?.approvedQty ?? ig.quantity ?? 0;
    const totalLifted = (liftsByIndentNo.get(ig.indentNo) || []).reduce((s, l) => s + (l.liftingQty || 0), 0);
    const pendingLifted = approvedQty - totalLifted;
    if (pendingLifted <= 0) continue;

    const k = resolveKey(ig.itemCode, ig.warehouseLocation);
    if (!k) continue;

    // PO Qty = quantity still pending at Follow-Up Vendor (PO + Negotiation
    // exist, but not everything approved has been lifted yet) — i.e. what's
    // still outstanding against a raised PO.
    getAcc(k).poQty += pendingLifted;

    const neg = negotiationByIndentNo.get(ig.indentNo)!;
    const u3v = update3VendorsByIndentNo.get(ig.indentNo);
    let deliveryDate: string | null = null;
    if (u3v) {
      const selected = (neg.selectedVendorName || "").trim().toLowerCase();
      const candidates: [string | null, string | null][] = [
        [u3v.vendor1Name, u3v.vendor1DeliveryDate],
        [u3v.vendor2Name, u3v.vendor2DeliveryDate],
        [u3v.vendor3Name, u3v.vendor3DeliveryDate],
      ];
      const match = candidates.find(([name]) => (name || "").trim().toLowerCase() === selected && selected);
      deliveryDate = match ? match[1] : u3v.vendor1DeliveryDate;
    }

    const days = daysFromToday(deliveryDate);
    if (days !== null) getAcc(k).leadTimeCandidates.push(days);
  }

  // 5) Lead Time candidate (last-resort fallback) — Indent Approval
  // pending (no pfms_indent-approval row yet, and not a Direct/no-approval
  // indent): the indent's own static leadTime, used as a day-count as-is.
  for (const ig of indentGen) {
    if (approvalByIndentNo.has(ig.indentNo)) continue;
    if (ig.indentNo.startsWith("IN-DIR-") || ig.category === "Direct") continue;
    if (cancelledIndentNos.has(ig.indentNo)) continue;

    const k = resolveKey(ig.itemCode, ig.warehouseLocation);
    if (!k) continue;
    if (ig.leadTime != null) getAcc(k).leadTimeCandidates.push(ig.leadTime);
  }

  const rows = [...acc.entries()].map(([k, a]) => {
    const [itemCode, locationId] = k.split("::");
    return {
      itemCode,
      locationId,
      indentRaisedQty: a.indentRaisedQty,
      poQty: a.poQty,
      intransitQty: a.intransitQty,
      leadTimeDays: a.leadTimeCandidates.length ? Math.min(...a.leadTimeCandidates) : null,
    };
  });

  // Full refresh — this is a snapshot of current PFMS state, not a ledger.
  const { error: deleteErr } = await supabase.from("ims_pfms_pending_snapshot").delete().not("itemCode", "is", null);
  if (deleteErr) throw new Error(`Snapshot clear failed: ${deleteErr.message}`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("ims_pfms_pending_snapshot").insert(batch);
    if (error) throw new Error(`Snapshot batch insert failed: ${error.message}`);
  }

  return { itemLocationRows: rows.length, unmatchedItem, unmatchedLocation };
}
