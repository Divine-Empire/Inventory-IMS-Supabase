"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, VisuallyHidden } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandMark, SidebarNav, menuItems } from "./sidebar";

function initials(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = menuItems.find((m) => m.href === pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-brand-200 bg-card px-4 shadow-[inset_0_2px_0_0_hsl(var(--brand-lime))] md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu">
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
          <VisuallyHidden>
            <SheetTitle>Navigation menu</SheetTitle>
            <SheetDescription>Divine Empire navigation</SheetDescription>
          </VisuallyHidden>
          <div className="flex h-14 items-center gap-3 border-b px-4">
            <BrandMark />
            <p className="text-sm font-semibold">Divine Empire</p>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <p className="truncate text-sm font-medium text-muted-foreground md:hidden">{current?.label}</p>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials(user?.fullName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium">{user?.fullName}</span>
                <span className="block text-xs capitalize text-muted-foreground">{user?.role}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.fullName}</p>
              <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="text-danger focus:text-danger">
              <LogOut className="mr-2 h-4 w-4" aria-hidden /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
