import type React from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string }> = {
  success: { badge: "bg-success-soft text-success border-success/25", dot: "bg-success" },
  warning: { badge: "bg-warning-soft text-warning border-warning/25", dot: "bg-warning" },
  danger: { badge: "bg-danger-soft text-danger border-danger/25", dot: "bg-danger" },
  info: { badge: "bg-info-soft text-info border-info/25", dot: "bg-info" },
  neutral: { badge: "bg-neutral-soft text-neutral border-neutral/20", dot: "bg-neutral" },
};

/**
 * One status pattern for the whole app: tinted background, a dot and the status text.
 * The text always carries the meaning, so colour is never the only signal.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium",
        t.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
      {children}
    </span>
  );
}
