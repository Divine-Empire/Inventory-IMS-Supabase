"use client";

import type React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FilterChip = { key: string; label: string; onRemove: () => void };

type FilterToolbarProps = {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  /** FilterSelect controls. */
  filters?: React.ReactNode;
  /** Right side: ColumnSelector, Refresh, etc. */
  trailing?: React.ReactNode;
  chips?: FilterChip[];
  onClearAll?: () => void;
};

/**
 * Standard filter pattern: [Search] [Filter…] ........ [Columns] [Refresh]
 * with removable chips + "Clear all" underneath when filters are active.
 */
export function FilterToolbar({ search, filters, trailing, chips = [], onClearAll }: FilterToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={search.placeholder}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {filters}
        {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-7 items-center gap-1 rounded border border-brand-200 bg-brand-50 pl-2 pr-1 text-xs font-medium text-brand-800"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove filter ${chip.label}`}
                className="flex h-5 w-5 items-center justify-center rounded-sm text-brand-600 hover:bg-brand-100 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          {onClearAll && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allValue = "All",
  allLabel,
  className,
}: {
  /** Accessible name, e.g. "Location". */
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allValue?: string;
  allLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(className ?? "w-[160px]", value !== allValue && "border-brand-300 bg-brand-50 font-medium text-brand-800")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
