"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, Boxes, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/data/data-table";
import { FilterSelect, FilterToolbar, type FilterChip } from "@/components/data/filter-toolbar";
import { StatusTabs } from "@/components/data/status-tabs";
import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LOCATIONS = ["CG", "NE", "WB", "OD", "CG-WAREHOUSE", "MANIQUIP", "CG-SERVICE-INBOUND", "HO"];

type TransferItem = { id: string; itemCode: string; qty: number; serialNumbers: string[] };
type Transfer = {
  id: string;
  transferNo: string;
  status: "pending" | "in_transit" | "received" | "cancelled";
  requestedBy: string | null;
  approvedBy: string | null;
  receivedBy: string | null;
  createdAt: string;
  referenceType: string | null; // what caused this transfer, e.g. "OTP Packing List"
  referenceNo: string | null; // ...and its number, e.g. the OTP order no
  fromLocation: { locationCode: string };
  toLocation: { locationCode: string };
  items: TransferItem[];
};

type TransferAction = "ship" | "receive" | "cancel";

const STATUS_META: Record<Transfer["status"], { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  in_transit: { label: "In transit", tone: "info" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const ACTION_COPY: Record<TransferAction, { title: string; verb: string; done: string; destructive: boolean }> = {
  ship: { title: "Ship transfer", verb: "Ship", done: "shipped", destructive: false },
  receive: { title: "Receive transfer", verb: "Receive", done: "received", destructive: false },
  cancel: { title: "Cancel transfer", verb: "Cancel transfer", done: "cancelled", destructive: true },
};

// OTP's Packing List opens this page with a transfer already worked out:
//   /stock-transfer?from=NE&to=CG-WAREHOUSE&refType=OTP%20Packing%20List&ref=DO-5097&items=[{"itemName":"...","qty":3}]
// Item names (not codes) because OTP and IMS don't share item codes.
type Prefill = {
  from: string;
  to: string;
  refType: string;
  ref: string;
  items: { itemName: string; qty: number }[];
};

function parsePrefill(params: URLSearchParams): Prefill | null {
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const rawItems = params.get("items");
  if (!rawItems || !LOCATIONS.includes(from) || !LOCATIONS.includes(to) || from === to) return null;
  try {
    const parsed = JSON.parse(rawItems);
    const items = (Array.isArray(parsed) ? parsed : [])
      .map((i: any) => ({ itemName: String(i?.itemName || "").trim(), qty: Math.floor(Number(i?.qty) || 0) }))
      .filter((i) => i.itemName && i.qty > 0);
    if (items.length === 0) return null;
    return { from, to, refType: params.get("refType") || "", ref: params.get("ref") || "", items };
  } catch {
    return null;
  }
}

export default function StockTransferPage() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <StockTransferContent />
      </Suspense>
    </MainLayout>
  );
}

