"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine, Package, LogOut as LogOutIcon } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LOCATIONS = ["CG", "NE", "MANIQUIP", "HO"];

type ItemOption = { itemCode: string; itemName: string };

type RecentSerial = {
  serialNo: string;
  itemCode: string;
  itemName: string;
  locationCode: string | null;
  status: string;
  warrantyExpiryDate: string | null;
  invoiceDate: string | null;
  updatedAt: string;
};

export default function SerialScanPage() {
  return (
    <MainLayout>
      <SerialScanContent />
    </MainLayout>
  );
}

function SerialScanContent() {
  const [recent, setRecent] = useState<RecentSerial[]>([]);

  const loadRecent = () => {
    fetch("/api/serials")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRecent(res.serials);
      });
  };

  useEffect(() => {
    loadRecent();
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-[1000px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
        <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Serial &amp; Warranty Scan</h1>
      </div>

      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in" className="gap-1.5">
            <Package className="w-4 h-4" /> Scan IN
          </TabsTrigger>
          <TabsTrigger value="out" className="gap-1.5">
            <LogOutIcon className="w-4 h-4" /> Scan OUT
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <ScanInForm onDone={loadRecent} />
        </TabsContent>
        <TabsContent value="out">
          <ScanOutForm onDone={loadRecent} />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial No</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warranty / Invoice Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-500">No scans yet</TableCell>
                </TableRow>
              ) : (
                recent.map((s) => (
                  <TableRow key={s.serialNo}>
                    <TableCell className="font-mono">{s.serialNo}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono font-semibold">{s.itemCode}</span> — {s.itemName}
                    </TableCell>
                    <TableCell>{s.locationCode ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "IN_STOCK" ? "default" : "secondary"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.warrantyExpiryDate
                        ? new Date(s.warrantyExpiryDate).toLocaleDateString("en-IN")
                        : s.invoiceDate
                        ? new Date(s.invoiceDate).toLocaleDateString("en-IN")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function useItemSearch() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [selected, setSelected] = useState<ItemOption | null>(null);

  useEffect(() => {
    if (!query || selected) return;
    const handle = setTimeout(() => {
      fetch(`/api/items/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setOptions(res.items);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, selected]);

  return { query, setQuery, options, setOptions, selected, setSelected };
}

function ScanInForm({ onDone }: { onDone: () => void }) {
  const [location, setLocation] = useState("CG");
  const [serialNo, setSerialNo] = useState("");
  const [warrantyType, setWarrantyType] = useState<"warranty" | "invoice">("warranty");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const serialRef = useRef<HTMLInputElement>(null);

  const item = useItemSearch();

  const handleSubmit = async () => {
    if (!item.selected) return toast.error("Select an item first");
    if (!serialNo.trim()) return toast.error("Scan/enter a serial number");
    if (!date) return toast.error(`Enter the ${warrantyType === "warranty" ? "warranty expiry" : "invoice"} date`);

    setSubmitting(true);
    try {
      const res = await fetch("/api/serials/in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCode: item.selected.itemCode,
          locationCode: location,
          serialNo,
          warrantyExpiryDate: warrantyType === "warranty" ? date : null,
          invoiceDate: warrantyType === "invoice" ? date : null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(`Serial "${serialNo}" scanned IN at ${location}`);
      setSerialNo("");
      serialRef.current?.focus();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Scan IN failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ScanLine className="w-4 h-4" /> Scan IN — capture serial + warranty/invoice date
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 relative">
            <Label>Item</Label>
            <Input
              placeholder="Search item code/name..."
              value={item.selected ? `${item.selected.itemCode} — ${item.selected.itemName}` : item.query}
              onChange={(e) => {
                item.setSelected(null);
                item.setQuery(e.target.value);
              }}
            />
            {!item.selected && item.options.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                {item.options.map((o) => (
                  <button
                    key={o.itemCode}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                    onClick={() => {
                      item.setSelected(o);
                      item.setOptions([]);
                    }}
                  >
                    <span className="font-mono font-bold">{o.itemCode}</span> — {o.itemName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Serial Number</Label>
          <Input
            ref={serialRef}
            autoFocus
            placeholder="Scan or type serial number, then press Enter"
            value={serialNo}
            onChange={(e) => setSerialNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={warrantyType} onValueChange={(v: any) => setWarrantyType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warranty">Has Warranty (enter expiry date)</SelectItem>
                <SelectItem value="invoice">No Warranty (enter invoice date)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{warrantyType === "warranty" ? "Warranty Expiry Date" : "Invoice Date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <Button
          disabled={submitting}
          onClick={handleSubmit}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
        >
          {submitting ? "Saving..." : "Scan IN"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ScanOutForm({ onDone }: { onDone: () => void }) {
  const [location, setLocation] = useState("CG");
  const [serialNo, setSerialNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string } | null>(null);
  const serialRef = useRef<HTMLInputElement>(null);

  const submit = async (override: boolean) => {
    if (!serialNo.trim()) return toast.error("Scan/enter a serial number");
    setSubmitting(true);
    try {
      const res = await fetch("/api/serials/out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationCode: location, serialNo, override }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (data.needsConfirmation) {
        setConfirmState({ message: data.message });
        return;
      }

      toast.success(`Serial "${serialNo}" scanned OUT from ${location}`);
      setSerialNo("");
      setConfirmState(null);
      serialRef.current?.focus();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Scan OUT failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ScanLine className="w-4 h-4" /> Scan OUT — validates stock, blocks already-OUT serials
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-1">
          <Label>Location</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Serial Number</Label>
          <Input
            ref={serialRef}
            autoFocus
            placeholder="Scan or type serial number, then press Enter"
            value={serialNo}
            onChange={(e) => setSerialNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(false)}
          />
        </div>

        <Button
          disabled={submitting}
          onClick={() => submit(false)}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
        >
          {submitting ? "Checking..." : "Scan OUT"}
        </Button>
      </CardContent>

      <Dialog open={!!confirmState} onOpenChange={(open) => !open && setConfirmState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Older stock is available</DialogTitle>
            <DialogDescription>{confirmState?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmState(null)}>Cancel</Button>
            <Button
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
              onClick={() => submit(true)}
            >
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
