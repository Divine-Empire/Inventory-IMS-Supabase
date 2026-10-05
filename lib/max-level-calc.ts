import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";

// Max Level (off-season stocking target, Jun-Sep) and Max Level Peak
// (peak-season target, Oct-May) are calculated as:
//   Average Sale/Day (seasonal, per item+location) x Lead Time (days) x
//   Safety Factor x Growth Rate
//
// Lead Time always comes from the system (ims_pfms_pending_snapshot, per
// item+location) — it is NOT user-overridable, since forcing one lead-time
// number across every item would silently corrupt items whose real lead
// time is very different. Safety Factor / Growth Rate are genuine global
// planning knobs and ARE user-adjustable (default 1.2 / 1.1).
//
// If an item+location has no elapsed days of a given season yet (too new,
// or no location-tagged sales history), its existing CSV-imported value is
// left untouched rather than being zeroed out.

const OFF_SEASON_MONTHS = new Set([6, 7, 8, 9]); // Jun-Sep (1-indexed)
const DEFAULT_SAFETY_FACTOR = 1.2;
const DEFAULT_GROWTH_RATE = 1.1;
const BATCH_SIZE = 500;

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

type SalesRow = { itemCode: string | null; locationId: string | null; qty: number | null; invoiceDate: string | null };

type MonthBucket = { monthKey: string; daysElapsed: number; isOffSeason: boolean };

/** Every calendar month from (firstYear, firstMonth) through today (inclusive), with how many of that month's days have actually elapsed. */
function monthsFrom(firstYear: number, firstMonth: number, today: Date): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  let y = firstYear;
  let m = firstMonth;
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  while (y < todayY || (y === todayY && m <= todayM)) {
    const isCurrentMonth = y === todayY && m === todayM;
    const daysElapsed = isCurrentMonth ? todayD : daysInMonth(y, m);
    buckets.push({ monthKey: `${y}-${String(m).padStart(2, "0")}`, daysElapsed, isOffSeason: OFF_SEASON_MONTHS.has(m) });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (buckets.length > 600) break; // safety valve
  }
  return buckets;
}

/** Average units sold per day, within the requested season, counting only
 * calendar days that have actually elapsed since this item+location's
 * first recorded sale. Months with no sales still count toward the day
 * total (they genuinely had zero demand that day), so a sparse season
 * correctly pulls the average down rather than being skipped. */
function seasonalAvgPerDay(rows: SalesRow[], wantOffSeason: boolean, today: Date): number | null {
  if (rows.length === 0) return null;
  const qtyByMonth = new Map<string, number>();
  let minTs = Infinity;
  for (const r of rows) {
    const monthKey = r.invoiceDate!.slice(0, 7);
    qtyByMonth.set(monthKey, (qtyByMonth.get(monthKey) || 0) + (r.qty || 0));
    const ts = new Date(r.invoiceDate!).getTime();
    if (ts < minTs) minTs = ts;
  }
  const first = new Date(minTs);
  const buckets = monthsFrom(first.getFullYear(), first.getMonth() + 1, today);

  let seasonQty = 0;
  let seasonDays = 0;
  for (const b of buckets) {
    if (b.isOffSeason !== wantOffSeason) continue;
    seasonQty += qtyByMonth.get(b.monthKey) || 0;
    seasonDays += b.daysElapsed;
  }
  return seasonDays > 0 ? seasonQty / seasonDays : null;
}

export type MaxLevelCalcOptions = { safetyFactor?: number; growthRate?: number };

export async function recalculateMaxLevels(options: MaxLevelCalcOptions = {}) {
  const supabase = getSupabaseAdmin();
  const safetyFactor = options.safetyFactor ?? DEFAULT_SAFETY_FACTOR;
  const growthRate = options.growthRate ?? DEFAULT_GROWTH_RATE;
  const today = new Date();

  const [salesRows, pfmsPending, locationSettings] = await Promise.all([
    fetchAllRows<SalesRow>(() => supabase.from("ims_sales_transaction").select("itemCode, locationId, qty, invoiceDate")),
    fetchAllRows<{ itemCode: string; locationId: string; leadTimeDays: number | null }>(() =>
      supabase.from("ims_pfms_pending_snapshot").select("itemCode, locationId, leadTimeDays")
    ),
    fetchAllRows<{ itemCode: string; locationId: string }>(() =>
      supabase.from("ims_item_location_setting").select("itemCode, locationId")
    ),
  ]);

  const leadTimeByKey = new Map(pfmsPending.map((p) => [`${p.itemCode}::${p.locationId}`, p.leadTimeDays]));

  // Sales rows grouped per item+location. Rows with no resolved location
  // (unsynced older data, or "Direct Dispatch" which has no physical
  // warehouse) are excluded from any specific location's average — see
  // lib/otp-location-aliases.ts.
  const salesByKey = new Map<string, SalesRow[]>();
  for (const r of salesRows) {
    if (!r.itemCode || !r.locationId || !r.invoiceDate) continue;
    const key = `${r.itemCode}::${r.locationId}`;
    if (!salesByKey.has(key)) salesByKey.set(key, []);
    salesByKey.get(key)!.push(r);
  }

  type Update = { itemCode: string; locationId: string; maxLevel?: number; maxLevelPeak?: number };
  const updates: Update[] = [];
  let skippedNoLeadTime = 0;
  let skippedNoSalesData = 0;

  for (const setting of locationSettings) {
    const key = `${setting.itemCode}::${setting.locationId}`;
    const leadTimeDays = leadTimeByKey.get(key) ?? null;
    if (leadTimeDays === null) {
      skippedNoLeadTime++;
      continue; // no system lead time known yet — leave existing CSV value as-is
    }

    const rows = salesByKey.get(key) || [];
    const avgOffSeason = seasonalAvgPerDay(rows, true, today);
    const avgPeak = seasonalAvgPerDay(rows, false, today);

    const update: Update = { itemCode: setting.itemCode, locationId: setting.locationId };
    if (avgOffSeason !== null) update.maxLevel = Math.round(avgOffSeason * leadTimeDays * safetyFactor * growthRate);
    if (avgPeak !== null) update.maxLevelPeak = Math.round(avgPeak * leadTimeDays * safetyFactor * growthRate);

    if (update.maxLevel === undefined && update.maxLevelPeak === undefined) {
      skippedNoSalesData++;
      continue; // no location-tagged sales history yet for either season — leave existing CSV value as-is
    }

    updates.push(update);
  }

  // Batched upsert: PostgREST's ON CONFLICT DO UPDATE only SETs the columns
  // present in each object, so a row missing maxLevelPeak (no peak-season
  // data yet) leaves that column untouched rather than nulling it out.
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("ims_item_location_setting").upsert(batch, { onConflict: "itemCode,locationId" });
    if (error) throw new Error(`Batch max-level update failed: ${error.message}`);
  }

  return {
    itemLocationsConsidered: locationSettings.length,
    itemLocationsUpdated: updates.length,
    skippedNoLeadTime,
    skippedNoSalesData,
    safetyFactor,
    growthRate,
  };
}
