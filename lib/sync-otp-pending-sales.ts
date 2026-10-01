import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { salesDbSelect, inFilter } from "@/lib/sales-db";

// "Total Sales Qty/Value" on the Inventory page = items currently sitting
// in OTP's Pre-Invoice PENDING queue (committed to a sale, about to be
// dispatched, but not yet invoiced) — distinct from ims_sales_transaction
// (actual completed/invoiced sales via lib/sync-sales.ts, kept separately
// for historical/ABC-EOQ use).
//
// Snapshot, not a ledger — a pending row moves to "invoiced" or
// "cancelled" over time and should stop counting, so this does a full
// delete+reinsert every run rather than upsert-only.

type PreInvoiceQueueRow = {
  quotation_number: string | null;
  items: { item_code?: string; item_name?: string; qty?: number }[] | null;
};

type LtoQuotationItem = {
  quotation_no: string;
  item_code: string | null;
  item_name: string;
  rate: number | null;
};

const EXCLUDED_ITEM_NAMES = ["FREIGHT", "PACKAGING AND FORWARDING"];
const BATCH_SIZE = 500;

export async function syncOtpPendingSales() {
  const supabase = getSupabaseAdmin();

  const pendingRows = await salesDbSelect<PreInvoiceQueueRow>(
    "otp_pre_invoice_queue",
    "select=quotation_number,items&status=eq.pending"
  );

  const quotationNos = Array.from(new Set(pendingRows.map((r) => r.quotation_number).filter(Boolean))) as string[];
  const ltoItems = quotationNos.length
    ? await salesDbSelect<LtoQuotationItem>(
        "lto_make_quotation_items",
        `select=quotation_no,item_code,item_name,rate&quotation_no=in.${inFilter(quotationNos)}`
      )
    : [];

  const rateByKey = new Map<string, number>();
  for (const li of ltoItems) {
    if (li.rate === null) continue;
    rateByKey.set(`${li.quotation_no}::${(li.item_code || li.item_name).toUpperCase().trim()}`, li.rate);
  }

  const itemMasters = await fetchAllRows<{ itemCode: string; itemName: string }>(() =>
    supabase.from("ims_item_master").select("itemCode, itemName")
  );
  const itemCodeSet = new Set(itemMasters.map((i) => i.itemCode.toUpperCase()));
  const itemCodeByName = new Map(itemMasters.map((i) => [i.itemName.toUpperCase().trim(), i.itemCode]));

  const acc = new Map<string, { qty: number; amount: number }>();
  let unmatchedRate = 0;
  let unmatchedItem = 0;

  for (const row of pendingRows) {
    if (!row.quotation_number) continue;

    for (const line of row.items || []) {
      const nameUpper = (line.item_name || "").toUpperCase().trim();
      if (EXCLUDED_ITEM_NAMES.includes(nameUpper) || !line.qty) continue;

      const rateKey = `${row.quotation_number}::${(line.item_code || line.item_name || "").toUpperCase().trim()}`;
      const rate = rateByKey.get(rateKey);
      if (rate === undefined) {
        unmatchedRate++;
        continue;
      }

      let itemCode: string | null = null;
      if (line.item_code && itemCodeSet.has(line.item_code.toUpperCase())) itemCode = line.item_code;
      else if (itemCodeByName.has(nameUpper)) itemCode = itemCodeByName.get(nameUpper)!;
      else {
        unmatchedItem++;
        continue; // no way to attribute this to one of our items without a code match
      }

      const entry = acc.get(itemCode) || { qty: 0, amount: 0 };
      entry.qty += line.qty;
      entry.amount += rate * line.qty;
      acc.set(itemCode, entry);
    }
  }

  const rows = [...acc.entries()].map(([itemCode, v]) => ({ itemCode, qty: v.qty, amount: v.amount }));

  const { error: deleteErr } = await supabase.from("ims_sales_pending_snapshot").delete().not("itemCode", "is", null);
  if (deleteErr) throw new Error(`Snapshot clear failed: ${deleteErr.message}`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("ims_sales_pending_snapshot").insert(batch);
    if (error) throw new Error(`Snapshot batch insert failed: ${error.message}`);
  }

  return { pendingQueueRows: pendingRows.length, itemRows: rows.length, unmatchedRate, unmatchedItem };
}
