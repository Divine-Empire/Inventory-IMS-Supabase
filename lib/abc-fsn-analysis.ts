import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";

// Reads ims_sales_transaction (actual invoiced sales history, accumulated
// by lib/sync-sales.ts) and computes:
//   1. Seasonality — per elapsed month of the current financial year
//   2. ABC-FSN classification — per item, aggregated FY-to-date
//   3. A flattened "Priority Review" list (same per-item data, re-sorted)
//
// Company-wide, not location-split — invoiced sales don't reliably carry
// a warehouse location (same limitation already noted for
// ims_sales_pending_snapshot).

const FY_START_MONTH = 3; // April (0-indexed)
const FY_START_YEAR_OFFSET_THRESHOLD = 3; // if current month (0-indexed) >= this, FY started this calendar year

export type SeasonalityMonth = {
  month: string; // "2026-04"
  monthLabel: string; // "Apr 2026"
  salesValue: number;
  sharePct: number;
  seasonalIndex: number;
  qtySold: number;
  salesLines: number;
  interpretation: string;
};

export type ItemClassification = {
  itemCode: string;
  itemName: string;
  salesValue: number;
  qtySold: number;
  activeMonths: number;
  elapsedMonths: number;
  avgMonthlyQty: number;
  peakMonthlyQty: number;
  peakToAvg: number | null;
  abcClass: "A" | "B" | "C";
  fsnClass: "F" | "S" | "N";
  combinedClass: string;
  monthlyValue: Record<string, number>;
  monthlyQty: Record<string, number>;
};

export type ClassSummary = {
  class: string;
  skuCount: number;
  salesValue: number;
  salesSharePct: number;
  controlPolicy: string;
  review: string;
  peakHandling: string;
  stockingRule: string;
};

const CLASS_RULES: Record<string, { controlPolicy: string; review: string; peakHandling: string; stockingRule: string }> = {
  AF: { controlPolicy: "Core stock / tight control", review: "Weekly", peakHandling: "Pre-build before peak", stockingRule: "Stock + safety stock" },
  AS: { controlPolicy: "Controlled stock", review: "Weekly", peakHandling: "Build selectively", stockingRule: "Stock, but avoid blanket max" },
  AN: { controlPolicy: "High-value intermittent", review: "Weekly/approval", peakHandling: "Buy against confirmed demand", stockingRule: "MTO / very low buffer" },
  BF: { controlPolicy: "Regular min-max", review: "Fortnightly", peakHandling: "Moderate pre-build", stockingRule: "Stock with controlled buffer" },
  BS: { controlPolicy: "Periodic replenishment", review: "Fortnightly", peakHandling: "Selective", stockingRule: "Low/medium buffer" },
  BN: { controlPolicy: "Intermittent B", review: "Monthly", peakHandling: "Order-backed", stockingRule: "Avoid routine stock" },
  CF: { controlPolicy: "Low-cost regular", review: "Monthly", peakHandling: "Limited pre-build", stockingRule: "Low buffer" },
  CS: { controlPolicy: "Low-frequency C", review: "Monthly", peakHandling: "No blanket build", stockingRule: "Buy selectively" },
  CN: { controlPolicy: "Long-tail intermittent", review: "Monthly/exception", peakHandling: "Do not pre-build", stockingRule: "Buy-to-order / stop routine stock" },
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fyStartForToday(today: Date): Date {
  const year = today.getMonth() >= FY_START_YEAR_OFFSET_THRESHOLD ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(year, FY_START_MONTH, 1);
}

/** "YYYY-MM" for every month from FY start through the current month (inclusive). */
function elapsedMonthKeys(today: Date): string[] {
  const start = fyStartForToday(today);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor.getFullYear() < today.getFullYear() || (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() <= today.getMonth())) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
    if (keys.length > 12) break; // safety: never more than a year
  }
  return keys;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function seasonalInterpretation(index: number): string {
  if (index < 0.9) return "Lean / clean excess";
  if (index <= 1.0) return "Normal / recovery";
  if (index <= 1.1) return "Regular-high";
  return "Peak / protect availability";
}

type SalesRow = { itemCode: string | null; itemNameRaw: string | null; qty: number | null; amount: number | null; invoiceDate: string | null };

