import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";

// OUT movement in the trailing window used to classify Fast/Slow/Non-Moving.
// Thresholds are a starting default — tune once real OUT history exists
// (see Database/README.md).
const MOVEMENT_WINDOW_DAYS = 90;
const FAST_MOVING_MIN_OUT_QTY = 10;

export type InventoryRow = {
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  category: string | null;
  uom: string | null;
  locationCode: string;
  locationName: string;

  liveStock: number;
  maxLevel: number | null;
  maxLevelPeak: number | null;
  indentRaisedQty: number;
  poQty: number; // still pending at PFMS's Follow-Up Vendor stage (PO+Negotiation done, not fully lifted)
  materialInTransitQty: number;
  targetQty: number; // liveStock + materialInTransitQty
  reorderQty: number | null; // maxLevel - (liveStock + indentRaisedQty)
  leadTimeDays: number | null;

  totalSalesQty: number;
  totalSalesValue: number;

  stockTransferInQty: number;
  stockTransferOutQty: number;

  serialCount: number;
  nearestWarrantyExpiry: string | null; // ISO date of soonest-expiring in-stock serial with a warranty
  nearestInvoiceDate: string | null; // ISO date of soonest-expiring in-stock serial without a warranty (invoice date fallback)

  status: "Fast Moving" | "Slow Moving" | "Non-Moving";
};

function signedLedgerQty(txnType: string, qty: number): number {
  switch (txnType) {
    case "IN":
    case "TRANSFER_IN":
      return qty;
    case "OUT":
    case "TRANSFER_OUT":
      return -qty;
    case "ADJUSTMENT":
      return qty; // qty is stored signed for adjustments
    default:
      return 0;
  }
}

