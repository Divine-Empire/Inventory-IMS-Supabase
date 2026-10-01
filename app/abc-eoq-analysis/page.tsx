"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ArrowUpDown, AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Badge } from "@/components/ui/badge";

type SeasonalityMonth = {
  month: string;
  monthLabel: string;
  salesValue: number;
  sharePct: number;
  seasonalIndex: number;
  qtySold: number;
  salesLines: number;
  interpretation: string;
};

type ItemClassification = {
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
};

type ClassSummary = {
  class: string;
  skuCount: number;
  salesValue: number;
  salesSharePct: number;
  controlPolicy: string;
  review: string;
  peakHandling: string;
  stockingRule: string;
};

type AnalysisData = {
  financialYear: string;
  elapsedMonths: string[];
  totalFyValue: number;
  unattributedValue: number;
  seasonality: SeasonalityMonth[];
  matrix: ClassSummary[];
  priorityReview: ItemClassification[];
};

const INTERPRETATION_STYLES: Record<string, string> = {
  "Lean / clean excess": "bg-sky-100 text-sky-800 border-sky-300",
  "Normal / recovery": "bg-slate-100 text-slate-700 border-slate-300",
  "Regular-high": "bg-amber-100 text-amber-800 border-amber-300",
  "Peak / protect availability": "bg-rose-100 text-rose-800 border-rose-300",
};

const ABC_COLORS: Record<string, string> = { A: "bg-emerald-50", B: "bg-amber-50", C: "bg-slate-50" };

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export default function AbcEoqAnalysisPage() {
  return (
    <MainLayout>
      <AbcEoqAnalysisContent />
    </MainLayout>
  );
}

function AbcEoqAnalysisContent() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/abc-fsn?_t=${Date.now()}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
    } catch (err: any) {
      setError(err.message);
      toast.error("Failed to load analysis: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/sales", { method: "POST" });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      toast.success(`Sales history synced — ${result.summary.rowsUpserted} line(s) processed`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-slate-800" />
        <p className="text-slate-900 font-semibold animate-pulse">Loading analysis...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border border-red-300 bg-red-50 rounded-lg p-6 flex flex-col items-center gap-3 max-w-xl mx-auto">
        <AlertCircle className="w-10 h-10 text-red-600" />
        <p className="text-sm font-semibold text-red-800">{error || "No data"}</p>
        <button onClick={fetchData} className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col gap-8 max-w-[1700px] mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">ABC / FSN Analysis</h1>
            <p className="text-xs text-slate-500">
              Financial Year {data.financialYear} — {data.elapsedMonths.length} month(s) elapsed so far
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-violet-300 bg-violet-50 hover:bg-violet-100 disabled:opacity-60 text-xs font-semibold text-violet-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Invoiced Sales History"}
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 text-xs font-bold border border-slate-300 rounded-full px-3 py-1.5 bg-white hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {data.unattributedValue > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          ₹{Math.round(data.unattributedValue).toLocaleString("en-IN")} of invoiced sales this FY couldn't be matched to an item in the Item Master (name mismatch) — excluded from classification below. Run Item Master import to improve matching.
        </p>
      )}

      <SeasonalitySection seasonality={data.seasonality} />
      <MatrixSection matrix={data.matrix} />
      <PriorityReviewSection items={data.priorityReview} />
    </div>
  );
}

