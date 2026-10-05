import { getSupabaseAdmin } from "@/lib/supabase";
import { salesDbSelect, inFilter } from "@/lib/sales-db";
import { resolveOtpDispatchLocationCode, resolveOtpSubGodownCode } from "@/lib/otp-location-aliases";

// Historical, ACCUMULATING record of actual completed/invoiced sales
// (otp_make_invoice x lto_make_quotation_items rate) — distinct from
// ims_sales_pending_snapshot (Inventory page's "Total Sales Qty/Value",
// which is OTP's live Pre-Invoice PENDING queue and empties out as things
// get invoiced). This table is the correct source for any month-over-month
// / financial-year analysis (Seasonality, ABC-FSN) — see
// lib/abc-fsn-analysis.ts.
//
// Batched upsert (not a per-row existence check + insert/update loop) —
// see Database/09_sales_transaction_dedupe_key.sql for why a dedupeKey
// column exists to make this possible.

type OtpMakeInvoice = {
  id: string;
  order_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  pre_invoice_queue_id: string | null;
  items: { item_code?: string; item_name?: string; qty?: number }[] | null;
};

type OtpOrder = { id: string; quotation_number: string | null };

type OtpPreInvoiceQueue = { id: string; dispatch_location: string | null; sub_godown: string | null };

type LtoQuotationItem = {
  quotation_no: string;
  item_code: string | null;
  item_name: string;
  rate: number | null;
};

const EXCLUDED_ITEM_NAMES = ["FREIGHT", "PACKAGING AND FORWARDING"];
const BATCH_SIZE = 500;

export async function syncSales() {
  const supabase = getSupabaseAdmin();

  const { data: locations, error: locErr } = await supabase.from("ims_location_master").select("id, locationCode");
  if (locErr) throw new Error(locErr.message);
  const locationIdByCode = new Map((locations || []).map((l) => [l.locationCode, l.id]));

  const invoices = await salesDbSelect<OtpMakeInvoice>(
    "otp_make_invoice",
    "select=id,order_id,invoice_number,invoice_date,pre_invoice_queue_id,items"
  );

  const queueIds = Array.from(new Set(invoices.map((i) => i.pre_invoice_queue_id).filter(Boolean))) as string[];
  const queues = queueIds.length
    ? await salesDbSelect<OtpPreInvoiceQueue>(
        "otp_pre_invoice_queue",
        `select=id,dispatch_location,sub_godown&id=in.${inFilter(queueIds)}`
      )
    : [];
  const queueById = new Map(queues.map((q) => [q.id, q]));

  const orderIds = invoices.map((i) => i.order_id);
  const orders = orderIds.length
    ? await salesDbSelect<OtpOrder>("otp_orders", `select=id,quotation_number&id=in.${inFilter(orderIds)}`)
    : [];
  const quotationByOrderId = new Map(orders.map((o) => [o.id, o.quotation_number]));

  const quotationNos = Array.from(new Set(orders.map((o) => o.quotation_number).filter(Boolean))) as string[];
  const ltoItems = quotationNos.length
    ? await salesDbSelect<LtoQuotationItem>(
        "lto_make_quotation_items",
        `select=quotation_no,item_code,item_name,rate&quotation_no=in.${inFilter(quotationNos)}`
      )
    : [];

  // rate lookup keyed by quotation_no + item_code (falls back to item_name when item_code is missing)
  const rateByKey = new Map<string, number>();
  for (const li of ltoItems) {
    if (li.rate === null) continue;
    const key = `${li.quotation_no}::${(li.item_code || li.item_name).toUpperCase().trim()}`;
    rateByKey.set(key, li.rate);
  }

  const { data: itemMasters, error: itemErr } = await supabase.from("ims_item_master").select("itemCode, itemName");
  if (itemErr) throw new Error(itemErr.message);

  const itemCodeSet = new Set((itemMasters || []).map((i) => i.itemCode.toUpperCase()));
  const itemCodeByName = new Map((itemMasters || []).map((i) => [i.itemName.toUpperCase().trim(), i.itemCode]));

  let unmatchedOrder = 0;
  let unmatchedRate = 0;
  let unmatchedItem = 0;

  const toUpsert: Record<string, any>[] = [];

  for (const invoice of invoices) {
    const quotationNo = quotationByOrderId.get(invoice.order_id);
    if (!quotationNo) {
      unmatchedOrder++;
      continue;
    }

    const queue = invoice.pre_invoice_queue_id ? queueById.get(invoice.pre_invoice_queue_id) : null;
    // Prefer the sub-godown captured at Packing List (more precise — resolves
    // straight to a CG child) over dispatch_location (captured later, at
    // Pre-Invoice, coarser — top-level only).
    const subGodownCode = resolveOtpSubGodownCode(queue?.sub_godown);
    const dispatchLocationCode = resolveOtpDispatchLocationCode(queue?.dispatch_location);
    const resolvedCode = subGodownCode ?? dispatchLocationCode;
    const locationId = resolvedCode ? locationIdByCode.get(resolvedCode) ?? null : null;

    for (const line of invoice.items || []) {
      const nameUpper = (line.item_name || "").toUpperCase().trim();
      if (EXCLUDED_ITEM_NAMES.includes(nameUpper)) continue;
      if (!line.qty) continue;

      const rateKey = `${quotationNo}::${(line.item_code || line.item_name || "").toUpperCase().trim()}`;
      const rate = rateByKey.get(rateKey);
      if (rate === undefined) {
        unmatchedRate++;
        continue;
      }

      let itemCode: string | null = null;
      if (line.item_code && itemCodeSet.has(line.item_code.toUpperCase())) {
        itemCode = line.item_code;
      } else if (itemCodeByName.has(nameUpper)) {
        itemCode = itemCodeByName.get(nameUpper)!;
      } else {
        unmatchedItem++;
      }

      const qty = line.qty;
      const amount = rate * qty;
      const invoiceNo = invoice.invoice_number || invoice.id;
      const itemNameRaw = line.item_name || null;

      toUpsert.push({
        quotationNo,
        itemCode,
        itemNameRaw,
        qty,
        rate,
        amount,
        invoiceNo,
        invoiceDate: invoice.invoice_date || null,
        locationId,
        sourceSystem: "OTP+LTO",
        dedupeKey: itemCode || itemNameRaw || "",
      });
    }
  }

  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("ims_sales_transaction")
      .upsert(batch, { onConflict: "quotationNo,invoiceNo,dedupeKey" });
    if (error) throw new Error(`Batch upsert failed: ${error.message}`);
  }

  return {
    invoicesProcessed: invoices.length,
    rowsUpserted: toUpsert.length,
    unmatchedOrder,
    unmatchedRate,
    unmatchedItem,
  };
}