export async function getInventoryRows(): Promise<InventoryRow[]> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - MOVEMENT_WINDOW_DAYS * 86400000).toISOString();

  const [
    locationSettings,
    ledgerRows,
    pfmsPendingRows,
    salesPendingRows,
    serialRows,
    recentOutRows,
    itemMasters,
    locationMasters,
  ] = await Promise.all([
    fetchAllRows<any>(() => supabase.from("ims_item_location_setting").select("itemCode, locationId, maxLevel, maxLevelPeak")),
    fetchAllRows<any>(() => supabase.from("ims_stock_ledger").select("itemCode, locationId, txnType, qty")),
    fetchAllRows<any>(() => supabase.from("ims_pfms_pending_snapshot").select("itemCode, locationId, indentRaisedQty, poQty, intransitQty, leadTimeDays")),
    fetchAllRows<any>(() => supabase.from("ims_sales_pending_snapshot").select("itemCode, qty, amount")),
    fetchAllRows<any>(() =>
      supabase
        .from("ims_serial_number")
        .select("itemCode, currentLocationId, warrantyExpiryDate, invoiceDate")
        .eq("status", "IN_STOCK")
    ),
    fetchAllRows<any>(() =>
      supabase.from("ims_stock_ledger").select("itemCode, locationId, qty").eq("txnType", "OUT").gte("createdAt", cutoff)
    ),
    fetchAllRows<any>(() => supabase.from("ims_item_master").select("itemCode, itemName, itemGroup, category, uom")),
    fetchAllRows<any>(() => supabase.from("ims_location_master").select("id, locationCode, locationName, parentLocationId")),
  ]);

  // Sub-godowns (CG's children: MANIQUIP, HO, CG-WAREHOUSE, CG-SERVICE-INBOUND)
  // roll up into their parent for display — Inventory shows one combined row
  // per top-level location (CG/NE/WB/OD), not a fragmented row per sub-godown.
  // Fine-grained sub-godown data still exists in the ledger/serials for
  // whichever future drill-down view needs it; this is purely a display
  // aggregation.
  const topLevelIdById = new Map(locationMasters.map((l: any) => [l.id, l.parentLocationId || l.id]));
  const topLevel = (locationId: string | null) => (locationId ? topLevelIdById.get(locationId) ?? locationId : locationId);

  const key = (itemCode: string, locationId: string | null) => `${itemCode}::${topLevel(locationId) ?? ""}`;

  const itemByCode = new Map(itemMasters.map((i: any) => [i.itemCode, i]));
  const locationById = new Map(locationMasters.filter((l: any) => !l.parentLocationId).map((l: any) => [l.id, l]));
  const settingByKey = new Map<string, any>();
  for (const s of locationSettings) {
    const k = key(s.itemCode, s.locationId);
    const existing = settingByKey.get(k);
    // A sub-godown setting and its parent's own setting could both exist —
    // sum maxLevel/maxLevelPeak across all of CG's children (and CG itself,
    // if it somehow has its own row) so the combined row's targets reflect
    // the whole region, not just whichever one happened to be seen last.
    if (!existing) {
      settingByKey.set(k, { ...s });
    } else {
      existing.maxLevel = (existing.maxLevel ?? 0) + (s.maxLevel ?? 0);
      existing.maxLevelPeak = (existing.maxLevelPeak ?? 0) + (s.maxLevelPeak ?? 0);
    }
  }

  // Show a row for every item+location that has EITHER an explicit Max
  // Level setting OR actual stock activity (transfer, serial, opening
  // import, ...) — a location a CSV import never configured but that a
  // Stock Transfer later moved stock into must still show up here.
  const allKeys = new Map<string, { itemCode: string; locationId: string }>();
  for (const s of locationSettings) allKeys.set(key(s.itemCode, s.locationId), { itemCode: s.itemCode, locationId: topLevel(s.locationId)! });
  for (const r of ledgerRows) if (r.locationId) allKeys.set(key(r.itemCode, r.locationId), { itemCode: r.itemCode, locationId: topLevel(r.locationId)! });
  for (const r of serialRows) if (r.currentLocationId) allKeys.set(key(r.itemCode, r.currentLocationId), { itemCode: r.itemCode, locationId: topLevel(r.currentLocationId)! });

  const liveStockMap = new Map<string, number>();
  const transferInMap = new Map<string, number>();
  const transferOutMap = new Map<string, number>();
  for (const r of ledgerRows) {
    const k = key(r.itemCode, r.locationId);
    liveStockMap.set(k, (liveStockMap.get(k) || 0) + signedLedgerQty(r.txnType, r.qty));
    if (r.txnType === "TRANSFER_IN") transferInMap.set(k, (transferInMap.get(k) || 0) + r.qty);
    if (r.txnType === "TRANSFER_OUT") transferOutMap.set(k, (transferOutMap.get(k) || 0) + r.qty);
  }

  const recentOutMap = new Map<string, number>();
  for (const r of recentOutRows) {
    const k = key(r.itemCode, r.locationId);
    recentOutMap.set(k, (recentOutMap.get(k) || 0) + r.qty);
  }

  // Indent Raised / In-Transit / Lead Time — from PFMS's real pending-stage
  // conditions (lib/sync-pfms.ts), one row per item+location, refreshed
  // wholesale on every sync (see Database/06_pfms_pending_snapshot.sql).
  // CG's children (MANIQUIP, HO) each still get their own indent/PO/lead-time
  // tracking at the PFMS level (indent creation stays unchanged, top-level
  // only) — sum the qty fields and take the soonest lead time across them so
  // the combined CG row reflects the whole region, not just one child.
  const pfmsPendingByKey = new Map<string, any>();
  for (const r of pfmsPendingRows) {
    const k = key(r.itemCode, r.locationId);
    const existing = pfmsPendingByKey.get(k);
    if (!existing) {
      pfmsPendingByKey.set(k, { ...r });
    } else {
      existing.indentRaisedQty = (existing.indentRaisedQty ?? 0) + (r.indentRaisedQty ?? 0);
      existing.poQty = (existing.poQty ?? 0) + (r.poQty ?? 0);
      existing.intransitQty = (existing.intransitQty ?? 0) + (r.intransitQty ?? 0);
      if (r.leadTimeDays !== null && r.leadTimeDays !== undefined) {
        existing.leadTimeDays =
          existing.leadTimeDays === null || existing.leadTimeDays === undefined
            ? r.leadTimeDays
            : Math.min(existing.leadTimeDays, r.leadTimeDays);
      }
    }
  }

  // Total Sales Qty/Value — items sitting in OTP's Pre-Invoice PENDING
  // queue (lib/sync-otp-pending-sales.ts). Item-level only; the queue
  // doesn't carry a reliable warehouse location, so the same total applies
  // to every location-row of that item.
  const salesByItemCode = new Map(salesPendingRows.map((r: any) => [r.itemCode, r]));

  const serialMap = new Map<string, { count: number; nearestWarrantyExpiry: string | null; nearestInvoiceDate: string | null }>();
  for (const r of serialRows) {
    const k = key(r.itemCode, r.currentLocationId);
    const acc = serialMap.get(k) || { count: 0, nearestWarrantyExpiry: null, nearestInvoiceDate: null };
    acc.count += 1;
    if (r.warrantyExpiryDate && (!acc.nearestWarrantyExpiry || r.warrantyExpiryDate < acc.nearestWarrantyExpiry)) {
      acc.nearestWarrantyExpiry = r.warrantyExpiryDate;
    }
    if (r.invoiceDate && (!acc.nearestInvoiceDate || r.invoiceDate < acc.nearestInvoiceDate)) {
      acc.nearestInvoiceDate = r.invoiceDate;
    }
    serialMap.set(k, acc);
  }

  const rows: InventoryRow[] = [];

  for (const { itemCode, locationId } of allKeys.values()) {
    const item = itemByCode.get(itemCode);
    const location = locationById.get(locationId);
    if (!item || !location) continue; // shouldn't happen given FK constraints, but stay defensive

    const k = key(itemCode, locationId);
    const liveStock = liveStockMap.get(k) || 0;
    const setting = settingByKey.get(k);
    const maxLevel = setting?.maxLevel ?? null;
    const maxLevelPeak = setting?.maxLevelPeak ?? null;

    const pfmsPending = pfmsPendingByKey.get(k);
    const indentRaisedQty = pfmsPending?.indentRaisedQty || 0;
    const poQty = pfmsPending?.poQty || 0;
    const materialInTransitQty = pfmsPending?.intransitQty || 0;
    const leadTimeDays = pfmsPending?.leadTimeDays ?? null;

    const sales = salesByItemCode.get(itemCode) || { qty: 0, amount: 0 };
    const serials = serialMap.get(k) || { count: 0, nearestWarrantyExpiry: null, nearestInvoiceDate: null };
    const recentOutQty = recentOutMap.get(k) || 0;

    const targetQty = liveStock + materialInTransitQty;
    const reorderQty = maxLevel !== null ? maxLevel - (liveStock + indentRaisedQty) : null;

    const status: InventoryRow["status"] =
      recentOutQty <= 0 ? "Non-Moving" : recentOutQty >= FAST_MOVING_MIN_OUT_QTY ? "Fast Moving" : "Slow Moving";

    rows.push({
      itemCode,
      itemName: item.itemName,
      itemGroup: item.itemGroup,
      category: item.category,
      uom: item.uom,
      locationCode: location.locationCode,
      locationName: location.locationName,

      liveStock,
      maxLevel,
      maxLevelPeak,
      indentRaisedQty,
      poQty,
      materialInTransitQty,
      targetQty,
      reorderQty,
      leadTimeDays,

      totalSalesQty: sales.qty,
      totalSalesValue: sales.amount,

      stockTransferInQty: transferInMap.get(k) || 0,
      stockTransferOutQty: transferOutMap.get(k) || 0,

      serialCount: serials.count,
      nearestWarrantyExpiry: serials.nearestWarrantyExpiry,
      nearestInvoiceDate: serials.nearestInvoiceDate,

      status,
    });
  }

  return rows;
}
