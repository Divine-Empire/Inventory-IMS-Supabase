"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, Truck, PackageCheck, XCircle, Boxes } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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
  fromLocation: { locationCode: string };
  toLocation: { locationCode: string };
  items: TransferItem[];
};

const STATUS_STYLES: Record<Transfer["status"], string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  in_transit: "bg-blue-100 text-blue-800 border-blue-300",
  received: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-slate-200 text-slate-600 border-slate-300",
};

export default function StockTransferPage() {
  return (
    <MainLayout>
      <StockTransferContent />
    </MainLayout>
  );
}

function StockTransferContent() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock-transfer");
      const data = await res.json();
      if (data.success) setTransfers(data.transfers);
    } catch {
      toast.error("Failed to load transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  const active = transfers.filter((t) => t.status === "pending" || t.status === "in_transit");
  const history = transfers.filter((t) => t.status === "received" || t.status === "cancelled");

  const runAction = async (action: "ship" | "receive" | "cancel", id: string) => {
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

  return (
    <div className="flex flex-col gap-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
          <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Stock Transfer</h1>
        </div>
        <NewTransferDialog onCreated={fetchTransfers} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <TransferTable transfers={active} loading={loading} onAction={runAction} />
        </TabsContent>
        <TabsContent value="history">
          <TransferTable transfers={history} loading={loading} onAction={runAction} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransferTable({
  transfers,
  loading,
  onAction,
}: {
  transfers: Transfer[];
  loading: boolean;
  onAction: (action: "ship" | "receive" | "cancel", id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transfer No</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested / Approved / Received By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">Loading...</TableCell>
              </TableRow>
            ) : transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">No transfers</TableCell>
              </TableRow>
            ) : (
              transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-bold">{t.transferNo}</TableCell>
                  <TableCell className="text-xs font-semibold flex items-center gap-1">
                    {t.fromLocation.locationCode} <ArrowRight className="w-3 h-3" /> {t.toLocation.locationCode}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.items.map((i) => `${i.itemCode} x${i.qty}`).join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[t.status]}>
                      {t.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-slate-500">
                    {t.requestedBy || "-"} / {t.approvedBy || "-"} / {t.receivedBy || "-"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {t.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => onAction("ship", t.id)} className="bg-blue-600 hover:bg-blue-700 text-white">
                          <Truck className="w-3.5 h-3.5 mr-1" /> Ship
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAction("cancel", t.id)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                      </>
                    )}
                    {t.status === "in_transit" && (
                      <Button size="sm" onClick={() => onAction("receive", t.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <PackageCheck className="w-3.5 h-3.5 mr-1" /> Receive
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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

function NewTransferDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fromLocation, setFromLocation] = useState("CG");
  const [toLocation, setToLocation] = useState("NE");
  const [rows, setRows] = useState<FormRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (key: number, patch: Partial<FormRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (key: number) => setRows((r) => (r.length === 1 ? r : r.filter((row) => row.key !== key)));

  const reset = () => {
    setRows([emptyRow()]);
    setFromLocation("CG");
    setToLocation("NE");
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
        body: JSON.stringify({ fromLocationCode: fromLocation, toLocationCode: toLocation, items }),
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
        <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
          <Plus className="w-4 h-4 mr-1" /> New Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-violet-600" /> New Stock Transfer
          </DialogTitle>
          <DialogDescription>Move stock between locations — serialized items only let you pick units that are actually in stock.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">From Location</Label>
              <Select
                value={fromLocation}
                onValueChange={(v) => {
                  setFromLocation(v);
                  setRows((rs) => rs.map((r) => ({ ...r, serials: [], availableSerials: [] })));
                }}
              >
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">To Location</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.filter((l) => l !== fromLocation).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Items to Transfer</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
              </Button>
            </div>

            {rows.map((row) => (
              <div key={row.key} className="border border-slate-200 rounded-lg p-4 space-y-3 relative bg-white shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>

                <div className="grid grid-cols-2 gap-3 pr-8">
                  <div className="space-y-1 relative">
                    <Label className="text-[11px] font-semibold text-slate-500">Item Name</Label>
                    <Input
                      placeholder="Search item..."
                      value={row.item ? row.item.itemName : row.itemQuery}
                      onChange={(e) => updateRow(row.key, { item: null, itemQuery: e.target.value, serials: [], availableSerials: [] })}
                    />
                    {!row.item && row.itemOptions.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-44 overflow-auto">
                        {row.itemOptions.map((o) => (
                          <button
                            key={o.itemCode}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
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
                    <Label className="text-[11px] font-semibold text-slate-500">Item Code</Label>
                    <Input readOnly disabled value={row.item?.itemCode ?? ""} placeholder="Auto-filled" className="bg-slate-50 font-mono" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-500">Has Serial Number?</Label>
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
                      <Label className="text-[11px] font-semibold text-slate-500">Quantity</Label>
                      <Input type="number" min={1} value={row.qty} onChange={(e) => updateRow(row.key, { qty: e.target.value })} />
                    </div>
                  )}
                </div>

                {row.hasSerial === "yes" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-slate-500">
                        Serial Numbers {row.loadingSerials && "(loading...)"}
                      </Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        onClick={() => updateRow(row.key, { serials: [...row.serials, ""] })}
                        disabled={!row.item}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Serial
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
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    {row.item && !row.loadingSerials && row.availableSerials.length === 0 && (
                      <p className="text-[11px] text-amber-600">No serials currently in stock for this item at {fromLocation}.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
            {submitting ? "Creating..." : "Create Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
