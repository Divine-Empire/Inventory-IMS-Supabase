"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatusTabs } from "@/components/data/status-tabs";
import { ErrorState } from "@/components/data/table-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisData } from "./shared";
import { AnalysisTab } from "./analysis-tab";
import { PriorityReviewTab } from "./priority-review-tab";
import { SkuMonthlyTab } from "./sku-monthly-tab";

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ABC / FSN Analysis"
        description={data ? `Financial year ${data.financialYear} · ${data.elapsedMonths.length} month(s) elapsed so far` : loading ? "Loading..." : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </Button>
            <Button size="sm" className="h-9" onClick={runSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              {syncing ? "Syncing..." : "Sync invoiced sales history"}
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading analysis">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error || !data ? (
        <div className="rounded-lg border bg-card">
          <ErrorState message={error || "No data"} onRetry={fetchData} />
        </div>
      ) : (
        <>
          {data.unattributedValue > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                ₹{Math.round(data.unattributedValue).toLocaleString("en-IN")} of invoiced sales this FY couldn't be matched to an item in the Item Master (name mismatch) — excluded from classification below. Run Item Master import to improve matching.
              </p>
            </div>
          )}

          <StatusTabs
            label="Analysis views"
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabKey)}
            tabs={TABS.map((t) => ({ value: t.key, label: t.label }))}
          />

          {activeTab === "analysis" && <AnalysisTab seasonality={data.seasonality} matrix={data.matrix} />}
          {activeTab === "priority" && <PriorityReviewTab items={data.priorityReview} />}
          {activeTab === "monthly-value" && <SkuMonthlyTab metric="value" items={data.priorityReview} elapsedMonths={data.elapsedMonths} />}
          {activeTab === "monthly-qty" && <SkuMonthlyTab metric="qty" items={data.priorityReview} elapsedMonths={data.elapsedMonths} />}
        </>
      )}
    </div>
  );
}
