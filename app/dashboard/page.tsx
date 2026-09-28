"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Boxes, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";

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

  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRows(res.data);
      })
      .finally(() => setLoading(false));
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
      fastPct: Math.round((fast / total) * 100),
      slowPct: Math.round((slow / total) * 100),
      nonMovingPct: Math.round((nonMoving / total) * 100),
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-slate-800" />
        <p className="text-slate-900 font-semibold animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
        <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Boxes} label="Total SKU x Location Rows" value={rows.length} color="from-violet-600 to-indigo-600" />
        <MetricCard icon={Boxes} label="Unique Items" value={stats.uniqueItems} color="from-blue-600 to-cyan-600" />
        <MetricCard icon={Boxes} label="Total Live Stock (units)" value={stats.totalLiveStock} color="from-emerald-600 to-teal-600" />
        <MetricCard
          icon={AlertTriangle}
          label="Below Reorder Level"
          value={stats.belowReorder}
          color="from-rose-600 to-red-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Item Status Mix</h2>
          <div className="flex flex-col gap-3">
            <StatusBar icon={TrendingUp} label="Fast Moving" pct={stats.fastPct} color="bg-emerald-500" />
            <StatusBar icon={Minus} label="Slow Moving" pct={stats.slowPct} color="bg-amber-500" />
            <StatusBar icon={TrendingDown} label="Non-Moving" pct={stats.nonMovingPct} color="bg-slate-400" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Sales Overview</h2>
          <p className="text-3xl font-extrabold text-slate-900">₹{stats.totalSalesValue.toLocaleString("en-IN")}</p>
          <p className="text-xs text-slate-500 mt-1">Total sales value across all synced quotations/invoices</p>
          <p className="text-[11px] text-slate-400 mt-3">
            Live stock across {stats.uniqueLocations || 0} location(s). Indent/PO/Sales figures fill in once the
            PFMS and LTO/OTP sync jobs are wired up.
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function StatusBar({ icon: Icon, label, pct, color }: { icon: any; label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
        <span className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
