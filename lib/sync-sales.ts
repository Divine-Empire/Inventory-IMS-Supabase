import { prisma } from "@/lib/prisma";
import { salesDbSelect, inFilter } from "@/lib/sales-db";

type OtpMakeInvoice = {
  id: string;
  order_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  items: { item_code?: string; item_name?: string; qty?: number }[] | null;
};

type OtpOrder = { id: string; quotation_number: string | null };

type LtoQuotationItem = {
  quotation_no: string;
  item_code: string | null;
  item_name: string;
  rate: number | null;
};

const EXCLUDED_ITEM_NAMES = ["FREIGHT", "PACKAGING AND FORWARDING"];

export async function syncSales() {
  const invoices = await salesDbSelect<OtpMakeInvoice>(
    "otp_make_invoice",
    "select=id,order_id,invoice_number,invoice_date,items"
  );

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

  const itemMasters = await prisma.itemMaster.findMany({ select: { itemCode: true, itemName: true } });
  const itemCodeSet = new Set(itemMasters.map((i) => i.itemCode.toUpperCase()));
  const itemCodeByName = new Map(itemMasters.map((i) => [i.itemName.toUpperCase().trim(), i.itemCode]));

  let rowsUpserted = 0;
  let unmatchedOrder = 0;
  let unmatchedRate = 0;
  let unmatchedItem = 0;

  for (const invoice of invoices) {
    const quotationNo = quotationByOrderId.get(invoice.order_id);
    if (!quotationNo) {
      unmatchedOrder++;
      continue;
    }

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

      const existing = await prisma.salesTransaction.findFirst({
        where: { quotationNo, invoiceNo, itemCode: itemCode ?? undefined, itemNameRaw: itemCode ? undefined : line.item_name },
      });

      const data = {
        quotationNo,
        itemCode,
        itemNameRaw: line.item_name || null,
        qty,
        rate,
        amount,
        invoiceNo,
        invoiceDate: invoice.invoice_date ? new Date(invoice.invoice_date) : null,
        sourceSystem: "OTP+LTO",
      };

      if (existing) {
        await prisma.salesTransaction.update({ where: { id: existing.id }, data });
      } else {
        await prisma.salesTransaction.create({ data });
      }
      rowsUpserted++;
    }
  }

  return {
    invoicesProcessed: invoices.length,
    rowsUpserted,
    unmatchedOrder,
    unmatchedRate,
    unmatchedItem,
  };
}
