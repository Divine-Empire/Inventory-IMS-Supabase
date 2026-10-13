"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, AlertTriangle, Layers, PackageSearch, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/data/stat-tile";
import { ErrorState } from "@/components/data/table-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type InventoryRow = {
  itemCode: string;
  locationCode: string;
  liveStock: number;
  reorderQty: number | null;
  status: "Fast Moving" | "Slow Moving" | "Non-Moving";
  totalSalesValue: number;
};

export default function DashboardPage() {
  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  );
}

function DashboardContent() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRows(res.data);
        else setError(res.error || "Failed to load dashboard");
      })
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const uniqueItems = new Set(rows.map((r) => r.itemCode)).size;
    const uniqueLocations = new Set(rows.map((r) => r.locationCode)).size;
    const totalLiveStock = rows.reduce((s, r) => s + r.liveStock, 0);
    const totalSalesValue = rows.reduce((s, r) => s + r.totalSalesValue, 0);
    const belowReorder = rows.filter((r) => r.reorderQty !== null && r.reorderQty > 0).length;

    const fast = rows.filter((r) => r.status === "Fast Moving").length;
    const slow = rows.filter((r) => r.status === "Slow Moving").length;
    const nonMoving = rows.filter((r) => r.status === "Non-Moving").length;
    const total = rows.length || 1;

    return {
      uniqueItems,
      uniqueLocations,
      totalLiveStock,
      totalSalesValue,
      belowReorder,
      fast,
      slow,
      nonMoving,
      fastPct: Math.round((fast / total) * 100),
      slowPct: Math.round((slow / total) * 100),
      nonMovingPct: Math.round((nonMoving / total) * 100),
    };
  }, [rows]);

  const n = (v: number) => v.toLocaleString("en-IN");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description={loading ? "Loading..." : `Across ${stats.uniqueLocations} location(s)`}
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border bg-card">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Layers} tone="brand" label="Item-location rows" value={n(rows.length)} loading={loading} />
            <StatTile icon={PackageSearch} tone="brand" label="Unique items" value={n(stats.uniqueItems)} loading={loading} />
            <StatTile icon={Boxes} tone="lime" label="Live stock (units)" value={n(stats.totalLiveStock)} loading={loading} />
            <StatTile icon={AlertTriangle} tone="danger" label="Below reorder level" value={n(stats.belowReorder)} loading={loading} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="status-mix">
              <h2 id="status-mix" className="mb-4 text-sm font-semibold">
                Item status mix
              </h2>
              {loading ? (
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <StatusBar icon={TrendingUp} label="Fast moving" count={stats.fast} pct={stats.fastPct} fill="bg-brand-lime" />
                  <StatusBar icon={Minus} label="Slow moving" count={stats.slow} pct={stats.slowPct} fill="bg-amber-500" />
                  <StatusBar icon={TrendingDown} label="Non-moving" count={stats.nonMoving} pct={stats.nonMovingPct} fill="bg-neutral/50" />
                </div>
              )}
            </section>

            <section className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="sales-overview">
              <h2 id="sales-overview" className="mb-4 text-sm font-semibold">
                Sales overview
              </h2>
              {loading ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <p className="text-3xl font-semibold tabular-nums text-brand-800">₹{n(stats.totalSalesValue)}</p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">Total sales value across all synced quotations/invoices</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBar({
  icon: Icon,
  label,
  count,
  pct,
  fill,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  count: number;
  pct: number;
  fill: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {count.toLocaleString("en-IN")} <span className="text-foreground">· {pct}%</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={`${label}: ${pct}%`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
