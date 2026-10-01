"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertCircle, Download, Upload, ChevronDown, ChevronUp, List, X } from "lucide-react";
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
  maxLevel: number | null;
  maxLevelPeak: number | null;
  indentRaisedQty: number;
  poQty: number;
  materialInTransitQty: number;
  targetQty: number;
  reorderQty: number | null;
  leadTimeDays: number | null;
  totalSalesQty: number;
  totalSalesValue: number;
  stockTransferInQty: number;
  stockTransferOutQty: number;
  serialCount: number;
  nearestWarrantyExpiry: string | null;
  nearestInvoiceDate: string | null;
  status: "Fast Moving" | "Slow Moving" | "Non-Moving";
};

type ImportResult = {
  success: boolean;
  summary?: {
    rowsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    locationSettingsUpserted: number;
    openingEntriesAdded: number;
    openingEntriesSkipped: number;
    errorCount: number;
  };
  errors?: string[];
  error?: string;
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
  const [serialsModalFor, setSerialsModalFor] = useState<{ itemCode: string; itemName: string; locationCode: string } | null>(null);

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

  return (
    <div className="p-6 flex flex-col gap-4 max-w-[1800px] mx-auto">
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

      <ImportAndSyncBar onDataChanged={fetchData} />

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-slate-800" />
          <p className="text-slate-900 font-semibold animate-pulse">Loading inventory...</p>
        </div>
      ) : error ? (
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
      ) : (
        <div className="border border-slate-300 rounded-lg bg-white overflow-auto max-h-[70vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-slate-100 z-10">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-600 font-extrabold whitespace-nowrap">
                <Th>Item Code</Th>
                <Th className="min-w-[260px]">Item Name</Th>
                <Th>Location</Th>
                <Th>Live Stock</Th>
                <Th>Max Level</Th>
                <Th>Max Level Peak</Th>
                <Th>Indent Raised</Th>
                <Th>PO Qty</Th>
                <Th>In-Transit Qty</Th>
                <Th>Target Qty</Th>
                <Th>Reorder Qty</Th>
                <Th>Status</Th>
                <Th>Lead Time (d)</Th>
                <Th>Total Sales Qty</Th>
                <Th>Total Sales Value</Th>
                <Th>Transfer IN</Th>
                <Th>Transfer OUT</Th>
                <Th>Serials of Live Stock</Th>
                <Th>Nearest Warranty Expiry</Th>
                <Th>Nearest Invoice Date</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={20} className="text-center py-10 text-slate-500 font-semibold">
                    No matching records
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={`${r.itemCode}-${r.locationCode}`} className="hover:bg-slate-50 whitespace-nowrap">
                    <Td className="font-mono font-bold">{r.itemCode}</Td>
                    <Td className="whitespace-normal break-words font-semibold text-slate-800">{r.itemName}</Td>
                    <Td className="font-bold">{r.locationCode}</Td>
                    <Td className="text-center font-bold">{r.liveStock}</Td>
                    <Td className="text-center">{r.maxLevel ?? "-"}</Td>
                    <Td className="text-center">{r.maxLevelPeak ?? "-"}</Td>
                    <Td className="text-center">{r.indentRaisedQty}</Td>
                    <Td className="text-center">{r.poQty}</Td>
                    <Td className="text-center">{r.materialInTransitQty}</Td>
                    <Td className="text-center font-bold">{r.targetQty}</Td>
                    <Td className={`text-center font-bold ${r.reorderQty !== null && r.reorderQty > 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {r.reorderQty ?? "-"}
                    </Td>
                    <Td>
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                    </Td>
                    <Td className="text-center">{r.leadTimeDays ?? "-"}</Td>
                    <Td className="text-center">{r.totalSalesQty}</Td>
                    <Td className="text-right font-semibold">₹{r.totalSalesValue.toLocaleString("en-IN")}</Td>
                    <Td className="text-center">{r.stockTransferInQty}</Td>
                    <Td className="text-center">{r.stockTransferOutQty}</Td>
                    <Td className="text-center">
                      <button
                        onClick={() => setSerialsModalFor({ itemCode: r.itemCode, itemName: r.itemName, locationCode: r.locationCode })}
                        disabled={r.serialCount === 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <List className="w-3 h-3" /> {r.serialCount}
                      </button>
                    </Td>
                    <Td className="text-center">
                      {r.nearestWarrantyExpiry ? new Date(r.nearestWarrantyExpiry).toLocaleDateString("en-IN") : "-"}
                    </Td>
                    <Td className="text-center">
                      {r.nearestInvoiceDate ? new Date(r.nearestInvoiceDate).toLocaleDateString("en-IN") : "-"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {serialsModalFor && <SerialsModal target={serialsModalFor} onClose={() => setSerialsModalFor(null)} />}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 border-r border-slate-200 bg-slate-100 ${className}`}>{children}</th>;
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
    <td className={`px-3 py-2.5 border-r border-slate-100 ${className}`} title={title}>
      {children}
    </td>
  );
}