function StockTransferContent() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock-transfer");
      const data = await res.json();
      if (data.success) setTransfers(data.transfers);
      else setError(data.error || "Failed to load transfers");
    } catch {
      setError("Failed to load transfers");
      toast.error("Failed to load transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  const searchParams = useSearchParams();
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  useEffect(() => {
    const parsed = parsePrefill(searchParams);
    if (!parsed) return;
    setPrefill(parsed);
    // Drop the query string so a refresh doesn't re-open the same pre-filled form.
    window.history.replaceState(null, "", "/stock-transfer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fromFilter, setFromFilter] = useState("ALL");
  const [toFilter, setToFilter] = useState("ALL");
  const [refQuery, setRefQuery] = useState("");
  const [tab, setTab] = useState<"active" | "history">("active");

  const filtered = useMemo(() => {
    const q = refQuery.trim().toLowerCase();
    return transfers.filter(
      (t) =>
        (fromFilter === "ALL" || t.fromLocation.locationCode === fromFilter) &&
        (toFilter === "ALL" || t.toLocation.locationCode === toFilter) &&
        (!q || (t.referenceNo || "").toLowerCase().includes(q) || t.transferNo.toLowerCase().includes(q))
    );
  }, [transfers, fromFilter, toFilter, refQuery]);

  const active = filtered.filter((t) => t.status === "pending" || t.status === "in_transit");
  const history = filtered.filter((t) => t.status === "received" || t.status === "cancelled");

  // Movement analysis: how much is moving along each route (cancelled ones excluded).
  const routeSummary = useMemo(() => {
    const byRoute = new Map<string, { from: string; to: string; transfers: number; units: number; forOrders: number }>();
    for (const t of filtered) {
      if (t.status === "cancelled") continue;
      const key = `${t.fromLocation.locationCode}>${t.toLocation.locationCode}`;
      const row = byRoute.get(key) || { from: t.fromLocation.locationCode, to: t.toLocation.locationCode, transfers: 0, units: 0, forOrders: 0 };
      row.transfers += 1;
      row.units += t.items.reduce((sum, i) => sum + i.qty, 0);
      if (t.referenceNo) row.forOrders += 1;
      byRoute.set(key, row);
    }
    return Array.from(byRoute.values()).sort((a, b) => b.units - a.units);
  }, [filtered]);

  const runAction = async (action: TransferAction, id: string) => {
    try {
      const res = await fetch(`/api/stock-transfer/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(`Transfer ${action === "ship" ? "shipped" : action === "receive" ? "received" : "cancelled"}`);
      fetchTransfers();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} transfer`);
    }
  };

  // Every status change goes through a confirmation step.
  const [confirm, setConfirm] = useState<{ action: TransferAction; transfer: Transfer } | null>(null);
  const [acting, setActing] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);

  const columns = useMemo<DataColumn<Transfer>[]>(
    () => [
      {
        id: "transferNo",
        header: "Transfer No",
        sticky: true,
        width: 150,
        sortValue: (t) => t.transferNo,
        cell: (t) => <span className="font-mono font-semibold text-brand-700">{t.transferNo}</span>,
      },
      {
        id: "route",
        header: "Route",
        sortValue: (t) => `${t.fromLocation.locationCode}>${t.toLocation.locationCode}`,
        cell: (t) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {t.fromLocation.locationCode}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" />
            {t.toLocation.locationCode}
          </span>
        ),
      },
      {
        id: "items",
        header: "Items",
        wrap: true,
        width: 280,
        cell: (t) => {
          const text = t.items.map((i) => `${i.itemCode} ×${i.qty}`).join(", ");
          return (
            <span className="line-clamp-2" title={text}>
              {text}
            </span>
          );
        },
      },
      {
        id: "for",
        header: "For",
        sortValue: (t) => t.referenceNo,
        cell: (t) =>
          t.referenceNo ? (
            <span className="inline-flex flex-col leading-tight">
              <span className="font-mono font-medium">{t.referenceNo}</span>
              <span className="text-xs text-muted-foreground">{t.referenceType}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (t) => STATUS_META[t.status].label,
        cell: (t) => <StatusBadge tone={STATUS_META[t.status].tone}>{STATUS_META[t.status].label}</StatusBadge>,
      },
      {
        id: "people",
        header: "Requested / Approved / Received By",
        cell: (t) => (
          <span className="text-muted-foreground">
            {t.requestedBy || "-"} / {t.approvedBy || "-"} / {t.receivedBy || "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        stickyRight: true,
        cell: (t) => (
          <span className="inline-flex items-center gap-1">
            {t.status === "pending" && (
              <>
                <Button size="sm" onClick={() => setConfirm({ action: "ship", transfer: t })}>
                  Ship
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setConfirm({ action: "cancel", transfer: t })}
                >
                  Cancel
                </Button>
              </>
            )}
            {t.status === "in_transit" && (
              <Button size="sm" onClick={() => setConfirm({ action: "receive", transfer: t })}>
                Receive
              </Button>
            )}
          </span>
        ),
      },
    ],
    []
  );

  const chips: FilterChip[] = [];
  if (fromFilter !== "ALL") chips.push({ key: "from", label: `From: ${fromFilter}`, onRemove: () => setFromFilter("ALL") });
  if (toFilter !== "ALL") chips.push({ key: "to", label: `To: ${toFilter}`, onRemove: () => setToFilter("ALL") });
  if (refQuery.trim()) chips.push({ key: "q", label: `Search: ${refQuery.trim()}`, onRemove: () => setRefQuery("") });
  const clearAll = () => {
    setFromFilter("ALL");
    setToFilter("ALL");
    setRefQuery("");
  };

  const rows = tab === "active" ? active : history;
  const hasFilters = chips.length > 0;
  const empty = hasFilters
    ? {
        title: "No transfers match your filters",
        description: "Try a different route or order number, or clear the filters.",
        action: (
          <Button variant="outline" size="sm" onClick={clearAll}>
            Clear all filters
          </Button>
        ),
      }
    : tab === "active"
      ? { title: "No active transfers", description: "Create a transfer to move stock between locations." }
      : { title: "No completed transfers yet", description: "Received and cancelled transfers show up here." };

  const copy = confirm ? ACTION_COPY[confirm.action] : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stock Transfer"
        description={loading ? "Loading..." : `${active.length} active · ${history.length} in history`}
        actions={<NewTransferDialog onCreated={fetchTransfers} prefill={prefill} />}
      />

      <StatusTabs
        label="Transfer status"
        value={tab}
        onValueChange={(v) => setTab(v as "active" | "history")}
        tabs={[
          { value: "active", label: "Active", count: active.length },
          { value: "history", label: "History", count: history.length },
        ]}
      />

      <FilterToolbar
        search={{ value: refQuery, onChange: setRefQuery, placeholder: "Search order no or transfer no" }}
        filters={
          <>
            <FilterSelect
              label="From location"
              value={fromFilter}
              onChange={setFromFilter}
              allValue="ALL"
              allLabel="From: all"
              options={LOCATIONS.map((l) => ({ value: l, label: `From: ${l}` }))}
            />
            <FilterSelect
              label="To location"
              value={toFilter}
              onChange={setToFilter}
              allValue="ALL"
              allLabel="To: all"
              options={LOCATIONS.map((l) => ({ value: l, label: `To: ${l}` }))}
            />
          </>
        }
        chips={chips}
        onClearAll={clearAll}
      />

      <DataTable
        label={tab === "active" ? "Active stock transfers" : "Stock transfer history"}
        columns={columns}
        rows={rows}
        getRowId={(t) => t.id}
        loading={loading}
        error={error}
        onRetry={fetchTransfers}
        empty={empty}
        maxHeightClassName="max-h-[calc(100dvh-22rem)] min-h-[260px]"
      />

      {routeSummary.length > 0 && (
        <section className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setRoutesOpen((o) => !o)}
            aria-expanded={routesOpen}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {routesOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            Movement by route
            <span className="text-muted-foreground">({routeSummary.length})</span>
          </button>
          {routesOpen && (
            <div className="overflow-auto border-t">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-xs font-semibold text-brand-800">
                    <th scope="col" className="border-b bg-secondary px-3 py-2.5 text-left">Route</th>
                    <th scope="col" className="border-b bg-secondary px-3 py-2.5 text-right">Transfers</th>
                    <th scope="col" className="border-b bg-secondary px-3 py-2.5 text-right">Units moved</th>
                    <th scope="col" className="border-b bg-secondary px-3 py-2.5 text-right">For OTP orders</th>
                  </tr>
                </thead>
                <tbody>
                  {routeSummary.map((r) => (
                    <tr key={`${r.from}>${r.to}`}>
                      <td className="border-b px-3 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {r.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" /> {r.to}
                        </span>
                      </td>
                      <td className="border-b px-3 py-2.5 text-right tabular-nums">{r.transfers}</td>
                      <td className="border-b px-3 py-2.5 text-right font-semibold tabular-nums">{r.units}</td>
                      <td className="border-b px-3 py-2.5 text-right tabular-nums">{r.forOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && !acting && setConfirm(null)}
        title={copy && confirm ? `${copy.title} ${confirm.transfer.transferNo}?` : ""}
        description={
          confirm && copy
            ? confirm.action === "cancel"
              ? `${confirm.transfer.fromLocation.locationCode} → ${confirm.transfer.toLocation.locationCode}. The transfer will be marked as cancelled and can't be reopened.`
              : `${confirm.transfer.fromLocation.locationCode} → ${confirm.transfer.toLocation.locationCode}. It will be marked as ${copy.done}.`
            : ""
        }
        confirmLabel={copy?.verb ?? ""}
        destructive={copy?.destructive}
        loading={acting}
        onConfirm={async () => {
          if (!confirm) return;
          setActing(true);
          await runAction(confirm.action, confirm.transfer.id);
          setActing(false);
          setConfirm(null);
        }}
      />
    </div>
  );
}

type ItemOption = { itemCode: string; itemName: string };
type AvailableSerial = { serialNo: string; warrantyExpiryDate: string | null; invoiceDate: string | null };

type FormRow = {
  key: number;
  item: ItemOption | null;
  itemQuery: string;
  itemOptions: ItemOption[];
  hasSerial: "no" | "yes";
  qty: string; // used when hasSerial === "no"
  serials: string[]; // used when hasSerial === "yes", one dropdown per slot
  availableSerials: AvailableSerial[];
  loadingSerials: boolean;
};

let rowKeySeq = 0;
const emptyRow = (): FormRow => ({
  key: rowKeySeq++,
  item: null,
  itemQuery: "",
  itemOptions: [],
  hasSerial: "no",
  qty: "1",
  serials: [],
  availableSerials: [],
  loadingSerials: false,
});

// One pre-filled row: resolve the item NAME to an IMS item, then — if enough
// of its serials are in stock at the source — pick the oldest ones; otherwise
// it's a plain qty transfer.
async function buildPrefillRow(it: { itemName: string; qty: number }, fromLocation: string): Promise<FormRow> {
  const base = { ...emptyRow(), itemQuery: it.itemName, qty: String(it.qty) };
  try {
    const res = await fetch(`/api/items/search?name=${encodeURIComponent(it.itemName)}`);
    const data = await res.json();
    const key = it.itemName.trim().toLowerCase();
    const match: ItemOption | undefined = (data.success ? data.items : []).find(
      (o: ItemOption) => o.itemName.trim().toLowerCase() === key
    );
    if (!match) return base;

    const serialRes = await fetch(`/api/serials/available?itemCode=${encodeURIComponent(match.itemCode)}&locationCode=${fromLocation}`);
    const serialData = await serialRes.json();
    const available: AvailableSerial[] = serialData.success ? serialData.serials : [];

    if (available.length > 0 && available.length >= it.qty) {
      return { ...base, item: match, hasSerial: "yes", serials: available.slice(0, it.qty).map((a) => a.serialNo), availableSerials: available };
    }
    return { ...base, item: match, hasSerial: "no", qty: String(it.qty) };
  } catch {
    return base;
  }
}

function NewTransferDialog({ onCreated, prefill }: { onCreated: () => void; prefill: Prefill | null }) {
  const [open, setOpen] = useState(false);
  const [fromLocation, setFromLocation] = useState("CG");
  const [toLocation, setToLocation] = useState("NE");
  const [rows, setRows] = useState<FormRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<{ type: string; no: string } | null>(null);

  useEffect(() => {
    if (!prefill) return;
    let cancelled = false;
    setFromLocation(prefill.from);
    setToLocation(prefill.to);
    setReference(prefill.ref ? { type: prefill.refType, no: prefill.ref } : null);
    setOpen(true);
    (async () => {
      const built = await Promise.all(prefill.items.map((it) => buildPrefillRow(it, prefill.from)));
      if (cancelled) return;
      setRows(built.length > 0 ? built : [emptyRow()]);
      const unmatched = built.filter((r) => !r.item).length;
      if (unmatched > 0) toast.warning(`${unmatched} item(s) couldn't be matched by name — please pick them manually.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefill]);

  const updateRow = (key: number, patch: Partial<FormRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (key: number) => setRows((r) => (r.length === 1 ? r : r.filter((row) => row.key !== key)));

  const reset = () => {
    setRows([emptyRow()]);
    setFromLocation("CG");
    setToLocation("NE");
    setReference(null);
  };

  // Item search (debounced) per row.
  useEffect(() => {
    const timers = rows.map((row) => {
      if (row.item || !row.itemQuery) return null;
      return setTimeout(async () => {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(row.itemQuery)}`);
        const data = await res.json();
        if (data.success) updateRow(row.key, { itemOptions: data.items });
      }, 200);
    });
    return () => timers.forEach((t) => t && clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.itemQuery).join("|")]);

  const fetchAvailableSerials = async (key: number, itemCode: string) => {
    updateRow(key, { loadingSerials: true });
    try {
      const res = await fetch(`/api/serials/available?itemCode=${encodeURIComponent(itemCode)}&locationCode=${fromLocation}`);
      const data = await res.json();
      updateRow(key, { availableSerials: data.success ? data.serials : [], loadingSerials: false });
    } catch {
      updateRow(key, { availableSerials: [], loadingSerials: false });
    }
  };

  // Serials picked in ANY row — a serial can't be selected twice across the whole form.
  const allPickedSerials = useMemo(() => new Set(rows.flatMap((r) => r.serials.filter(Boolean))), [rows]);

  const handleSubmit = async () => {
    const items = rows
      .filter((r) => r.item)
      .map((r) => {
        const serialNumbers = r.hasSerial === "yes" ? r.serials.filter(Boolean) : [];
        return {
          itemCode: r.item!.itemCode,
          qty: r.hasSerial === "yes" ? serialNumbers.length : Number(r.qty) || 0,
          serialNumbers,
        };
      });

    if (items.length === 0) return toast.error("Add at least one item");
    for (const r of rows) {
      if (r.item && r.hasSerial === "yes" && r.serials.filter(Boolean).length === 0) {
        return toast.error(`Select at least one serial number for ${r.item.itemName}`);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLocationCode: fromLocation,
          toLocationCode: toLocation,
          referenceType: reference?.type || undefined,
          referenceNo: reference?.no || undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(`Transfer ${data.transfer.transferNo} created`);
      setOpen(false);
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create transfer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden /> New transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" aria-hidden /> New stock transfer
          </DialogTitle>
          <DialogDescription>Move stock between locations — serialized items only let you pick units that are actually in stock.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
          {reference && (
            <div className="flex items-center gap-2 rounded-lg border border-info/25 bg-info-soft px-3 py-2 text-sm text-info">
              <Link2 className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                For order <span className="font-mono font-bold">{reference.no}</span>
                {reference.type ? ` (${reference.type})` : ""} — recorded on this transfer so it shows up in movement analysis.
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 rounded-lg border bg-secondary p-4">
            <div className="space-y-1.5">
              <Label>From location</Label>
              <Select
                value={fromLocation}
                onValueChange={(v) => {
                  setFromLocation(v);
                  setRows((rs) => rs.map((r) => ({ ...r, serials: [], availableSerials: [] })));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To location</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.filter((l) => l !== fromLocation).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Items to transfer</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-4 w-4" aria-hidden /> Add item
              </Button>
            </div>

            {rows.map((row) => (
              <div key={row.key} className="relative space-y-3 rounded-lg border bg-card p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                </Button>

                <div className="grid grid-cols-2 gap-3 pr-8">
                  <div className="space-y-1 relative">
                    <Label className="text-xs font-medium text-muted-foreground">Item Name</Label>
                    <Input
                      placeholder="Search item..."
                      value={row.item ? row.item.itemName : row.itemQuery}
                      onChange={(e) => updateRow(row.key, { item: null, itemQuery: e.target.value, serials: [], availableSerials: [] })}
                    />
                    {!row.item && row.itemOptions.length > 0 && (
                      <div className="absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                        {row.itemOptions.map((o) => (
                          <button
                            key={o.itemCode}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              updateRow(row.key, { item: o, itemOptions: [] });
                              if (row.hasSerial === "yes") fetchAvailableSerials(row.key, o.itemCode);
                            }}
                          >
                            <span className="font-mono font-bold">{o.itemCode}</span> — {o.itemName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Item Code</Label>
                    <Input readOnly disabled value={row.item?.itemCode ?? ""} placeholder="Auto-filled" className="bg-secondary font-mono" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Has Serial Number?</Label>
                    <Select
                      value={row.hasSerial}
                      onValueChange={(v: "yes" | "no") => {
                        updateRow(row.key, { hasSerial: v, serials: v === "yes" ? [""] : [] });
                        if (v === "yes" && row.item) fetchAvailableSerials(row.key, row.item.itemCode);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {row.hasSerial === "no" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Quantity</Label>
                      <Input type="number" min={1} value={row.qty} onChange={(e) => updateRow(row.key, { qty: e.target.value })} />
                    </div>
                  )}
                </div>

                {row.hasSerial === "yes" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Serial Numbers {row.loadingSerials && "(loading...)"}
                      </Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => updateRow(row.key, { serials: [...row.serials, ""] })}
                        disabled={!row.item}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden /> Add serial
                      </Button>
                    </div>

                    {row.serials.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Select
                          value={s}
                          onValueChange={(v) => updateRow(row.key, { serials: row.serials.map((sv, si) => (si === i ? v : sv)) })}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={row.item ? "Select in-stock serial..." : "Pick an item first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {row.availableSerials
                              .filter((av) => av.serialNo === s || !allPickedSerials.has(av.serialNo))
                              .map((av) => (
                                <SelectItem key={av.serialNo} value={av.serialNo}>
                                  {av.serialNo}
                                  {(av.warrantyExpiryDate || av.invoiceDate) &&
                                    ` — exp ${(av.warrantyExpiryDate ?? av.invoiceDate)!.slice(0, 10)}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateRow(row.key, { serials: row.serials.filter((_, si) => si !== i) })}
                          disabled={row.serials.length === 1}
                          aria-label="Remove serial"
                        >
                          <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    {row.item && !row.loadingSerials && row.availableSerials.length === 0 && (
                      <p className="text-xs text-warning">No serials currently in stock for this item at {fromLocation}.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Creating..." : "Create transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
