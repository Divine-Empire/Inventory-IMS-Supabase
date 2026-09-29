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
  indentRaisedQty: number;
  poQty: number;
  pendingPoQty: number; // poQty - receivedQty, floored at 0
  materialInTransitQty: number;
  leadTimeDays: number | null;

  targetQty: number; // liveStock + materialInTransitQty
  maxLevel: number | null;
  reorderQty: number | null; // maxLevel - (liveStock + indentRaisedQty)

  status: "Fast Moving" | "Slow Moving" | "Non-Moving";

  totalSalesQty: number;
  totalSalesValue: number;

  stockTransferInQty: number;
  stockTransferOutQty: number;

  serialCount: number;
  nearestWarrantyExpiry: string | null; // ISO date of soonest-expiring in-stock serial
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

  const [locationSettings, ledgerRows, indentPoRows, salesRows, serialRows, recentOutRows] = await Promise.all([
    fetchAllRows<any>(() =>
      supabase
        .from("ims_item_location_setting")
        .select(
          "itemCode, locationId, maxLevel, item:ims_item_master(itemName, itemGroup, category, uom, defaultLeadTimeDays), location:ims_location_master(locationCode, locationName)"
        )
    ),
    fetchAllRows<any>(() => supabase.from("ims_stock_ledger").select("itemCode, locationId, txnType, qty")),
    fetchAllRows<any>(() =>
      supabase.from("ims_indent_po_sync").select("itemCode, locationId, indentQty, poQty, receivedQty, intransitQty")
    ),
    fetchAllRows<any>(() => supabase.from("ims_sales_transaction").select("itemCode, locationId, qty, amount")),
    fetchAllRows<any>(() =>
      supabase
        .from("ims_serial_number")
        .select("itemCode, currentLocationId, warrantyExpiryDate, invoiceDate")
        .eq("status", "IN_STOCK")
    ),
    fetchAllRows<any>(() =>
      supabase.from("ims_stock_ledger").select("itemCode, locationId, qty").eq("txnType", "OUT").gte("createdAt", cutoff)
    ),
  ]);

  const key = (itemCode: string, locationId: string | null) => `${itemCode}::${locationId ?? ""}`;

  const liveStockMap = new Map<string, number>();
  const transferInMap = new Map<string, number>();
  const transferOutMap = new Map<string, number>();
  for (const r of ledgerRows || []) {
    const k = key(r.itemCode, r.locationId);
    liveStockMap.set(k, (liveStockMap.get(k) || 0) + signedLedgerQty(r.txnType, r.qty));
    if (r.txnType === "TRANSFER_IN") transferInMap.set(k, (transferInMap.get(k) || 0) + r.qty);
    if (r.txnType === "TRANSFER_OUT") transferOutMap.set(k, (transferOutMap.get(k) || 0) + r.qty);
  }

  const recentOutMap = new Map<string, number>();
  for (const r of recentOutRows || []) {
    const k = key(r.itemCode, r.locationId);
    recentOutMap.set(k, (recentOutMap.get(k) || 0) + r.qty);
  }

  const indentMap = new Map<string, { indentQty: number; poQty: number; receivedQty: number; intransitQty: number }>();
  for (const r of indentPoRows || []) {
    if (!r.itemCode) continue;
    const k = key(r.itemCode, r.locationId);
    const acc = indentMap.get(k) || { indentQty: 0, poQty: 0, receivedQty: 0, intransitQty: 0 };
    acc.indentQty += r.indentQty || 0;
    acc.poQty += r.poQty || 0;
    acc.receivedQty += r.receivedQty || 0;
    acc.intransitQty += r.intransitQty || 0;
    indentMap.set(k, acc);
  }

  const salesMap = new Map<string, { qty: number; amount: number }>();
  for (const r of salesRows || []) {
    if (!r.itemCode) continue;
    const k = key(r.itemCode, r.locationId);
    const acc = salesMap.get(k) || { qty: 0, amount: 0 };
    acc.qty += r.qty || 0;
    acc.amount += r.amount || 0;
    salesMap.set(k, acc);
  }

  const serialMap = new Map<string, { count: number; nearestExpiry: string | null }>();
  for (const r of serialRows || []) {
    const k = key(r.itemCode, r.currentLocationId);
    const acc = serialMap.get(k) || { count: 0, nearestExpiry: null };
    acc.count += 1;
    const expiry = r.warrantyExpiryDate ?? r.invoiceDate;
    if (expiry && (!acc.nearestExpiry || expiry < acc.nearestExpiry)) acc.nearestExpiry = expiry;
    serialMap.set(k, acc);
  }

  return (locationSettings || []).map((setting: any) => {
    const k = key(setting.itemCode, setting.locationId);
    const liveStock = liveStockMap.get(k) || 0;
    const indent = indentMap.get(k) || { indentQty: 0, poQty: 0, receivedQty: 0, intransitQty: 0 };
    const sales = salesMap.get(k) || { qty: 0, amount: 0 };
    const serials = serialMap.get(k) || { count: 0, nearestExpiry: null };
    const recentOutQty = recentOutMap.get(k) || 0;

    const pendingPoQty = Math.max(0, indent.poQty - indent.receivedQty);
    const targetQty = liveStock + indent.intransitQty;
    const reorderQty = setting.maxLevel !== null ? setting.maxLevel - (liveStock + indent.indentQty) : null;

    const status: InventoryRow["status"] =
      recentOutQty <= 0 ? "Non-Moving" : recentOutQty >= FAST_MOVING_MIN_OUT_QTY ? "Fast Moving" : "Slow Moving";

    return {
      itemCode: setting.itemCode,
      itemName: setting.item.itemName,
      itemGroup: setting.item.itemGroup,
      category: setting.item.category,
      uom: setting.item.uom,
      locationCode: setting.location.locationCode,
      locationName: setting.location.locationName,

      liveStock,
      indentRaisedQty: indent.indentQty,
      poQty: indent.poQty,
      pendingPoQty,
      materialInTransitQty: indent.intransitQty,
      leadTimeDays: setting.item.defaultLeadTimeDays,

      targetQty,
      maxLevel: setting.maxLevel,
      reorderQty,

      status,

      totalSalesQty: sales.qty,
      totalSalesValue: sales.amount,

      stockTransferInQty: transferInMap.get(k) || 0,
      stockTransferOutQty: transferOutMap.get(k) || 0,

      serialCount: serials.count,
      nearestWarrantyExpiry: serials.nearestExpiry,
    };
  });
}
