import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { salesDbSelect, inFilter } from "@/lib/sales-db";
import { resolveGodownCode } from "@/lib/godown-codes";
import { consumeReservation, releaseReservation, reserveStock, type ReserveItem } from "@/lib/integrations/stock";

// Fallback for OTP's live reserve / release / consume calls. If OTP couldn't
// reach IMS at the time, IMS would be left with a stale picture: a processed
// wave's stock still "reserved" and never booked OUT, a cancelled wave's
// stock still held, or a freshly queued wave not reserved at all. This reads
// each wave's real status from otp_pre_invoice_queue and finishes the job:
//   ACTIVE reservation, wave invoiced (Pre-Invoice processed) -> consume (OUT)
//   ACTIVE reservation, wave cancelled / emptied              -> release
//   ACTIVE reservation, wave still pending                    -> left alone
//   pending wave with NO reservation at all                   -> reserve it
// Idempotent — consume, release and reserve are all safe to repeat.

type QueueItem = { item_name?: string; qty?: number | string; serials?: string[]; serial_no?: string };
type QueueRow = { id: string; status: string; items: QueueItem[] | null; order_id?: string };

/** Queue items (lump rows with serials[], or one row per serial with serial_no) -> one entry per item name. */
function groupItems(items: QueueItem[] | null | undefined): ReserveItem[] {
  const byName = new Map<string, { itemName: string; qty: number; serials: string[] }>();
  for (const it of items || []) {
    if (!it.item_name) continue;
    const key = it.item_name.trim().toLowerCase();
    const entry = byName.get(key) || { itemName: it.item_name, qty: 0, serials: [] as string[] };
    entry.qty += Number(it.qty) || 0;
    for (const s of [...(it.serials || []), ...(it.serial_no ? [it.serial_no] : [])]) {
      const serial = s.trim();
      if (serial && !entry.serials.includes(serial)) entry.serials.push(serial);
    }
    byName.set(key, entry);
  }
  return Array.from(byName.values()).filter((e) => e.qty > 0);
}

export async function syncReservations() {
  const supabase = getSupabaseAdmin();

  const [reservations, locations] = await Promise.all([
    fetchAllRows<{ waveId: string; locationId: string; orderNo: string | null; status: string }>(() =>
      supabase.from("ims_stock_reservation").select("waveId, locationId, orderNo, status")
    ),
    fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode")),
  ]);

  const locationCodeById = new Map(locations.map((l) => [l.id, l.locationCode]));
  const wavesWithAnyReservation = new Set(reservations.map((r) => r.waveId));
  const locationByWave = new Map<string, string>();
  const orderNoByWave = new Map<string, string | null>();
  for (const r of reservations) {
    if (r.status !== "ACTIVE") continue;
    if (!locationByWave.has(r.waveId)) locationByWave.set(r.waveId, r.locationId);
    if (!orderNoByWave.has(r.waveId)) orderNoByWave.set(r.waveId, r.orderNo);
  }
  const activeWaveIds = Array.from(locationByWave.keys());

  const queueRows: QueueRow[] = [];
  for (let i = 0; i < activeWaveIds.length; i += 50) {
    queueRows.push(
      ...(await salesDbSelect<QueueRow>("otp_pre_invoice_queue", `select=id,status,items&id=in.${inFilter(activeWaveIds.slice(i, i + 50))}`))
    );
  }
  const queueById = new Map(queueRows.map((q) => [q.id, q]));

  let consumed = 0;
  let released = 0;
  let stillPending = 0;
  let notFound = 0;

  for (const waveId of activeWaveIds) {
    const queue = queueById.get(waveId);
    if (!queue) {
      notFound++;
      continue;
    }

    if (queue.status === "invoiced") {
      await consumeReservation({
        waveId,
        orderNo: orderNoByWave.get(waveId) ?? undefined,
        referenceNo: orderNoByWave.get(waveId) ?? undefined,
        locationCode: locationCodeById.get(locationByWave.get(waveId)!),
        items: groupItems(queue.items),
      });
      consumed++;
    } else if (queue.status === "cancelled") {
      await releaseReservation({ waveId });
      released++;
    } else {
      stillPending++;
    }
  }

  // Pending waves IMS never heard about (OTP couldn't reach IMS when the wave
  // was queued). Needs the order's own location to know which godown holds it.
  const pendingWaves = await salesDbSelect<QueueRow>("otp_pre_invoice_queue", "select=id,status,items,order_id&status=eq.pending");
  const unreserved = pendingWaves.filter((w) => !wavesWithAnyReservation.has(w.id) && groupItems(w.items).length > 0);

  let reservedMissing = 0;
  let skippedNoLocation = 0;
  let skippedNothingToReserve = 0; // none of the wave's items are known to IMS
  if (unreserved.length > 0) {
    const orders: { id: string; order_no: string | null; order_location: string | null }[] = [];
    const orderIds = Array.from(new Set(unreserved.map((w) => w.order_id).filter(Boolean) as string[]));
    for (let i = 0; i < orderIds.length; i += 50) {
      orders.push(
        ...(await salesDbSelect("otp_orders", `select=id,order_no,order_location&id=in.${inFilter(orderIds.slice(i, i + 50))}`))
      );
    }
    const orderById = new Map(orders.map((o) => [o.id, o]));

    for (const wave of unreserved) {
      const order = wave.order_id ? orderById.get(wave.order_id) : undefined;
      const locationCode = resolveGodownCode(order?.order_location);
      if (!order || !locationCode) {
        skippedNoLocation++;
        continue;
      }
      const result = await reserveStock({ waveId: wave.id, orderNo: order.order_no ?? undefined, locationCode, items: groupItems(wave.items) });
      if (result.items.some((i) => i.reservedQty > 0)) reservedMissing++;
      else skippedNothingToReserve++;
    }
  }

  return { activeWaves: activeWaveIds.length, consumed, released, stillPending, notFound, reservedMissing, skippedNoLocation, skippedNothingToReserve };
}
