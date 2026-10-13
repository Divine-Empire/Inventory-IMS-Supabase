"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type StatusTab = { value: string; label: string; count?: number };

/**
 * Underline tabs with counts, e.g. "Active (15) | History (0)".
 * Controlled: the page decides what to render for the selected value.
 * Keyboard support (arrows, Home/End) and aria roles come from Radix Tabs.
 */
export function StatusTabs({
  tabs,
  value,
  onValueChange,
  label,
}: {
  tabs: StatusTab[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList
        aria-label={label}
        className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0 text-muted-foreground"
      >
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            // The page renders the panel itself, so there is no Radix panel to point at.
            aria-controls={undefined}
            className="-mb-px gap-2 rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-brand-700 data-[state=active]:shadow-none hover:text-foreground"
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded bg-secondary px-1.5 text-xs font-medium tabular-nums text-foreground">{t.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
