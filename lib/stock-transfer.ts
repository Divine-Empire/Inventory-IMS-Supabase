import { getSupabaseAdmin } from "@/lib/supabase";

export class StockTransferError extends Error {}

async function nextTransferNo(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from("ims_stock_transfer").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  const seq = String((count ?? 0) + 1).padStart(5, "0");
  return `ST-${seq}`;
}

export async function createTransfer(params: {
  fromLocationCode: string;
  toLocationCode: string;
  requestedBy?: string;
  items: { itemCode: string; qty: number; serialNumbers?: string[] }[];
}) {
  const supabase = getSupabaseAdmin();

  if (params.fromLocationCode === params.toLocationCode) {
    throw new StockTransferError("From and To location must be different");
  }
  if (!params.items.length) {
    throw new StockTransferError("Add at least one item to transfer");
  }

  const [{ data: fromLocation }, { data: toLocation }] = await Promise.all([
    supabase.from("ims_location_master").select("id").eq("locationCode", params.fromLocationCode).maybeSingle(),
    supabase.from("ims_location_master").select("id").eq("locationCode", params.toLocationCode).maybeSingle(),
  ]);
  if (!fromLocation) throw new StockTransferError(`Unknown location "${params.fromLocationCode}"`);
  if (!toLocation) throw new StockTransferError(`Unknown location "${params.toLocationCode}"`);

  for (const item of params.items) {
    if (item.serialNumbers && item.serialNumbers.length > 0 && item.serialNumbers.length !== item.qty) {
      throw new StockTransferError(
        `Item ${item.itemCode}: qty (${item.qty}) must match the number of serial numbers listed (${item.serialNumbers.length})`
      );
    }
  }

  const transferNo = await nextTransferNo();

  const { data: transfer, error: transferErr } = await supabase
    .from("ims_stock_transfer")
    .insert({
      transferNo,
      fromLocationId: fromLocation.id,
      toLocationId: toLocation.id,
      status: "pending",
      requestedBy: params.requestedBy,
    })
    .select()
    .single();
  if (transferErr) throw new Error(transferErr.message);

  const { error: itemsErr } = await supabase.from("ims_stock_transfer_item").insert(
    params.items.map((i) => ({
      transferId: transfer.id,
      itemCode: i.itemCode,
      qty: i.qty,
      serialNumbers: i.serialNumbers ?? [],
    }))
  );
  if (itemsErr) throw new Error(itemsErr.message);

  return getTransferWithDetails(transfer.id);
}

async function getTransferWithDetails(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ims_stock_transfer")
    .select("*, items:ims_stock_transfer_item(*), fromLocation:ims_location_master!ims_stock_transfer_fromLocationId_fkey(*), toLocation:ims_location_master!ims_stock_transfer_toLocationId_fkey(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function shipTransfer(transferId: string, approvedBy?: string) {
  const supabase = getSupabaseAdmin();

  const { data: transfer, error: transferErr } = await supabase
    .from("ims_stock_transfer")
    .select("*, items:ims_stock_transfer_item(*)")
    .eq("id", transferId)
    .maybeSingle();
  if (transferErr) throw new Error(transferErr.message);
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "pending") {
    throw new StockTransferError(`Transfer is already "${transfer.status}" — cannot ship again`);
  }

  for (const item of transfer.items) {
    for (const serialNo of item.serialNumbers) {
      const { data: serial } = await supabase
        .from("ims_serial_number")
        .select("status, currentLocationId")
        .eq("serialNo", serialNo)
        .maybeSingle();
      if (!serial || serial.status !== "IN_STOCK" || serial.currentLocationId !== transfer.fromLocationId) {
        throw new StockTransferError(`Serial "${serialNo}" is not in stock at the source location`);
      }
    }
  }

  for (const item of transfer.items) {
    const { error: ledgerErr } = await supabase.from("ims_stock_ledger").insert({
      itemCode: item.itemCode,
      locationId: transfer.fromLocationId,
      txnType: "TRANSFER_OUT",
      qty: item.qty,
      referenceType: "Stock Transfer",
      referenceNo: transfer.transferNo,
    });
    if (ledgerErr) throw new Error(ledgerErr.message);

    for (const serialNo of item.serialNumbers) {
      const { error: serialErr } = await supabase
        .from("ims_serial_number")
        .update({ status: "TRANSFERRED", currentLocationId: null })
        .eq("serialNo", serialNo);
      if (serialErr) throw new Error(serialErr.message);
    }
  }

  const { error: updateErr } = await supabase
    .from("ims_stock_transfer")
    .update({ status: "in_transit", approvedBy })
    .eq("id", transferId);
  if (updateErr) throw new Error(updateErr.message);

  return getTransferWithDetails(transferId);
}

export async function receiveTransfer(transferId: string, receivedBy?: string) {
  const supabase = getSupabaseAdmin();

  const { data: transfer, error: transferErr } = await supabase
    .from("ims_stock_transfer")
    .select("*, items:ims_stock_transfer_item(*)")
    .eq("id", transferId)
    .maybeSingle();
  if (transferErr) throw new Error(transferErr.message);
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "in_transit") {
    throw new StockTransferError(`Transfer must be "in_transit" to receive (currently "${transfer.status}")`);
  }

  for (const item of transfer.items) {
    const { error: ledgerErr } = await supabase.from("ims_stock_ledger").insert({
      itemCode: item.itemCode,
      locationId: transfer.toLocationId,
      txnType: "TRANSFER_IN",
      qty: item.qty,
      referenceType: "Stock Transfer",
      referenceNo: transfer.transferNo,
    });
    if (ledgerErr) throw new Error(ledgerErr.message);

    for (const serialNo of item.serialNumbers) {
      const { error: serialErr } = await supabase
        .from("ims_serial_number")
        .update({ status: "IN_STOCK", currentLocationId: transfer.toLocationId })
        .eq("serialNo", serialNo);
      if (serialErr) throw new Error(serialErr.message);
    }
  }

  const { error: updateErr } = await supabase
    .from("ims_stock_transfer")
    .update({ status: "received", receivedBy })
    .eq("id", transferId);
  if (updateErr) throw new Error(updateErr.message);

  return getTransferWithDetails(transferId);
}

export async function cancelTransfer(transferId: string) {
  const supabase = getSupabaseAdmin();

  const { data: transfer, error: transferErr } = await supabase
    .from("ims_stock_transfer")
    .select("status")
    .eq("id", transferId)
    .maybeSingle();
  if (transferErr) throw new Error(transferErr.message);
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "pending") {
    throw new StockTransferError(`Only a "pending" transfer can be cancelled (currently "${transfer.status}")`);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("ims_stock_transfer")
    .update({ status: "cancelled" })
    .eq("id", transferId)
    .select()
    .single();
  if (updateErr) throw new Error(updateErr.message);
  return updated;
}
