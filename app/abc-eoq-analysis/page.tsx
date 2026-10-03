"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import type { AnalysisData } from "./shared";
import { AnalysisTab } from "./analysis-tab";
import { PriorityReviewTab } from "./priority-review-tab";
import { SkuMonthlyValueTab } from "./sku-monthly-value-tab";
import { SkuMonthlyQtyTab } from "./sku-monthly-qty-tab";

const TABS = [
  { key: "analysis", label: "ABC / FSN Analysis" },
  { key: "priority", label: "Priority Review" },
  { key: "monthly-value", label: "SKU Monthly Value" },
  { key: "monthly-qty", label: "SKU Monthly Qty" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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
  const [activeTab, setActiveTab] = useState<TabKey>("analysis");

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
    <div className="p-2 flex flex-col gap-6 max-w-[1700px] mx-auto">
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

      <div className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "analysis" && <AnalysisTab seasonality={data.seasonality} matrix={data.matrix} />}
      {activeTab === "priority" && <PriorityReviewTab items={data.priorityReview} />}
      {activeTab === "monthly-value" && <SkuMonthlyValueTab items={data.priorityReview} elapsedMonths={data.elapsedMonths} />}
      {activeTab === "monthly-qty" && <SkuMonthlyQtyTab items={data.priorityReview} elapsedMonths={data.elapsedMonths} />}
    </div>
  );
}
