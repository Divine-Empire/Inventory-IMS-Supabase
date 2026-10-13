import type React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type StatTone = "brand" | "lime" | "danger" | "warning";

// Icon chip colours. Lime is a surface tint only; its icon uses the dark success shade.
const TONES: Record<StatTone, { chip: string; bar: string }> = {
  brand: { chip: "bg-brand-100 text-brand-700", bar: "bg-primary" },
  lime: { chip: "bg-success-soft text-success", bar: "bg-brand-lime" },
  danger: { chip: "bg-danger-soft text-danger", bar: "bg-danger" },
  warning: { chip: "bg-warning-soft text-warning", bar: "bg-warning" },
};

export function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  loading = false,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: React.ReactNode;
  tone: StatTone;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <span className={cn("ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md", t.chip)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-20" />
        ) : (
          <p className="text-2xl font-semibold leading-8 tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}
