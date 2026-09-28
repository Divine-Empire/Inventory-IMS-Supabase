"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";

type InventoryRow = {
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  category: string | null;
  uom: string | null;
  locationCode: string;
  locationName: string;
  liveStock: number;
  indentRaisedQty: number;
  poQty: number;
  pendingPoQty: number;
  materialInTransitQty: number;
  leadTimeDays: number | null;
  targetQty: number;
  maxLevel: number | null;
  reorderQty: number | null;
  status: "Fast Moving" | "Slow Moving" | "Non-Moving";
  totalSalesQty: number;
  totalSalesValue: number;
  stockTransferInQty: number;
  stockTransferOutQty: number;
  serialCount: number;
  nearestWarrantyExpiry: string | null;
};

const STATUS_STYLES: Record<InventoryRow["status"], string> = {
  "Fast Moving": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Slow Moving": "bg-amber-100 text-amber-800 border-amber-300",
  "Non-Moving": "bg-slate-200 text-slate-700 border-slate-300",
};

export default function InventoryPage() {
  return (
    <MainLayout>
      <InventoryContent />
    </MainLayout>
  );
}

function InventoryContent() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({ location: "All", status: "All", search: "" });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory?_t=${Date.now()}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to load inventory");
      setRows(result.data);
    } catch (err: any) {
      setError(err.message);
      toast.error("Failed to load inventory: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const locations = useMemo(
    () => Array.from(new Set(rows.map((r) => r.locationCode))).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const search = filters.search.toLowerCase().trim();
    return rows.filter((r) => {
      if (filters.location !== "All" && r.locationCode !== filters.location) return false;
      if (filters.status !== "All" && r.status !== filters.status) return false;
      if (search && !r.itemCode.toLowerCase().includes(search) && !r.itemName.toLowerCase().includes(search))
        return false;
      return true;
    });
  }, [rows, filters]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-slate-800" />
        <p className="text-slate-900 font-semibold animate-pulse">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="border border-red-300 bg-red-50 rounded-lg p-6 flex flex-col items-center gap-3">
          <AlertCircle className="w-10 h-10 text-red-600" />
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
          <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Item-wise Inventory</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="text-xs font-bold border border-slate-300 rounded-full px-3 py-1.5 bg-slate-50"
            value={filters.location}
            onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
          >
            <option value="All">All Locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            className="text-xs font-bold border border-slate-300 rounded-full px-3 py-1.5 bg-slate-50"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="All">All Status</option>
            <option value="Fast Moving">Fast Moving</option>
            <option value="Slow Moving">Slow Moving</option>
            <option value="Non-Moving">Non-Moving</option>
          </select>

          <input
            type="text"
            placeholder="Search item code/name..."
            className="text-xs font-semibold border border-slate-300 rounded-full px-3 py-1.5 w-56"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />

          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 text-xs font-bold border border-slate-300 rounded-full px-3 py-1.5 bg-white hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>

          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
            {filteredRows.length} rows
          </span>
        </div>
      </div>

      <div className="border border-slate-300 rounded-lg bg-white overflow-auto max-h-[75vh]">
        <table className="w-full text-xs border-collapse whitespace-nowrap">
          <thead className="sticky top-0 bg-slate-100 z-10">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600 font-extrabold">
              <Th>Item Code</Th>
              <Th>Item Name</Th>
              <Th>Location</Th>
              <Th>Live Stock</Th>
              <Th>Indent Raised</Th>
              <Th>PO Qty</Th>
              <Th>Pending PO</Th>
              <Th>In-Transit</Th>
              <Th>Target Qty</Th>
              <Th>Max Level</Th>
              <Th>Reorder Qty</Th>
              <Th>Status</Th>
              <Th>Lead Time (d)</Th>
              <Th>Total Sales Qty</Th>
              <Th>Total Sales Value</Th>
              <Th>Transfer IN</Th>
              <Th>Transfer OUT</Th>
              <Th>Serials</Th>
              <Th>Nearest Warranty/Invoice Expiry</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={19} className="text-center py-10 text-slate-500 font-semibold">
                  No matching records
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={`${r.itemCode}-${r.locationCode}`} className="hover:bg-slate-50">
                  <Td className="font-mono font-bold">{r.itemCode}</Td>
                  <Td className="max-w-[220px] truncate" title={r.itemName}>{r.itemName}</Td>
                  <Td className="font-bold">{r.locationCode}</Td>
                  <Td className="text-center font-bold">{r.liveStock}</Td>
                  <Td className="text-center">{r.indentRaisedQty}</Td>
                  <Td className="text-center">{r.poQty}</Td>
                  <Td className="text-center">{r.pendingPoQty}</Td>
                  <Td className="text-center">{r.materialInTransitQty}</Td>
                  <Td className="text-center font-bold">{r.targetQty}</Td>
                  <Td className="text-center">{r.maxLevel ?? "-"}</Td>
                  <Td className={`text-center font-bold ${r.reorderQty !== null && r.reorderQty > 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {r.reorderQty ?? "-"}
                  </Td>
                  <Td>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                  </Td>
                  <Td className="text-center">{r.leadTimeDays ?? "-"}</Td>
                  <Td className="text-center">{r.totalSalesQty}</Td>
                  <Td className="text-right font-semibold">₹{r.totalSalesValue.toLocaleString("en-IN")}</Td>
                  <Td className="text-center">{r.stockTransferInQty}</Td>
                  <Td className="text-center">{r.stockTransferOutQty}</Td>
                  <Td className="text-center">{r.serialCount}</Td>
                  <Td className="text-center">
                    {r.nearestWarrantyExpiry ? new Date(r.nearestWarrantyExpiry).toLocaleDateString("en-IN") : "-"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 border-r border-slate-200 bg-slate-100">{children}</th>;
}

function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-3 py-2 border-r border-slate-100 ${className}`} title={title}>
      {children}
    </td>
  );
}