export async function getAbcFsnAnalysis() {
  const supabase = getSupabaseAdmin();
  const today = new Date();
  const months = elapsedMonthKeys(today);
  const monthSet = new Set(months);

  const [salesRows, itemMasters] = await Promise.all([
    fetchAllRows<SalesRow>(() => supabase.from("ims_sales_transaction").select("itemCode, itemNameRaw, qty, amount, invoiceDate")),
    fetchAllRows<{ itemCode: string; itemName: string }>(() => supabase.from("ims_item_master").select("itemCode, itemName")),
  ]);

  const itemNameByCode = new Map(itemMasters.map((i) => [i.itemCode, i.itemName]));
  const itemCodeByName = new Map(itemMasters.map((i) => [i.itemName.toUpperCase().trim(), i.itemCode]));

  // Re-match by name at READ time, not just whatever itemCode was stored
  // when the row was synced — a sale recorded before an item existed in
  // the Item Master stays itemCode:null in the DB forever (its source
  // otp_make_invoice row can be gone by the time you re-run the sync), but
  // the Item Master keeps growing. Re-matching live means every analysis
  // run benefits from the latest Item Master, no backfill job needed.
  function resolveItemCode(row: SalesRow): string | null {
    if (row.itemCode) return row.itemCode;
    const nameUpper = (row.itemNameRaw || "").toUpperCase().trim();
    return itemCodeByName.get(nameUpper) ?? null;
  }

  // Only rows within the elapsed FY months, and only ones we can attribute
  // to a known item (itemCode). This split matters: Section 1 (company-wide
  // totals) should count EVERY rupee invoiced, whether or not we can tell
  // which SKU it was — only Section 2/3 (per-SKU classification) actually
  // needs the item match, since you can't classify an item you can't
  // identify. Unattributed revenue is reported separately so it's visible,
  // not silently dropped from the month it was actually earned in.
  const allInFy: (SalesRow & { monthKey: string })[] = [];
  const matchedToItem: (SalesRow & { monthKey: string })[] = [];
  let unattributedValue = 0;

  for (const r of salesRows) {
    if (!r.invoiceDate) continue;
    const monthKey = r.invoiceDate.slice(0, 7);
    if (!monthSet.has(monthKey)) continue;

    allInFy.push({ ...r, monthKey });
    const resolvedItemCode = resolveItemCode(r);
    if (resolvedItemCode) {
      matchedToItem.push({ ...r, itemCode: resolvedItemCode, monthKey });
    } else {
      unattributedValue += r.amount || 0;
    }
  }

  // ---------- Section 1: Seasonality (company-wide — every invoiced rupee) ----------
  const monthAgg = new Map<string, { salesValue: number; qtySold: number; salesLines: number }>();
  for (const key of months) monthAgg.set(key, { salesValue: 0, qtySold: 0, salesLines: 0 });
  for (const r of allInFy) {
    const agg = monthAgg.get(r.monthKey)!;
    agg.salesValue += r.amount || 0;
    agg.qtySold += r.qty || 0;
    agg.salesLines += 1;
  }

  const totalFyValue = [...monthAgg.values()].reduce((s, m) => s + m.salesValue, 0);
  const avgMonthlyValue = months.length ? totalFyValue / months.length : 0;

  const seasonality: SeasonalityMonth[] = months.map((key) => {
    const agg = monthAgg.get(key)!;
    const seasonalIndex = avgMonthlyValue > 0 ? agg.salesValue / avgMonthlyValue : 0;
    return {
      month: key,
      monthLabel: monthLabel(key),
      salesValue: agg.salesValue,
      sharePct: totalFyValue > 0 ? (agg.salesValue / totalFyValue) * 100 : 0,
      seasonalIndex,
      qtySold: agg.qtySold,
      salesLines: agg.salesLines,
      interpretation: seasonalInterpretation(seasonalIndex),
    };
  });

  // ---------- Section 2/3: ABC-FSN per item (classifiable sales only) ----------
  type ItemAgg = { salesValue: number; qtySold: number; monthlyQty: Map<string, number>; monthlyValue: Map<string, number> };
  const itemAgg = new Map<string, ItemAgg>();
  for (const r of matchedToItem) {
    const code = r.itemCode!;
    const agg = itemAgg.get(code) || { salesValue: 0, qtySold: 0, monthlyQty: new Map(), monthlyValue: new Map() };
    agg.salesValue += r.amount || 0;
    agg.qtySold += r.qty || 0;
    agg.monthlyQty.set(r.monthKey, (agg.monthlyQty.get(r.monthKey) || 0) + (r.qty || 0));
    agg.monthlyValue.set(r.monthKey, (agg.monthlyValue.get(r.monthKey) || 0) + (r.amount || 0));
    itemAgg.set(code, agg);
  }

  // ABC cutoffs (top 70%/20%/10%) are computed against the classifiable
  // total, not the grand total — unattributed revenue has no item to
  // assign a class to, so including it here would mean the cumulative
  // scale never reaches 100% and nothing would ever land in C.
  const totalMatchedValue = [...itemAgg.values()].reduce((s, v) => s + v.salesValue, 0);

  const elapsedCount = months.length || 1;
  const itemsSortedByValue = [...itemAgg.entries()].sort((a, b) => b[1].salesValue - a[1].salesValue);

  let cumValue = 0;
  const classifications: ItemClassification[] = itemsSortedByValue.map(([itemCode, agg]) => {
    cumValue += agg.salesValue;
    const cumPct = totalMatchedValue > 0 ? (cumValue / totalMatchedValue) * 100 : 0;
    const abcClass: ItemClassification["abcClass"] = cumPct <= 70 ? "A" : cumPct <= 90 ? "B" : "C";

    const activeMonths = [...agg.monthlyQty.values()].filter((q) => q > 0).length;
    const durationPct = (activeMonths / elapsedCount) * 100;
    const fsnClass: ItemClassification["fsnClass"] = durationPct > 50 ? "F" : durationPct >= 25 ? "S" : "N";

    const avgMonthlyQty = agg.qtySold / elapsedCount;
    const peakMonthlyQty = agg.monthlyQty.size ? Math.max(...agg.monthlyQty.values()) : 0;

    return {
      itemCode,
      itemName: itemNameByCode.get(itemCode) || itemCode,
      salesValue: agg.salesValue,
      qtySold: agg.qtySold,
      activeMonths,
      elapsedMonths: elapsedCount,
      avgMonthlyQty,
      peakMonthlyQty,
      peakToAvg: avgMonthlyQty > 0 ? peakMonthlyQty / avgMonthlyQty : null,
      abcClass,
      fsnClass,
      combinedClass: `${abcClass}${fsnClass}`,
      monthlyValue: Object.fromEntries(agg.monthlyValue),
      monthlyQty: Object.fromEntries(agg.monthlyQty),
    };
  });

  // ---------- Matrix summary (fixed 9-class order: AF,AS,AN,BF,BS,BN,CF,CS,CN) ----------
  const classOrder = ["AF", "AS", "AN", "BF", "BS", "BN", "CF", "CS", "CN"];
  const matrix: ClassSummary[] = classOrder.map((cls) => {
    const members = classifications.filter((c) => c.combinedClass === cls);
    const salesValue = members.reduce((s, c) => s + c.salesValue, 0);
    const rules = CLASS_RULES[cls];
    return {
      class: cls,
      skuCount: members.length,
      salesValue,
      salesSharePct: totalFyValue > 0 ? (salesValue / totalFyValue) * 100 : 0,
      ...rules,
    };
  });

  // ---------- Priority Review (A tier first, N before S before F, then by value desc) ----------
  const abcRank: Record<string, number> = { A: 0, B: 1, C: 2 };
  const fsnRank: Record<string, number> = { N: 0, S: 1, F: 2 };
  const priorityReview = [...classifications].sort((a, b) => {
    if (abcRank[a.abcClass] !== abcRank[b.abcClass]) return abcRank[a.abcClass] - abcRank[b.abcClass];
    if (fsnRank[a.fsnClass] !== fsnRank[b.fsnClass]) return fsnRank[a.fsnClass] - fsnRank[b.fsnClass];
    return b.salesValue - a.salesValue;
  });

  return {
    financialYear: `${fyStartForToday(today).getFullYear()}-${fyStartForToday(today).getFullYear() + 1}`,
    elapsedMonths: months,
    totalFyValue,
    unattributedValue,
    seasonality,
    matrix,
    priorityReview,
  };
}
