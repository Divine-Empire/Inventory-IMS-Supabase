"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, VisuallyHidden } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  ArrowLeftRight,
  PieChart,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";

export const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, step: "dashboard" },
  { href: "/inventory", label: "Inventory", icon: Boxes, step: "inventory" },
  { href: "/item-master", label: "Item Master", icon: ClipboardList, step: "item-master" },
  { href: "/stock-transfer", label: "Stock Transfer", icon: ArrowLeftRight, step: "stock-transfer" },
  { href: "/abc-eoq-analysis", label: "ABC / EOQ Analysis", icon: PieChart, step: "abc-eoq-analysis" },
  { href: "/reports", label: "Reports", icon: FileBarChart, step: "reports" },
  { href: "/settings", label: "Settings", icon: Settings, step: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const filteredMenuItems = menuItems.filter((item) => {
    if (user?.role === "admin") return true;
    const access = user?.pageAccess?.split(",").map((s) => s.trim()) || [];
    return access.includes(item.step) || access.includes("all");
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full border-r border-gray-200">
      <div className="p-6 border-b border-gray-200 bg-gradient-to-b from-blue-50 to-purple-50">
        <h2 className="text-lg font-semibold text-purple-600">Inventory Management</h2>
        <p className="text-sm text-gray-600">Stock, Sales &amp; Purchase Control</p>
      </div>

      <ScrollArea className="flex-1 px-3 bg-gradient-to-b from-blue-50 to-purple-50">
        <div className="space-y-1 py-4">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-gray-100 ${
                  isActive
                    ? "bg-gradient-to-b from-blue-50 to-purple-100 text-blue-700 border-r-2 border-blue-700"
                    : "text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-gray-200 bg-gradient-to-br from-blue-50/70 via-purple-50/70 to-indigo-50/70">
        <div className="p-3 pb-4">
          <div className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex-1">
              <p className="font-medium text-gray-900">{user?.fullName}</p>
              <p className="text-xs text-gray-600">{user?.role}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full justify-start gap-3 mt-2 text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 transition-all duration-200"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <SidebarContent />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
            <SheetDescription>Inventory Management System Navigation Menu</SheetDescription>
          </VisuallyHidden>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