type SerialDetail = { serialNo: string; liftNo: string | null; warrantyExpiryDate: string | null; invoiceDate: string | null };

function SerialsModal({
  target,
  onClose,
}: {
  target: { itemCode: string; itemName: string; locationCode: string };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [serials, setSerials] = useState<SerialDetail[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/serials/for-item?itemCode=${encodeURIComponent(target.itemCode)}&locationCode=${target.locationCode}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSerials(res.serials);
        else toast.error(res.error || "Failed to load serials");
      })
      .finally(() => setLoading(false));
  }, [target]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Serials in Stock — {target.locationCode}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono font-bold">{target.itemCode}</span> — {target.itemName}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : serials.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">No serials in stock</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                  <th className="px-4 py-2">Serial No</th>
                  <th className="px-4 py-2">Lift No (INN source)</th>
                  <th className="px-4 py-2">Warranty/Invoice Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serials.map((s) => (
                  <tr key={s.serialNo}>
                    <td className="px-4 py-2 font-mono font-semibold">{s.serialNo}</td>
                    <td className="px-4 py-2 font-mono">{s.liftNo ?? "-"}</td>
                    <td className="px-4 py-2">
                      {(s.warrantyExpiryDate ?? s.invoiceDate)
                        ? new Date((s.warrantyExpiryDate ?? s.invoiceDate)!).toLocaleDateString("en-IN")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const SYNC_TYPES = {
  pfms: { label: "PFMS Pending (Indent/In-Transit/Lead Time)", endpoint: "pfms" },
  "otp-pending-sales": { label: "OTP Pre-Invoice Sales", endpoint: "otp-pending-sales" },
  "pfms-serials": { label: "PFMS Serial IN", endpoint: "pfms-serials" },
  "pfms-returns": { label: "PFMS Purchase Return", endpoint: "pfms-returns" },
} as const;

type SyncType = keyof typeof SYNC_TYPES;

function ImportAndSyncBar({ onDataChanged }: { onDataChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [syncing, setSyncing] = useState<SyncType | null>(null);
  const [lastSync, setLastSync] = useState<{ label: string; summary: Record<string, number> } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/items/import", { method: "POST", body: formData });
      const data: ImportResult = await res.json();
      setImportResult(data);
      setExpanded(true);

      if (data.success) {
        toast.success(`Import done — ${data.summary?.itemsCreated ?? 0} created, ${data.summary?.itemsUpdated ?? 0} updated`);
        onDataChanged();
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runSync = async (type: SyncType) => {
    setSyncing(type);
    try {
      const res = await fetch(`/api/sync/${SYNC_TYPES[type].endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLastSync({ label: SYNC_TYPES[type].label, summary: data.summary });
      setExpanded(true);
      toast.success(`${SYNC_TYPES[type].label} sync complete`);
      onDataChanged();
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="border border-slate-300 rounded-lg bg-white">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <a
          href="/api/items/template"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
        >
          <Download className="w-3.5 h-3.5" />
          Download Template
        </a>

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-semibold text-white"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Importing..." : "Import CSV"}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {(Object.keys(SYNC_TYPES) as SyncType[]).map((type) => (
          <button
            key={type}
            disabled={!!syncing}
            onClick={() => runSync(type)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-violet-300 bg-violet-50 hover:bg-violet-100 disabled:opacity-60 text-xs font-semibold text-violet-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing === type ? "animate-spin" : ""}`} />
            {syncing === type ? "Syncing..." : `Sync ${SYNC_TYPES[type].label}`}
          </button>
        ))}

        {(importResult?.summary || lastSync) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            {expanded ? "Hide" : "Show"} last result
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {expanded && (importResult?.summary || lastSync) && (
        <div className="border-t border-slate-200 p-3 flex flex-col gap-3">
          {importResult?.summary && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">CSV Import — last run result</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                <SummaryStat label="Rows Processed" value={importResult.summary.rowsProcessed} />
                <SummaryStat label="Items Created" value={importResult.summary.itemsCreated} />
                <SummaryStat label="Items Updated" value={importResult.summary.itemsUpdated} />
                <SummaryStat label="Location Settings" value={importResult.summary.locationSettingsUpserted} />
                <SummaryStat label="Opening Entries Added" value={importResult.summary.openingEntriesAdded} />
                <SummaryStat label="Opening Entries Skipped" value={importResult.summary.openingEntriesSkipped} />
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3 max-h-40 overflow-auto list-disc list-inside mt-2">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {lastSync && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">{lastSync.label} sync — last run result</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {Object.entries(lastSync.summary).map(([k, v]) => (
                  <SummaryStat key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
      <div className="text-sm font-extrabold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
    </div>
  );
}
