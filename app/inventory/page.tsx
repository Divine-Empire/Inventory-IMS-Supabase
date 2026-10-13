"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Download,
  Upload,
  List,
  X,
  Calculator,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, defaultColumnVisibility, type ColumnVisibility, type DataColumn } from "@/components/data/data-table";
import { ColumnSelector } from "@/components/data/column-selector";
import { FilterSelect, FilterToolbar, type FilterChip } from "@/components/data/filter-toolbar";
import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type InventoryRow = {
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  category: string | null;
  uom: string | null;
  locationCode: string;
  locationName: string;
  liveStock: number;
  reservedQty: number;
  freeQty: number;
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

const STATUS_TONE: Record<InventoryRow["status"], StatusTone> = {
  "Fast Moving": "success",
  "Slow Moving": "warning",
  "Non-Moving": "neutral",
};

const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN") : "-");

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

  const fetchData = async (quiet = false) => {
    if (!quiet) setLoading(true);
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
    // Background auto-refresh: the server re-syncs PFMS Pending / OTP Pre-Invoice
    // Sales only if they are older than 30 min, so this is almost always a no-op.
    // Failures are silent — the manual Sync buttons still work.
    fetch("/api/sync/auto", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.changed) {
          fetchData(true);
          toast.success("Pending & sales data auto-refreshed");
        }
      })
      .catch(() => {});
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

  const columns = useMemo<DataColumn<InventoryRow>[]>(
    () => [
      {
        id: "itemCode",
        header: "Item Code",
        sticky: true,
        width: 120,
        sortValue: (r) => r.itemCode,
        cell: (r) => <span className="font-mono font-semibold text-brand-700">{r.itemCode}</span>,
      },
      {
        id: "itemName",
        header: "Item Name",
        sticky: "lg",
        width: 260,
        wrap: true,
        sortValue: (r) => r.itemName,
        cell: (r) => (
          <span className="line-clamp-2 font-medium" title={r.itemName}>
            {r.itemName}
          </span>
        ),
      },
      { id: "location", header: "Location", width: 90, sortValue: (r) => r.locationCode, cell: (r) => r.locationCode },
      {
        id: "liveStock",
        header: "Live Stock",
        align: "right",
        sortValue: (r) => r.liveStock,
        cell: (r) => <span className="font-semibold text-brand-800">{r.liveStock}</span>,
      },
      {
        id: "reserved",
        header: "Reserved",
        align: "right",
        sortValue: (r) => r.reservedQty,
        cell: (r) => (
          <span className={r.reservedQty > 0 ? "font-medium text-warning" : "text-muted-foreground"}>{r.reservedQty}</span>
        ),
      },
      {
        id: "free",
        header: "Free",
        align: "right",
        sortValue: (r) => r.freeQty,
        cell: (r) =>
          r.freeQty < 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {r.freeQty}
            </span>
          ) : (
            <span className="font-semibold">{r.freeQty}</span>
          ),
      },
      { id: "maxLevel", header: "Max Level", align: "right", sortValue: (r) => r.maxLevel, cell: (r) => r.maxLevel ?? "-" },
      {
        id: "maxLevelPeak",
        header: "Max Level Peak",
        align: "right",
        sortValue: (r) => r.maxLevelPeak,
        cell: (r) => r.maxLevelPeak ?? "-",
      },
      { id: "indentRaised", header: "Indent Raised", align: "right", sortValue: (r) => r.indentRaisedQty, cell: (r) => r.indentRaisedQty },
      { id: "poQty", header: "PO Qty", align: "right", sortValue: (r) => r.poQty, cell: (r) => r.poQty },
      {
        id: "inTransit",
        header: "In-Transit Qty",
        align: "right",
        sortValue: (r) => r.materialInTransitQty,
        cell: (r) => r.materialInTransitQty,
      },
      {
        id: "target",
        header: "Target Qty",
        align: "right",
        sortValue: (r) => r.targetQty,
        cell: (r) => <span className="font-semibold">{r.targetQty}</span>,
      },
      {
        id: "reorder",
        header: "Reorder Qty",
        align: "right",
        sortValue: (r) => r.reorderQty,
        cell: (r) =>
          r.reorderQty === null ? (
            "-"
          ) : r.reorderQty > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {r.reorderQty}
            </span>
          ) : (
            <span className="font-semibold text-success">{r.reorderQty}</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (r) => r.status,
        cell: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>,
      },
      { id: "leadTime", header: "Lead Time (d)", align: "right", sortValue: (r) => r.leadTimeDays, cell: (r) => r.leadTimeDays ?? "-" },
      { id: "salesQty", header: "Total Sales Qty", align: "right", sortValue: (r) => r.totalSalesQty, cell: (r) => r.totalSalesQty },
      {
        id: "salesValue",
        header: "Total Sales Value",
        align: "right",
        sortValue: (r) => r.totalSalesValue,
        cell: (r) => <span className="font-medium">₹{r.totalSalesValue.toLocaleString("en-IN")}</span>,
      },
      { id: "transferIn", header: "Transfer IN", align: "right", sortValue: (r) => r.stockTransferInQty, cell: (r) => r.stockTransferInQty },
      { id: "transferOut", header: "Transfer OUT", align: "right", sortValue: (r) => r.stockTransferOutQty, cell: (r) => r.stockTransferOutQty },
      {
        id: "serials",
        header: "Serials of Live Stock",
        align: "center",
        sortValue: (r) => r.serialCount,
        cell: (r) => (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-brand-200 px-2 text-brand-700 hover:bg-brand-50"
            disabled={r.serialCount === 0}
            aria-label={`View ${r.serialCount} serial numbers for ${r.itemCode} at ${r.locationCode}`}
            onClick={() => setSerialsModalFor({ itemCode: r.itemCode, itemName: r.itemName, locationCode: r.locationCode })}
          >
            <List className="h-3 w-3" aria-hidden /> {r.serialCount}
          </Button>
        ),
      },
      {
        id: "warranty",
        header: "Nearest Warranty Expiry",
        align: "center",
        sortValue: (r) => r.nearestWarrantyExpiry,
        cell: (r) => formatDate(r.nearestWarrantyExpiry),
      },
      {
        id: "invoiceDate",
        header: "Nearest Invoice Date",
        align: "center",
        sortValue: (r) => r.nearestInvoiceDate,
        cell: (r) => formatDate(r.nearestInvoiceDate),
      },
    ],
    []
  );

  const [visibility, setVisibility] = useState<ColumnVisibility>(() => defaultColumnVisibility(columns));

  const chips: FilterChip[] = [];
  if (filters.location !== "All")
    chips.push({ key: "location", label: `Location: ${filters.location}`, onRemove: () => setFilters((f) => ({ ...f, location: "All" })) });
  if (filters.status !== "All")
    chips.push({ key: "status", label: `Status: ${filters.status}`, onRemove: () => setFilters((f) => ({ ...f, status: "All" })) });
  if (filters.search.trim())
    chips.push({ key: "search", label: `Search: ${filters.search.trim()}`, onRemove: () => setFilters((f) => ({ ...f, search: "" })) });
  const clearAll = () => setFilters({ location: "All", status: "All", search: "" });

  return (
    <div className="flex flex-col gap-4">
      <ImportAndSyncBar
        onDataChanged={() => fetchData()}
        description={loading ? "Loading..." : `${filteredRows.length} of ${rows.length} item-location rows`}
      />

      <FilterToolbar
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Search item code or name",
        }}
        filters={
          <>
            <FilterSelect
              label="Location"
              value={filters.location}
              onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
              allLabel="All locations"
              options={locations.map((l) => ({ value: l, label: l }))}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              allLabel="All statuses"
              options={(Object.keys(STATUS_TONE) as InventoryRow["status"][]).map((s) => ({ value: s, label: s }))}
            />
          </>
        }
        trailing={
          <>
            <ColumnSelector columns={columns} visibility={visibility} onChange={setVisibility} />
            <Button variant="outline" size="sm" className="h-9" onClick={() => fetchData()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </Button>
          </>
        }
        chips={chips}
        onClearAll={clearAll}
      />

      <DataTable
        label="Item-wise inventory"
        columns={columns}
        rows={filteredRows}
        getRowId={(r) => `${r.itemCode}-${r.locationCode}`}
        visibility={visibility}
        loading={loading}
        error={error}
        onRetry={() => fetchData()}
        empty={
          rows.length === 0
            ? {
                title: "No inventory yet",
                description: "Import the item CSV or run a sync from the Sync data menu to load stock.",
              }
            : {
                title: "No rows match your filters",
                description: "Try a different search or clear the filters.",
                action: (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear all filters
                  </Button>
                ),
              }
        }
      />

      {serialsModalFor && <SerialsModal target={serialsModalFor} onClose={() => setSerialsModalFor(null)} />}
    </div>
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Serials in stock · {target.locationCode}</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-medium text-foreground">{target.itemCode}</span> · {target.itemName}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center py-10" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading serials" />
            </div>
          ) : serials.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No serials in stock</p>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-xs font-medium text-muted-foreground">
                  <th scope="col" className="sticky top-0 border-b bg-secondary px-3 py-2">Serial No</th>
                  <th scope="col" className="sticky top-0 border-b bg-secondary px-3 py-2">Lift No (INN source)</th>
                  <th scope="col" className="sticky top-0 border-b bg-secondary px-3 py-2">Warranty / Invoice Date</th>
                </tr>
              </thead>
              <tbody>
                {serials.map((s) => (
                  <tr key={s.serialNo}>
                    <td className="border-b px-3 py-2 font-mono font-medium">{s.serialNo}</td>
                    <td className="border-b px-3 py-2 font-mono">{s.liftNo ?? "-"}</td>
                    <td className="border-b px-3 py-2">{formatDate(s.warrantyExpiryDate ?? s.invoiceDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SYNC_TYPES = {
  pfms: { label: "PFMS Pending (Indent/In-Transit/Lead Time)", endpoint: "pfms" },
  "otp-pending-sales": { label: "OTP Pre-Invoice Sales", endpoint: "otp-pending-sales" },
  "pfms-serials": { label: "PFMS Serial IN", endpoint: "pfms-serials" },
  "pfms-returns": { label: "PFMS Purchase Return", endpoint: "pfms-returns" },
  "otp-reservations": { label: "Reconcile OTP Reservations", endpoint: "otp-reservations" },
} as const;

type SyncType = keyof typeof SYNC_TYPES;

const DEFAULT_SAFETY_FACTOR = 1.2;
const DEFAULT_GROWTH_RATE = 1.1;

function ImportAndSyncBar({ onDataChanged, description }: { onDataChanged: () => void; description: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [syncing, setSyncing] = useState<SyncType | null>(null);
  const [lastSync, setLastSync] = useState<{ label: string; summary: Record<string, number> } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [maxLevelDialogOpen, setMaxLevelDialogOpen] = useState(false);
  const [safetyFactor, setSafetyFactor] = useState(String(DEFAULT_SAFETY_FACTOR));
  const [growthRate, setGrowthRate] = useState(String(DEFAULT_GROWTH_RATE));
  const [recalculating, setRecalculating] = useState(false);

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

  const runMaxLevelRecalc = async () => {
    setRecalculating(true);
    try {
      const res = await fetch("/api/items/recalculate-max-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safetyFactor: safetyFactor.trim() ? Number(safetyFactor) : undefined,
          growthRate: growthRate.trim() ? Number(growthRate) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(
        `Max Level recalculated — ${data.summary.itemLocationsUpdated}/${data.summary.itemLocationsConsidered} item-location(s) updated`
      );
      setMaxLevelDialogOpen(false);
      onDataChanged();
    } catch (err: any) {
      toast.error(err.message || "Max Level recalculation failed");
    } finally {
      setRecalculating(false);
    }
  };

  const hasResult = !!(importResult?.summary || lastSync);

  return (
    <>
      <PageHeader
        title="Item-wise Inventory"
        description={description}
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-9" asChild>
              <a href="/api/items/template">
                <Download className="h-4 w-4" aria-hidden />
                Download template
              </a>
            </Button>

            <Button variant="outline" size="sm" className="h-9" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {uploading ? "Importing..." : "Import CSV"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              aria-label="Choose CSV file to import"
              onChange={handleFileSelected}
            />

            <Button variant="outline" size="sm" className="h-9" onClick={() => setMaxLevelDialogOpen(true)}>
              <Calculator className="h-4 w-4" aria-hidden />
              Recalculate max level
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9" disabled={!!syncing}>
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                  {syncing ? "Syncing..." : "Sync data"}
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {(Object.keys(SYNC_TYPES) as SyncType[]).map((type) => (
                  <DropdownMenuItem key={type} disabled={!!syncing} onSelect={() => runSync(type)}>
                    {SYNC_TYPES[type].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Dialog open={maxLevelDialogOpen} onOpenChange={setMaxLevelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recalculate Max Level / Max Level Peak</DialogTitle>
            <DialogDescription>
              Formula: Average Sale/Day (per item+location, seasonal) × Lead Time (days, from system) × Safety Factor ×
              Growth Rate. Max Level uses Jun-Sep sales, Max Level Peak uses Oct-May sales. Lead Time is always taken
              from the system per item — it can't be overridden here, since one number for every item would be wrong for
              most of them.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="safetyFactor">Safety Factor</Label>
              <Input
                id="safetyFactor"
                type="number"
                step="0.1"
                min="0"
                value={safetyFactor}
                onChange={(e) => setSafetyFactor(e.target.value)}
                placeholder={String(DEFAULT_SAFETY_FACTOR)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="growthRate">Growth Rate</Label>
              <Input
                id="growthRate"
                type="number"
                step="0.1"
                min="0"
                value={growthRate}
                onChange={(e) => setGrowthRate(e.target.value)}
                placeholder={String(DEFAULT_GROWTH_RATE)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMaxLevelDialogOpen(false)} disabled={recalculating}>
              Cancel
            </Button>
            <Button onClick={runMaxLevelRecalc} disabled={recalculating}>
              {recalculating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {recalculating ? "Calculating..." : "Recalculate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hasResult && !expanded && (
        <div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setExpanded(true)}>
            Show last result
          </Button>
        </div>
      )}

      {hasResult && expanded && (
        <section aria-label="Last import and sync result" className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">Last result</p>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8" onClick={() => setExpanded(false)} aria-label="Hide last result">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {importResult?.summary && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">CSV import</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                <SummaryStat label="Rows processed" value={importResult.summary.rowsProcessed} />
                <SummaryStat label="Items created" value={importResult.summary.itemsCreated} />
                <SummaryStat label="Items updated" value={importResult.summary.itemsUpdated} />
                <SummaryStat label="Location settings" value={importResult.summary.locationSettingsUpserted} />
                <SummaryStat label="Opening entries added" value={importResult.summary.openingEntriesAdded} />
                <SummaryStat label="Opening entries skipped" value={importResult.summary.openingEntriesSkipped} />
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-auto rounded-md border border-danger/25 bg-danger-soft p-3 text-xs text-danger">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {lastSync && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{lastSync.label} sync</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {Object.entries(lastSync.summary).map(([k, v]) => (
                  <SummaryStat key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-secondary px-3 py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
