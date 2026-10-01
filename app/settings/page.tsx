"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
const ALL_STEPS = menuItems.map((m) => m.step);

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
      pageAccess: u.pageAccess ? u.pageAccess.split(",").filter(Boolean) : [],
      locationAccess: u.locationAccess ? u.locationAccess.split(",").filter(Boolean) : [],
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

  const allStepsSelected = ALL_STEPS.every((s) => form.pageAccess.includes(s));
  const allLocationsSelected = LOCATIONS.every((l) => form.locationAccess.includes(l));

  const toggleAllSteps = () => setForm((f) => ({ ...f, pageAccess: allStepsSelected ? [] : [...ALL_STEPS] }));
  const toggleAllLocations = () => setForm((f) => ({ ...f, locationAccess: allLocationsSelected ? [] : [...LOCATIONS] }));

  const handleRoleChange = (role: string) => {
    setForm((f) => ({
      ...f,
      role,
      // Admin implicitly gets every page/location already (see sidebar.tsx
      // filteredMenuItems) — auto-check everything here too so the form
      // reflects that instead of looking empty/incomplete.
      pageAccess: role === "admin" ? [...ALL_STEPS] : f.pageAccess,
      locationAccess: role === "admin" ? [...LOCATIONS] : f.locationAccess,
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
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 max-h-[65vh] overflow-y-auto px-1 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Password {editingUser && <span className="text-xs text-slate-400">(leave blank to keep)</span>}</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={handleRoleChange}>
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Page Access</Label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={allStepsSelected} onChange={toggleAllSteps} disabled={form.role === "admin"} />
                      Select All
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 border rounded-md p-4 bg-slate-50/50">
                    {menuItems.map((item) => (
                      <label key={item.step} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.pageAccess.includes(item.step)}
                          onChange={() => toggleStep(item.step)}
                          disabled={form.role === "admin"}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                  {form.role === "admin" && <p className="text-[11px] text-slate-400">Admins always have access to every page.</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Location Access</Label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 cursor-pointer">
                      <input type="checkbox" checked={allLocationsSelected} onChange={toggleAllLocations} disabled={form.role === "admin"} />
                      Select All
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 border rounded-md p-4 bg-slate-50/50">
                    {LOCATIONS.map((loc) => (
                      <label key={loc} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.locationAccess.includes(loc)}
                          onChange={() => toggleLocation(loc)}
                          disabled={form.role === "admin"}
                        />
                        {loc}
                      </label>
                    ))}
                  </div>
                  {form.role === "admin" && <p className="text-[11px] text-slate-400">Admins always have access to every location.</p>}
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
                    <TableCell className="text-xs text-slate-500">{u.role === "admin" ? "All" : u.locationAccess || "-"}</TableCell>
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
    </div>
  );
}
