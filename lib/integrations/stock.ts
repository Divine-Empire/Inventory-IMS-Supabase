import { getSupabaseAdmin, fetchAllRows, fetchAllRowsIn } from "@/lib/supabase";
import { signedLedgerQty } from "@/lib/inventory";
import { resolveGodownCode } from "@/lib/godown-codes";
import { IntegrationError } from "@/lib/integrations/http";

// Location-level stock for OTP. Everything here is EXACT-location: unlike
// the Inventory page (lib/inventory.ts), CG's children are never rolled up
// into CG — a Packing List needs to know what is physically in the godown
// it is packing from. Stock that predates the sub-godown split (sitting on
// the plain CG parent) is reported separately as `unassignedCgQty`.
//
// Items are matched by NAME (lower(trim)), never by code: OTP's items carry
// LTO's item code, which doesn't match PFMS/IMS's. One name can map to
// several codes; all of them count.

type Loc = { id: string; locationCode: string; parentLocationId: string | null };
type ItemRow = { itemCode: string; itemName: string };

const nameKey = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const dateOnly = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

async function loadLocations(): Promise<Loc[]> {
  const supabase = getSupabaseAdmin();
  return fetchAllRows<Loc>(() => supabase.from("ims_location_master").select("id, locationCode, parentLocationId"));
}

function requireLocation(locations: Loc[], rawCode: string | null | undefined): Loc {
  const code = resolveGodownCode(rawCode);
  const loc = code ? locations.find((l) => l.locationCode === code) : undefined;
  if (!loc) throw new IntegrationError(`Unknown location "${rawCode ?? ""}"`);
  return loc;
}

async function loadItems() {
  const supabase = getSupabaseAdmin();
  const rows = await fetchAllRows<ItemRow>(() => supabase.from("ims_item_master").select("itemCode, itemName"));
  const codesByName = new Map<string, string[]>();
  const nameByCode = new Map<string, string>();
  for (const r of rows) {
    nameByCode.set(r.itemCode, r.itemName);
    const k = nameKey(r.itemName);
    codesByName.set(k, [...(codesByName.get(k) || []), r.itemCode]);
  }
  return { codesByName, nameByCode };
}

/** locationId -> itemCode -> signed ledger sum (same formula as lib/inventory.ts). */
async function onHandByLocation(itemCodes: string[]) {
  const supabase = getSupabaseAdmin();
  const rows = await fetchAllRowsIn<{ itemCode: string; locationId: string; txnType: string; qty: number }>(
    (chunk) => supabase.from("ims_stock_ledger").select("itemCode, locationId, txnType, qty").in("itemCode", chunk),
    itemCodes
  );
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const perItem = out.get(r.locationId) || new Map<string, number>();
    perItem.set(r.itemCode, (perItem.get(r.itemCode) || 0) + signedLedgerQty(r.txnType, r.qty));
    out.set(r.locationId, perItem);
  }
  return out;
}

/** locationId -> itemCode -> ACTIVE reserved qty. */
async function reservedByLocation(itemCodes: string[]) {
  const supabase = getSupabaseAdmin();
  const rows = await fetchAllRowsIn<{ itemCode: string; locationId: string; qty: number; serialNo: string | null }>(
    (chunk) =>
      supabase.from("ims_stock_reservation").select("itemCode, locationId, qty, serialNo").eq("status", "ACTIVE").in("itemCode", chunk),
    itemCodes
  );
  const qty = new Map<string, Map<string, number>>();
  const serials = new Set<string>();
  for (const r of rows) {
    const perItem = qty.get(r.locationId) || new Map<string, number>();
    perItem.set(r.itemCode, (perItem.get(r.itemCode) || 0) + r.qty);
    qty.set(r.locationId, perItem);
    if (r.serialNo) serials.add(r.serialNo);
  }
  return { qty, serials };
}

const sum = (m: Map<string, number> | undefined, codes: string[]) => codes.reduce((s, c) => s + (m?.get(c) || 0), 0);

// ---------------------------------------------------------------- availability

