"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { AppHeader } from "./app-header";
import { Footer } from "./footer";

const COLLAPSE_KEY = "ims-sidebar-collapsed";

function FullScreenStatus({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" role="status">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        {message}
      </div>
    </div>
  );
}

/**
 * App shell: sidebar + header + main + footer. Kept under the MainLayout name so
 * every existing page keeps working unchanged.
 */
export function MainLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable: default expanded */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  if (isLoading) return <FullScreenStatus message="Loading..." />;
  if (!isAuthenticated) return <FullScreenStatus message="Redirecting to login..." />;

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-150", collapsed ? "md:pl-14" : "md:pl-60")}>
        <AppHeader />
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
