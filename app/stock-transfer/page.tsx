"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, Truck, PackageCheck, XCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const LOCATIONS = ["CG", "NE", "MANIQUIP", "HO"];

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

function NewTransferDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fromLocation, setFromLocation] = useState("CG");
  const [toLocation, setToLocation] = useState("NE");
  const [rows, setRows] = useState<{ itemCode: string; qty: string; serials: string }[]>([
    { itemCode: "", qty: "1", serials: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = () => setRows((r) => [...r, { itemCode: "", qty: "1", serials: "" }]);
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const handleSubmit = async () => {
    const items = rows
      .filter((r) => r.itemCode.trim())
      .map((r) => {
        const serialNumbers = r.serials
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          itemCode: r.itemCode.trim(),
          qty: serialNumbers.length > 0 ? serialNumbers.length : Number(r.qty) || 0,
          serialNumbers,
        };
      });

    if (items.length === 0) return toast.error("Add at least one item");

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
      setRows([{ itemCode: "", qty: "1", serials: "" }]);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create transfer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
          <Plus className="w-4 h-4 mr-1" /> New Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Stock Transfer</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>From Location</Label>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>To Location</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
              </Button>
            </div>

            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-[10px]">Item Code</Label>
                  <Input value={row.itemCode} onChange={(e) => updateRow(idx, { itemCode: e.target.value })} placeholder="ITEM-CODE" />
                </div>
                <div>
                  <Label className="text-[10px]">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={row.qty}
                    disabled={!!row.serials.trim()}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Serial Numbers (comma separated, optional)</Label>
                  <Input value={row.serials} onChange={(e) => updateRow(idx, { serials: e.target.value })} placeholder="SN-001, SN-002" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeRow(idx)} disabled={rows.length === 1}>
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-slate-400">
              Leave Serial Numbers blank for non-serialized items — Qty is used directly. If serials are listed, Qty is derived from the count and each serial is validated as in-stock at the source location when shipped.
            </p>
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
