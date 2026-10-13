"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/data/data-table";
import { FilterSelect, FilterToolbar, type FilterChip } from "@/components/data/filter-toolbar";
import { StatusBadge } from "@/components/data/status-badge";
import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
const STEP_LABEL = Object.fromEntries(menuItems.map((m) => [m.step, m.label]));

const accessList = (value: string | null, labels?: Record<string, string>) =>
  value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => labels?.[s] ?? s)
        .join(", ")
    : "";

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
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<IMSUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IMSUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

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
    setError(null);
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (data.success) setUsers(data.users);
      else setError(data.error || "Failed to load users");
    } catch {
      setError("Failed to load users");
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

  // Called only after the user confirms in the dialog.
  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/auth/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("User deleted");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === "All" || u.role === roleFilter) &&
        (!q || u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q))
    );
  }, [users, search, roleFilter]);

  const columns = useMemo<DataColumn<IMSUser>[]>(
    () => [
      {
        id: "username",
        header: "Username",
        sticky: "lg",
        width: 180,
        sortValue: (u) => u.username,
        cell: (u) => <span className="font-mono font-semibold text-brand-700">{u.username}</span>,
      },
      { id: "fullName", header: "Full Name", sortValue: (u) => u.fullName, cell: (u) => <span className="font-medium">{u.fullName}</span> },
      {
        id: "role",
        header: "Role",
        sortValue: (u) => u.role,
        cell: (u) => <StatusBadge tone={u.role === "admin" ? "info" : "neutral"}>{u.role === "admin" ? "Admin" : "User"}</StatusBadge>,
      },
      {
        id: "pages",
        header: "Page Access",
        wrap: true,
        width: 280,
        cell: (u) => {
          const text = u.role === "admin" ? "All pages" : accessList(u.pageAccess, STEP_LABEL) || "-";
          return (
            <span className="line-clamp-2 text-muted-foreground" title={text}>
              {text}
            </span>
          );
        },
      },
      {
        id: "locations",
        header: "Locations",
        wrap: true,
        width: 200,
        cell: (u) => (
          <span className="text-muted-foreground">
            {u.role === "admin" ? "All locations" : accessList(u.locationAccess) || "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        stickyRight: true,
        cell: (u) => (
          <span className="inline-flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => openEdit(u)} aria-label={`Edit ${u.username}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-danger hover:bg-danger-soft hover:text-danger"
              title="Delete user"
              aria-label={`Delete ${u.username}`}
              onClick={() => setDeleteTarget(u)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </span>
        ),
      },
    ],
    []
  );

  const chips: FilterChip[] = [];
  if (roleFilter !== "All") chips.push({ key: "role", label: `Role: ${roleFilter === "admin" ? "Admin" : "User"}`, onRemove: () => setRoleFilter("All") });
  if (search.trim()) chips.push({ key: "search", label: `Search: ${search.trim()}`, onRemove: () => setSearch("") });
  const clearAll = () => {
    setSearch("");
    setRoleFilter("All");
  };

  const isAdminForm = form.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Settings"
        description="Manage who can sign in to IMS and which pages and locations they can use."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Add user
          </Button>
        }
      />

      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search username or name" }}
        filters={
          <FilterSelect
            label="Role"
            value={roleFilter}
            onChange={setRoleFilter}
            allLabel="All roles"
            options={[
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
            ]}
          />
        }
        chips={chips}
        onClearAll={clearAll}
      />

      <DataTable
        label="Users"
        columns={columns}
        rows={filteredUsers}
        getRowId={(u) => u.id}
        loading={loading}
        error={error}
        onRetry={fetchUsers}
        maxHeightClassName="max-h-[calc(100dvh-20rem)] min-h-[240px]"
        empty={
          users.length === 0
            ? {
                title: "No users yet",
                description: "Add a user to give someone access to IMS.",
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" aria-hidden /> Add user
                  </Button>
                ),
              }
            : {
                title: "No users match your filters",
                description: "Try a different name or clear the filters.",
                action: (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear all filters
                  </Button>
                ),
              }
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {editingUser ? `Update access for ${editingUser.username}.` : "Create a login and choose what they can access."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto px-1 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-username">Username</Label>
                <Input
                  id="su-username"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-fullname">Full name</Label>
                <Input id="su-fullname" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-password">
                  Password {editingUser && <span className="text-xs font-normal text-muted-foreground">(leave blank to keep)</span>}
                </Label>
                <Input
                  id="su-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-role">Role</Label>
                <Select value={form.role} onValueChange={handleRoleChange}>
                  <SelectTrigger id="su-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-2">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Page access</legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={allStepsSelected} onCheckedChange={toggleAllSteps} disabled={isAdminForm} />
                  Select all
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2.5 rounded-md border bg-secondary p-4 sm:grid-cols-2">
                {menuItems.map((item) => (
                  <label key={item.step} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.pageAccess.includes(item.step)}
                      onCheckedChange={() => toggleStep(item.step)}
                      disabled={isAdminForm}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              {isAdminForm && <p className="text-xs text-muted-foreground">Admins always have access to every page.</p>}
            </fieldset>

            <fieldset className="space-y-2">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Location access</legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={allLocationsSelected} onCheckedChange={toggleAllLocations} disabled={isAdminForm} />
                  Select all
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2.5 rounded-md border bg-secondary p-4 sm:grid-cols-2">
                {LOCATIONS.map((loc) => (
                  <label key={loc} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.locationAccess.includes(loc)}
                      onCheckedChange={() => toggleLocation(loc)}
                      disabled={isAdminForm}
                    />
                    {loc}
                  </label>
                ))}
              </div>
              {isAdminForm && <p className="text-xs text-muted-foreground">Admins always have access to every location.</p>}
            </fieldset>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.username}?` : ""}
        description="This user will no longer be able to sign in. This can't be undone."
        confirmLabel="Delete user"
        destructive
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </div>
  );
}