export async function getStockAvailability(params: {
  locationCode: string;
  items: { itemName: string; requiredQty?: number }[];
}) {
  const supabase = getSupabaseAdmin();
  const items = params.items || [];
  if (!Array.isArray(items)) throw new IntegrationError("items must be an array");

  const [locations, { codesByName }] = await Promise.all([loadLocations(), loadItems()]);
  const loc = requireLocation(locations, params.locationCode);
  const cgParent = locations.find((l) => l.locationCode === "CG");
  const isCgChild = !!cgParent && loc.parentLocationId === cgParent.id;

  const codesFor = (name: string) => codesByName.get(nameKey(name)) || [];
  const allCodes = Array.from(new Set(items.flatMap((i) => codesFor(i.itemName))));

  const [onHand, reserved, serialRows] = allCodes.length
    ? await Promise.all([
        onHandByLocation(allCodes),
        reservedByLocation(allCodes),
        fetchAllRowsIn<{ serialNo: string; itemCode: string; inTxnId: string | null; createdAt: string }>(
          (chunk) =>
            supabase
              .from("ims_serial_number")
              .select("serialNo, itemCode, inTxnId, createdAt")
              .eq("currentLocationId", loc.id)
              .eq("status", "IN_STOCK")
              .in("itemCode", chunk),
          allCodes
        ),
      ])
    : [new Map<string, Map<string, number>>(), { qty: new Map<string, Map<string, number>>(), serials: new Set<string>() }, []];

  const txnIds = serialRows.map((s) => s.inTxnId).filter(Boolean) as string[];
  const inDateByTxn = new Map<string, string>();
  if (txnIds.length) {
    const entries = await fetchAllRowsIn<{ id: string; createdAt: string }>(
      (chunk) => supabase.from("ims_stock_ledger").select("id, createdAt").in("id", chunk),
      txnIds
    );
    for (const e of entries) inDateByTxn.set(e.id, e.createdAt);
  }

  const data = items.map((req) => {
    const codes = codesFor(req.itemName);
    if (codes.length === 0) {
      // Not in IMS at all — OTP shows this as "stock unknown", not as zero.
      return {
        itemName: req.itemName,
        itemCodes: [] as string[],
        onHandQty: null,
        reservedQty: null,
        availableQty: null,
        serials: [],
        unassignedCgQty: null,
        elsewhere: [],
      };
    }

    const onHandQty = sum(onHand.get(loc.id), codes);
    const reservedQty = sum(reserved.qty.get(loc.id), codes);
    const availableQty = onHandQty - reservedQty;

    const serials = serialRows
      .filter((s) => codes.includes(s.itemCode) && !reserved.serials.has(s.serialNo))
      .map((s) => ({
        serialNo: s.serialNo,
        itemCode: s.itemCode,
        inDate: dateOnly((s.inTxnId && inDateByTxn.get(s.inTxnId)) || s.createdAt),
      }))
      .sort((a, b) => (a.inDate! < b.inDate! ? -1 : a.inDate! > b.inDate! ? 1 : a.serialNo.localeCompare(b.serialNo)));

    const unassignedCgQty =
      isCgChild && cgParent
        ? Math.max(0, sum(onHand.get(cgParent.id), codes) - sum(reserved.qty.get(cgParent.id), codes))
        : 0;

    // Where else this item is free right now — lets Packing List decide
    // between a Stock Transfer and an Indent for a shortage.
    const elsewhere = locations
      .filter((l) => l.id !== loc.id)
      .map((l) => ({ locationCode: l.locationCode, availableQty: sum(onHand.get(l.id), codes) - sum(reserved.qty.get(l.id), codes) }))
      .filter((e) => e.availableQty > 0);

    const result: Record<string, unknown> = {
      itemName: req.itemName,
      itemCodes: codes,
      onHandQty,
      reservedQty,
      availableQty,
      serials,
      unassignedCgQty,
      elsewhere,
    };
    if (req.requiredQty !== undefined) result.shortfallQty = Math.max(0, req.requiredQty - Math.max(0, availableQty));
    return result;
  });

  return { locationCode: loc.locationCode, data };
}

// ---------------------------------------------------------------- reservation

export type ReserveItem = { itemName?: string; itemCode?: string; qty: number; serials?: string[] };

type SerialRec = { serialNo: string; itemCode: string; status: string; currentLocationId: string | null };

async function loadSerials(serialNos: string[]): Promise<Map<string, SerialRec>> {
  const supabase = getSupabaseAdmin();
  if (!serialNos.length) return new Map();
  const rows = await fetchAllRowsIn<SerialRec>(
    (chunk) => supabase.from("ims_serial_number").select("serialNo, itemCode, status, currentLocationId").in("serialNo", chunk),
    serialNos
  );
  return new Map(rows.map((r) => [r.serialNo, r]));
}

