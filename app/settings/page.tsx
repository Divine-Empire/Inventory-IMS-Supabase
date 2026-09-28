"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { menuItems } from "@/components/layout/sidebar";

type IMSUser = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  pageAccess: string | null;
  locationAccess: string | null;
};

const LOCATIONS = ["CG", "NE", "MANIQUIP", "HO"];

export default function SettingsPage() {
  return (
    <MainLayout>
      <SettingsContent />
    </MainLayout>
  );
}

function SettingsContent() {
  const [users, setUsers] = useState<IMSUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<IMSUser | null>(null);

  const [form, setForm] = useState({
    username: "",
    fullName: "",
    password: "",
    role: "user",
    pageAccess: [] as string[],
    locationAccess: [] as string[],
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ username: "", fullName: "", password: "", role: "user", pageAccess: [], locationAccess: [] });
    setDialogOpen(true);
  };

  const openEdit = (u: IMSUser) => {
    setEditingUser(u);
    setForm({
      username: u.username,
      fullName: u.fullName,
      password: "",
      role: u.role,
      pageAccess: u.pageAccess ? u.pageAccess.split(",").map((s) => s.trim()) : [],
      locationAccess: u.locationAccess ? u.locationAccess.split(",").map((s) => s.trim()) : [],
    });
    setDialogOpen(true);
  };

  const toggleStep = (step: string) => {
    setForm((f) => ({
      ...f,
      pageAccess: f.pageAccess.includes(step) ? f.pageAccess.filter((s) => s !== step) : [...f.pageAccess, step],
    }));
  };

  const toggleLocation = (loc: string) => {
    setForm((f) => ({
      ...f,
      locationAccess: f.locationAccess.includes(loc) ? f.locationAccess.filter((s) => s !== loc) : [...f.locationAccess, loc],
    }));
  };

  const handleSave = async () => {
    if (!form.username || !form.fullName) {
      toast.error("Username and Full Name are required");
      return;
    }

    const payload = {
      username: form.username,
      fullName: form.fullName,
      password: form.password || undefined,
      role: form.role,
      pageAccess: form.pageAccess.join(","),
      locationAccess: form.locationAccess.join(","),
    };

    try {
      const res = editingUser
        ? await fetch("/api/auth/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingUser.id, ...payload }),
          })
        : await fetch("/api/auth/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(editingUser ? "User updated" : "User created");
      setDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to save user");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      const res = await fetch(`/api/auth/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("User deleted");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-8 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />
        <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Settings</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Full Name</Label>
                    <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Password {editingUser && <span className="text-xs text-slate-400">(leave blank to keep)</span>}</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Page Access</Label>
                  <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                    {menuItems.map((item) => (
                      <label key={item.step} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.pageAccess.includes(item.step)}
                          onChange={() => toggleStep(item.step)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Location Access</Label>
                  <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                    {LOCATIONS.map((loc) => (
                      <label key={loc} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.locationAccess.includes(loc)}
                          onChange={() => toggleLocation(loc)}
                        />
                        {loc}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Page Access</TableHead>
                <TableHead>Locations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">Loading...</TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">No users yet</TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono">{u.username}</TableCell>
                    <TableCell>{u.fullName}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                      {u.role === "admin" ? "All" : u.pageAccess || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{u.locationAccess || "All"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-3">
            Fixed location set for this IMS deployment (matches PFMS's warehouseLocation values).
          </p>
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map((loc) => (
              <Badge key={loc} variant="outline">{loc}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <DataSyncCard />
    </div>
  );
}

function DataSyncCard() {
  const [syncing, setSyncing] = useState<"pfms" | "sales" | null>(null);
  const [lastResult, setLastResult] = useState<{ label: string; summary: Record<string, number> } | null>(null);

  const runSync = async (type: "pfms" | "sales") => {
    setSyncing(type);
    try {
      const res = await fetch(`/api/sync/${type === "pfms" ? "pfms" : "sales"}`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLastResult({ label: type === "pfms" ? "PFMS Sync" : "Sales Sync (OTP + LTO)", summary: data.summary });
      toast.success(`${type === "pfms" ? "PFMS" : "Sales"} sync complete`);
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Sync</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Pulls Indent/PO/In-Transit data from PFMS, and per-item sales value from OTP + LTO, into this system's
          Inventory and ABC/EOQ views. Run manually for now — matches items by item code/name, so results improve
          as the Item Master fills in.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={!!syncing} onClick={() => runSync("pfms")} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing === "pfms" ? "animate-spin" : ""}`} />
            {syncing === "pfms" ? "Syncing PFMS..." : "Sync PFMS (Indent/PO/In-Transit)"}
          </Button>
          <Button disabled={!!syncing} onClick={() => runSync("sales")} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing === "sales" ? "animate-spin" : ""}`} />
            {syncing === "sales" ? "Syncing Sales..." : "Sync Sales (OTP + LTO)"}
          </Button>
        </div>

        {lastResult && (
          <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
            <p className="text-xs font-bold text-slate-700 mb-2">{lastResult.label} — last run result</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(lastResult.summary).map(([k, v]) => (
                <div key={k} className="bg-white border border-slate-200 rounded px-2 py-1.5">
                  <div className="text-sm font-extrabold text-slate-900">{v}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