function SeasonalitySection({ seasonality }: { seasonality: SeasonalityMonth[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Section 1 — Seasonality" />
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>Month</Th>
              <Th className="text-right">Sales Value</Th>
              <Th className="text-right">Share of FY Sales</Th>
              <Th className="text-right">Seasonal Index</Th>
              <Th>Planning Interpretation</Th>
              <Th className="text-right">Qty Sold</Th>
              <Th className="text-right">Sales Lines</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {seasonality.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">No invoiced sales yet this FY — run the sync above</td></tr>
            ) : (
              seasonality.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <Td className="font-semibold">{m.monthLabel}</Td>
                  <Td className="text-right font-bold">{inr(m.salesValue)}</Td>
                  <Td className="text-right">{m.sharePct.toFixed(1)}%</Td>
                  <Td className="text-right font-mono">{m.seasonalIndex.toFixed(3)}x</Td>
                  <Td>
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${INTERPRETATION_STYLES[m.interpretation]}`}>
                      {m.interpretation}
                    </span>
                  </Td>
                  <Td className="text-right">{m.qtySold.toLocaleString("en-IN")}</Td>
                  <Td className="text-right">{m.salesLines}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixSection({ matrix }: { matrix: ClassSummary[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Section 2 — ABC-FSN Inventory Control Matrix" />
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>Class</Th>
              <Th className="text-right">SKU Count</Th>
              <Th className="text-right">Sales Value</Th>
              <Th className="text-right">Sales Share</Th>
              <Th>Control Policy</Th>
              <Th>Review</Th>
              <Th>Peak Handling</Th>
              <Th>Stocking Rule</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map((c) => (
              <tr key={c.class} className={ABC_COLORS[c.class[0]]}>
                <Td className="font-extrabold">{c.class}</Td>
                <Td className="text-right">{c.skuCount}</Td>
                <Td className="text-right font-bold">{inr(c.salesValue)}</Td>
                <Td className="text-right">{c.salesSharePct.toFixed(1)}%</Td>
                <Td>{c.controlPolicy}</Td>
                <Td>{c.review}</Td>
                <Td>{c.peakHandling}</Td>
                <Td>{c.stockingRule}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type SortKey = keyof Pick<ItemClassification, "salesValue" | "activeMonths" | "avgMonthlyQty" | "peakToAvg">;

function PriorityReviewSection({ items }: { items: ItemClassification[] }) {
  const [sort, setSort] = useState<{ key: SortKey | "priority"; dir: "asc" | "desc" }>({ key: "priority", dir: "asc" });

  const sorted = useMemo(() => {
    const key = sort.key;
    if (key === "priority") return items;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => mul * ((a[key] ?? 0) - (b[key] ?? 0)));
  }, [items, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Priority Review — items that need management attention" />
      <p className="text-xs text-slate-500 -mt-1">
        A-S and A-N items are shown first — high financial impact with less consistent demand. A-F items follow as the core replenishment population.
      </p>
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto max-h-[70vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-900 text-white z-10">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>#</Th>
              <Th>Item</Th>
              <Th>ABC</Th>
              <Th>FSN</Th>
              <Th>Class</Th>
              <SortTh label="Sales Value" active={sort.key === "salesValue"} dir={sort.dir} onClick={() => toggleSort("salesValue")} />
              <SortTh label="Active Months" active={sort.key === "activeMonths"} dir={sort.dir} onClick={() => toggleSort("activeMonths")} />
              <SortTh label="Avg Monthly Qty" active={sort.key === "avgMonthlyQty"} dir={sort.dir} onClick={() => toggleSort("avgMonthlyQty")} />
              <SortTh label="Peak/Avg" active={sort.key === "peakToAvg"} dir={sort.dir} onClick={() => toggleSort("peakToAvg")} />
              <Th>Recommended Policy</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((it, idx) => (
              <tr key={it.itemCode} className={`${ABC_COLORS[it.abcClass]} hover:brightness-95`}>
                <Td className="text-slate-400">{idx + 1}</Td>
                <Td>
                  <span className="font-mono font-bold">{it.itemCode}</span>
                  <span className="text-slate-500"> — {it.itemName}</span>
                </Td>
                <Td><Badge variant="outline">{it.abcClass}</Badge></Td>
                <Td><Badge variant="outline">{it.fsnClass}</Badge></Td>
                <Td className="font-extrabold">{it.combinedClass}</Td>
                <Td className="text-right font-bold">{inr(it.salesValue)}</Td>
                <Td className="text-right">{it.activeMonths}/{it.elapsedMonths}</Td>
                <Td className="text-right">{it.avgMonthlyQty.toFixed(1)}</Td>
                <Td className="text-right">{it.peakToAvg !== null ? `${it.peakToAvg.toFixed(2)}x` : "-"}</Td>
                <Td className="text-xs">{CLASS_POLICY_TEXT[it.combinedClass]}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CLASS_POLICY_TEXT: Record<string, string> = {
  AF: "Core stock / weekly review / protect peak availability",
  AS: "Controlled stock / weekly review / pre-build before peak",
  AN: "Order-backed or very low buffer; senior approval before buying",
  BF: "Stock with controlled buffer / fortnightly review",
  BS: "Low/medium buffer / fortnightly review",
  BN: "Avoid routine stock / order-backed / monthly review",
  CF: "Low buffer / monthly review",
  CS: "Buy selectively / monthly review",
  CN: "Buy-to-order / stop routine stock / exception review",
};

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{title}</h2>;
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 border-r border-white/10 whitespace-nowrap ${className}`}>{children}</th>;
}

function SortTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th
      className="px-3 py-2.5 border-r border-white/10 whitespace-nowrap text-right cursor-pointer select-none hover:bg-white/10"
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </span>
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 border-r border-slate-100 ${className}`}>{children}</td>;
}