/**
 * Replaces this wave's reservation with exactly `items` — calling it again
 * with a changed list (qty reduced, serial swapped) is how Pre-Invoice edits
 * are applied, and a retry of the same call is a no-op. Never blocks on low
 * stock: IMS reports what it saw (`shortfallQty`, `conflicts`) and OTP
 * decides what to do, same philosophy as the old scan-out integration.
 */
export async function reserveStock(params: { waveId: string; orderNo?: string; locationCode: string; items: ReserveItem[] }) {
  const supabase = getSupabaseAdmin();
  if (!params.waveId) throw new IntegrationError("waveId is required");
  if (!Array.isArray(params.items)) throw new IntegrationError("items must be an array");

  const [locations, { codesByName, nameByCode }] = await Promise.all([loadLocations(), loadItems()]);
  const loc = requireLocation(locations, params.locationCode);
  const locCodeById = new Map(locations.map((l) => [l.id, l.locationCode]));

  const { error: clearErr } = await supabase.from("ims_stock_reservation").delete().eq("waveId", params.waveId).eq("status", "ACTIVE");
  if (clearErr) throw new Error(clearErr.message);

  const requestedSerials = Array.from(new Set(params.items.flatMap((i) => (i.serials || []).map((s) => s.trim()).filter(Boolean))));
  const serialMap = await loadSerials(requestedSerials);
  const reservedElsewhere = new Set<string>();
  if (requestedSerials.length) {
    const rows = await fetchAllRowsIn<{ serialNo: string }>(
      (chunk) => supabase.from("ims_stock_reservation").select("serialNo").eq("status", "ACTIVE").in("serialNo", chunk),
      requestedSerials
    );
    for (const r of rows) reservedElsewhere.add(r.serialNo);
  }

  const candidatesFor = (it: ReserveItem): string[] => {
    if (it.itemCode && nameByCode.has(it.itemCode)) return [it.itemCode];
    return it.itemName ? codesByName.get(nameKey(it.itemName)) || [] : [];
  };

  const rows: { itemCode: string; locationId: string; qty: number; serialNo: string | null; orderNo: string | null; waveId: string; status: string }[] = [];
  const conflicts: { itemName: string; serialNo: string; reason: string; status?: string; currentLocationCode?: string | null }[] = [];
  const unknownSerials: string[] = [];
  const unknownItems: string[] = [];
  const summary: { itemName: string; itemCode: string | null; reservedQty: number; reservedSerials: string[] }[] = [];

  const base = { locationId: loc.id, orderNo: params.orderNo ?? null, waveId: params.waveId, status: "ACTIVE" };
  const multiCodeQtyItems: { itemName: string; codes: string[]; qty: number; summaryIdx: number }[] = [];

  for (const it of params.items) {
    const label = it.itemName || it.itemCode || "(unnamed)";
    const candidates = candidatesFor(it);
    const serials = Array.from(new Set((it.serials || []).map((s) => s.trim()).filter(Boolean)));
    const entry = { itemName: label, itemCode: candidates[0] ?? null, reservedQty: 0, reservedSerials: [] as string[] };
    summary.push(entry);

    if (candidates.length === 0 && serials.length === 0) {
      unknownItems.push(label);
      continue;
    }

    for (const serialNo of serials) {
      const rec = serialMap.get(serialNo);
      if (rec) {
        if (rec.status !== "IN_STOCK") {
          conflicts.push({ itemName: label, serialNo, reason: "ALREADY_OUT", status: rec.status });
        } else if (rec.currentLocationId !== loc.id) {
          conflicts.push({ itemName: label, serialNo, reason: "OTHER_LOCATION", currentLocationCode: rec.currentLocationId ? locCodeById.get(rec.currentLocationId) ?? null : null });
        } else if (reservedElsewhere.has(serialNo)) {
          conflicts.push({ itemName: label, serialNo, reason: "RESERVED_ELSEWHERE" });
        } else {
          rows.push({ ...base, itemCode: rec.itemCode, qty: 1, serialNo });
          entry.itemCode = rec.itemCode;
          entry.reservedQty += 1;
          entry.reservedSerials.push(serialNo);
        }
      } else if (candidates.length > 0) {
        // IMS never saw this serial (untracked / pre-IMS stock): reserve it
        // anyway — a warning, not a block. Consume records it best-effort.
        rows.push({ ...base, itemCode: candidates[0], qty: 1, serialNo });
        unknownSerials.push(serialNo);
        entry.reservedQty += 1;
        entry.reservedSerials.push(serialNo);
      } else {
        unknownItems.push(label);
      }
    }

    const remaining = Math.max(0, (Number(it.qty) || 0) - serials.length);
    if (remaining > 0 && candidates.length > 0) {
      if (candidates.length === 1) {
        rows.push({ ...base, itemCode: candidates[0], qty: remaining, serialNo: null });
        entry.reservedQty += remaining;
      } else {
        multiCodeQtyItems.push({ itemName: label, codes: candidates, qty: remaining, summaryIdx: summary.length - 1 });
      }
    }
  }

  // A name with several item codes: put the qty on whichever code actually has stock here.
  if (multiCodeQtyItems.length) {
    const onHand = await onHandByLocation(Array.from(new Set(multiCodeQtyItems.flatMap((m) => m.codes))));
    for (const m of multiCodeQtyItems) {
      const best = [...m.codes].sort((a, b) => (onHand.get(loc.id)?.get(b) || 0) - (onHand.get(loc.id)?.get(a) || 0))[0];
      rows.push({ ...base, itemCode: best, qty: m.qty, serialNo: null });
      summary[m.summaryIdx].reservedQty += m.qty;
      summary[m.summaryIdx].itemCode = best;
    }
  }

  // Shortfall = what we're reserving beyond what's free (other waves already
  // excluded: this wave's own rows were cleared above).
  const reservedCodes = Array.from(new Set(rows.map((r) => r.itemCode)));
  const shortfalls: { itemCode: string; itemName: string; shortfallQty: number }[] = [];
  if (reservedCodes.length) {
    const [onHand, reserved] = await Promise.all([onHandByLocation(reservedCodes), reservedByLocation(reservedCodes)]);
    for (const code of reservedCodes) {
      const wanted = rows.filter((r) => r.itemCode === code).reduce((s, r) => s + r.qty, 0);
      const free = (onHand.get(loc.id)?.get(code) || 0) - (reserved.qty.get(loc.id)?.get(code) || 0);
      const shortfallQty = Math.max(0, wanted - Math.max(0, free));
      if (shortfallQty > 0) shortfalls.push({ itemCode: code, itemName: nameByCode.get(code) || code, shortfallQty });
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("ims_stock_reservation").insert(rows);
    if (error) {
      if ((error as any).code === "23505") throw new IntegrationError("A serial in this wave is already reserved by another wave");
      throw new Error(error.message);
    }
  }

  return { waveId: params.waveId, locationCode: loc.locationCode, items: summary, conflicts, unknownSerials, unknownItems, shortfalls };
}

export async function releaseReservation(params: { waveId: string }) {
  const supabase = getSupabaseAdmin();
  if (!params.waveId) throw new IntegrationError("waveId is required");
  const { data, error } = await supabase
    .from("ims_stock_reservation")
    .delete()
    .eq("waveId", params.waveId)
    .eq("status", "ACTIVE")
    .select("id");
  if (error) throw new Error(error.message);
  return { waveId: params.waveId, released: (data || []).length };
}

/**
 * Pre-Invoice processed: turns the wave's ACTIVE reservation into real OUT
 * ledger entries (+ serials -> OUT). If `items` is passed, the reservation is
 * first replaced with that final list (needs `locationCode`) so any edit made
 * in the Pre-Invoice dialog is what actually goes out. Rows are claimed
 * (ACTIVE -> CONSUMED) atomically first, so a double call can't OUT twice.
 */
export async function consumeReservation(params: {
  waveId: string;
  referenceNo?: string;
  orderNo?: string;
  locationCode?: string;
  items?: ReserveItem[];
}) {
  const supabase = getSupabaseAdmin();
  if (!params.waveId) throw new IntegrationError("waveId is required");

  if (params.items) {
    if (!params.locationCode) throw new IntegrationError("locationCode is required when items are passed");
    await reserveStock({ waveId: params.waveId, orderNo: params.orderNo, locationCode: params.locationCode, items: params.items });
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("ims_stock_reservation")
    .update({ status: "CONSUMED" })
    .eq("waveId", params.waveId)
    .eq("status", "ACTIVE")
    .select("id, itemCode, locationId, qty, serialNo, orderNo");
  if (claimErr) throw new Error(claimErr.message);

  if (!claimed || claimed.length === 0) {
    const { count } = await supabase
      .from("ims_stock_reservation")
      .select("id", { count: "exact", head: true })
      .eq("waveId", params.waveId)
      .eq("status", "CONSUMED");
    return { waveId: params.waveId, consumed: 0, alreadyConsumed: (count ?? 0) > 0, failed: [], unknownSerials: [] };
  }

  try {
    const referenceNo = params.referenceNo ?? params.orderNo ?? claimed[0].orderNo ?? params.waveId;
    const referenceType = "OTP Pre-Invoice Dispatch";
    const serialMap = await loadSerials(claimed.map((r) => r.serialNo).filter(Boolean) as string[]);

    const ledger: Record<string, unknown>[] = [];
    const failed: { serialNo: string; reason: string; status?: string }[] = [];
    const unknownSerials: string[] = [];

    for (const r of claimed) {
      if (!r.serialNo) {
        ledger.push({ itemCode: r.itemCode, locationId: r.locationId, txnType: "OUT", qty: r.qty, referenceType, referenceNo });
        continue;
      }
      const rec = serialMap.get(r.serialNo);
      if (!rec) {
        unknownSerials.push(r.serialNo);
        ledger.push({
          itemCode: r.itemCode,
          locationId: r.locationId,
          txnType: "OUT",
          qty: 1,
          serialNo: r.serialNo,
          referenceType,
          referenceNo,
          remarks: "Best-effort — this serial was never recorded IN by IMS (untracked / pre-IMS stock)",
        });
      } else if (rec.status !== "IN_STOCK" || !rec.currentLocationId) {
        failed.push({ serialNo: r.serialNo, reason: "NOT_IN_STOCK", status: rec.status });
      } else {
        ledger.push({ itemCode: rec.itemCode, locationId: rec.currentLocationId, txnType: "OUT", qty: 1, serialNo: r.serialNo, referenceType, referenceNo });
      }
    }

    if (ledger.length) {
      const { data: inserted, error: ledgerErr } = await supabase.from("ims_stock_ledger").insert(ledger).select("id, itemCode, serialNo");
      if (ledgerErr) throw new Error(ledgerErr.message);

      const serialUpdates = (inserted || [])
        .filter((l) => l.serialNo)
        .map((l) => ({ serialNo: l.serialNo, itemCode: l.itemCode, status: "OUT", outTxnId: l.id }));
      if (serialUpdates.length) {
        const { error: serialErr } = await supabase.from("ims_serial_number").upsert(serialUpdates, { onConflict: "serialNo" });
        if (serialErr) throw new Error(serialErr.message);
      }
    }

    return { waveId: params.waveId, consumed: ledger.length, alreadyConsumed: false, failed, unknownSerials };
  } catch (err) {
    // Give the claimed rows back so a retry can process them.
    await supabase.from("ims_stock_reservation").update({ status: "ACTIVE" }).in("id", claimed.map((r) => r.id));
    throw err;
  }
}

// ---------------------------------------------------------------- serial check

export type SerialConflict = "ALREADY_OUT" | "OTHER_LOCATION" | "RESERVED_ELSEWHERE" | null;

/** Scan-time check from Packing List: is this serial usable at this location? Unknown serial = known:false, no conflict (a warning for OTP, never a block). */
export async function checkSerial(params: { serialNo: string; locationCode: string; waveId?: string }) {
  const supabase = getSupabaseAdmin();
  const serialNo = (params.serialNo || "").trim();
  if (!serialNo) throw new IntegrationError("serialNo is required");

  const locations = await loadLocations();
  const loc = requireLocation(locations, params.locationCode);
  const serials = await loadSerials([serialNo]);
  const rec = serials.get(serialNo);
  if (!rec) return { serialNo, known: false, conflict: null as SerialConflict };

  const { data: reservation } = await supabase
    .from("ims_stock_reservation")
    .select("waveId")
    .eq("serialNo", serialNo)
    .eq("status", "ACTIVE")
    .maybeSingle();

  let conflict: SerialConflict = null;
  if (rec.status !== "IN_STOCK") conflict = "ALREADY_OUT";
  else if (rec.currentLocationId !== loc.id) conflict = "OTHER_LOCATION";
  else if (reservation && reservation.waveId !== params.waveId) conflict = "RESERVED_ELSEWHERE";

  return {
    serialNo,
    known: true,
    itemCode: rec.itemCode,
    status: rec.status,
    currentLocationCode: locations.find((l) => l.id === rec.currentLocationId)?.locationCode ?? null,
    conflict,
  };
}
