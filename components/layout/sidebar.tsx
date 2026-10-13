"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  PieChart,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

// `step` keys are stored in ims_User.pageAccess: never rename them.
export const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, step: "dashboard", group: "Overview" },
  { href: "/inventory", label: "Inventory", icon: Boxes, step: "inventory", group: "Operations" },
  { href: "/stock-transfer", label: "Stock Transfer", icon: ArrowLeftRight, step: "stock-transfer", group: "Operations" },
  { href: "/abc-eoq-analysis", label: "ABC / EOQ Analysis", icon: PieChart, step: "abc-eoq-analysis", group: "Insights" },
  { href: "/glossary", label: "Glossary", icon: BookOpen, step: "glossary", group: "Help" },
  { href: "/settings", label: "Settings", icon: Settings, step: "settings", group: "Admin" },
];

export function useVisibleMenuItems() {
  const { user } = useAuth();
  return menuItems.filter((item) => {
    if (user?.role === "admin") return true;
    const access = user?.pageAccess?.split(",").map((s) => s.trim()) || [];
    return access.includes(item.step) || access.includes("all");
  });
}

/** Divine Empire logo (public/divine-logo.svg, transparent background). */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/divine-logo.svg" alt="Divine Empire" className={cn("h-8 w-auto shrink-0", className)} />
  );
}

type NavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

/** Navigation body shared by the desktop rail and the mobile sheet. */
export function SidebarNav({ collapsed = false, onNavigate }: NavProps) {
  const pathname = usePathname();
  const items = useVisibleMenuItems();

  // Keep the first-seen order of groups so the menu reads top to bottom.
  const groups: { name: string; items: typeof items }[] = [];
  for (const item of items) {
    const g = groups.find((x) => x.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Main" className="flex flex-col gap-4 px-2 py-3">
        {groups.map((group) => (
          <div key={group.name} className="flex flex-col gap-0.5">
            {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.name}</p>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-accent font-medium text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-brand-lime"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} aria-hidden />
                  <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.href}>{link}</div>
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/** Desktop sidebar (md and up). The mobile drawer lives in AppHeader. */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-150 md:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center gap-3 border-b", collapsed ? "justify-center px-0" : "px-4")}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Divine Empire</p>
            <p className="truncate text-xs text-muted-foreground">Inventory Management</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <SidebarNav collapsed={collapsed} />
      </ScrollArea>

      <div className="border-t p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
