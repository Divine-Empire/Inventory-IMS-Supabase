import { getSupabaseAdmin } from "@/lib/supabase";

export class SerialScanError extends Error {}

async function resolveLocation(locationCode: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ims_location_master")
    .select("id, locationCode")
    .eq("locationCode", locationCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new SerialScanError(`Unknown location "${locationCode}"`);
  return data;
}

export async function serialScanIn(params: {
  itemCode: string;
  locationCode: string;
  serialNo: string;
  warrantyExpiryDate: string | null;
  invoiceDate: string | null;
  createdBy?: string;
}) {
  const supabase = getSupabaseAdmin();
  const serialNo = params.serialNo.trim();
  if (!serialNo) throw new SerialScanError("Serial number is required");
  if (!params.warrantyExpiryDate && !params.invoiceDate) {
    throw new SerialScanError("Either Warranty Expiry Date or Invoice Date is required");
  }

  const { data: item, error: itemErr } = await supabase
    .from("ims_item_master")
    .select("itemCode")
    .eq("itemCode", params.itemCode)
    .maybeSingle();
  if (itemErr) throw new Error(itemErr.message);
  if (!item) throw new SerialScanError(`Unknown item code "${params.itemCode}"`);

  const location = await resolveLocation(params.locationCode);

  const { data: existing, error: existingErr } = await supabase
    .from("ims_serial_number")
    .select("serialNo, itemCode, status")
    .eq("serialNo", serialNo)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  if (existing && existing.status === "IN_STOCK") {
    throw new SerialScanError(
      `Serial "${serialNo}" is already IN STOCK (item ${existing.itemCode}). Scan it OUT first before scanning IN again.`
    );
  }

  const { data: ledgerEntry, error: ledgerErr } = await supabase
    .from("ims_stock_ledger")
    .insert({
      itemCode: item.itemCode,
      locationId: location.id,
      txnType: "IN",
      qty: 1,
      serialNo,
      referenceType: "Serial IN",
      createdBy: params.createdBy,
    })
    .select("id")
    .single();
  if (ledgerErr) throw new Error(ledgerErr.message);

  const serialData = {
    itemCode: item.itemCode,
    serialNo,
    currentLocationId: location.id,
    status: "IN_STOCK",
    warrantyExpiryDate: params.warrantyExpiryDate,
    invoiceDate: params.invoiceDate,
    inTxnId: ledgerEntry.id,
    outTxnId: null,
  };

  const { data: serial, error: serialErr } = await supabase
    .from("ims_serial_number")
    .upsert(serialData, { onConflict: "serialNo" })
    .select()
    .single();
  if (serialErr) throw new Error(serialErr.message);

  return serial;
}

function expiryKey(s: { warrantyExpiryDate: string | null; invoiceDate: string | null }): string {
  return s.warrantyExpiryDate ?? s.invoiceDate ?? "9999-12-31";
}

export async function serialScanOut(params: {
  locationCode: string;
  serialNo: string;
  override?: boolean;
  createdBy?: string;
}) {
  const supabase = getSupabaseAdmin();
  const serialNo = params.serialNo.trim();
  const location = await resolveLocation(params.locationCode);

  const { data: serial, error: serialErr } = await supabase
    .from("ims_serial_number")
    .select("*")
    .eq("serialNo", serialNo)
    .maybeSingle();
  if (serialErr) throw new Error(serialErr.message);
  if (!serial) throw new SerialScanError(`Unknown serial number "${serialNo}" — it was never scanned IN.`);

  if (serial.status !== "IN_STOCK") {
    throw new SerialScanError(`Serial "${serialNo}" is not in stock (current status: ${serial.status}).`);
  }

  if (serial.currentLocationId !== location.id) {
    const { data: actualLocation } = serial.currentLocationId
      ? await supabase.from("ims_location_master").select("locationCode").eq("id", serial.currentLocationId).maybeSingle()
      : { data: null };
    throw new SerialScanError(
      `Serial "${serialNo}" is in stock at ${actualLocation?.locationCode ?? "an unknown location"}, not at ${params.locationCode}.`
    );
  }

  // FIFO / oldest-stock-first advisory: if older stock of the same item+location
  // exists, warn before letting a newer-dated serial go OUT first.
  const { data: siblings, error: siblingsErr } = await supabase
    .from("ims_serial_number")
    .select("serialNo, warrantyExpiryDate, invoiceDate")
    .eq("itemCode", serial.itemCode)
    .eq("currentLocationId", location.id)
    .eq("status", "IN_STOCK");
  if (siblingsErr) throw new Error(siblingsErr.message);

  const sorted = [...(siblings || [])].sort((a, b) => (expiryKey(a) < expiryKey(b) ? -1 : expiryKey(a) > expiryKey(b) ? 1 : 0));
  const oldest = sorted[0];

  if (oldest && oldest.serialNo !== serial.serialNo && !params.override) {
    return {
      needsConfirmation: true as const,
      message: `Older stock is already available for this item: Serial "${oldest.serialNo}" (${
        oldest.warrantyExpiryDate ? "warranty expiry" : "invoice date"
      } ${(oldest.warrantyExpiryDate ?? oldest.invoiceDate)?.slice(0, 10)}). Use that one first, or confirm to proceed with this scan anyway.`,
      oldestSerial: oldest,
    };
  }

  const { data: ledgerEntry, error: ledgerErr } = await supabase
    .from("ims_stock_ledger")
    .insert({
      itemCode: serial.itemCode,
      locationId: location.id,
      txnType: "OUT",
      qty: 1,
      serialNo,
      referenceType: "Serial OUT",
      createdBy: params.createdBy,
    })
    .select("id")
    .single();
  if (ledgerErr) throw new Error(ledgerErr.message);

  const { data: updated, error: updateErr } = await supabase
    .from("ims_serial_number")
    .update({ status: "OUT", outTxnId: ledgerEntry.id })
    .eq("serialNo", serialNo)
    .select()
    .single();
  if (updateErr) throw new Error(updateErr.message);

  return { needsConfirmation: false as const, serial: updated };
}
