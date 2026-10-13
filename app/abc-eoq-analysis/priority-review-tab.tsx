"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataColumn } from "@/components/data/data-table";
import { FilterSelect, FilterToolbar, type FilterChip } from "@/components/data/filter-toolbar";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import type { ItemClassification } from "./shared";
import { SectionHeader, ABC_TONE, FSN_TONE, CLASS_POLICY_TEXT, inr } from "./shared";

export function PriorityReviewTab({ items }: { items: ItemClassification[] }) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All");

  // The server returns items in review-priority order; keep that rank visible while sorting.
  const rank = useMemo(() => new Map(items.map((it, i) => [it.itemCode, i + 1])), [items]);
  const classes = useMemo(() => Array.from(new Set(items.map((i) => i.combinedClass))).sort(), [items]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (it) =>
        (classFilter === "All" || it.combinedClass === classFilter) &&
        (!q || it.itemCode.toLowerCase().includes(q) || it.itemName.toLowerCase().includes(q))
    );
  }, [items, search, classFilter]);

  const columns = useMemo<DataColumn<ItemClassification>[]>(
    () => [
      {
        id: "item",
        header: "Item",
        sticky: true,
        width: 300,
        wrap: true,
        sortValue: (it) => it.itemCode,
        cell: (it) => (
          <span className="flex flex-col leading-tight">
            <span className="font-mono font-semibold text-brand-700">{it.itemCode}</span>
            <span className="line-clamp-2 text-muted-foreground" title={it.itemName}>
              {it.itemName}
            </span>
          </span>
        ),
      },
      { id: "rank", header: "Priority", align: "right", sortValue: (it) => rank.get(it.itemCode), cell: (it) => <span className="text-muted-foreground">{rank.get(it.itemCode)}</span> },
      { id: "abc", header: "ABC", sortValue: (it) => it.abcClass, cell: (it) => <StatusBadge tone={ABC_TONE[it.abcClass]}>{it.abcClass}</StatusBadge> },
      { id: "fsn", header: "FSN", sortValue: (it) => it.fsnClass, cell: (it) => <StatusBadge tone={FSN_TONE[it.fsnClass]}>{it.fsnClass}</StatusBadge> },
      { id: "class", header: "Class", sortValue: (it) => it.combinedClass, cell: (it) => <span className="font-semibold">{it.combinedClass}</span> },
      { id: "value", header: "Sales Value", align: "right", sortValue: (it) => it.salesValue, cell: (it) => <span className="font-semibold">{inr(it.salesValue)}</span> },
      { id: "months", header: "Active Months", align: "right", sortValue: (it) => it.activeMonths, cell: (it) => `${it.activeMonths}/${it.elapsedMonths}` },
      { id: "avg", header: "Avg Monthly Qty", align: "right", sortValue: (it) => it.avgMonthlyQty, cell: (it) => it.avgMonthlyQty.toFixed(1) },
      { id: "peak", header: "Peak/Avg", align: "right", sortValue: (it) => it.peakToAvg, cell: (it) => (it.peakToAvg !== null ? `${it.peakToAvg.toFixed(2)}x` : "-") },
      {
        id: "policy",
        header: "Recommended Policy",
        wrap: true,
        width: 320,
        cell: (it) => CLASS_POLICY_TEXT[it.combinedClass] ?? "-",
      },
    ],
    [rank]
  );

  const chips: FilterChip[] = [];
  if (classFilter !== "All") chips.push({ key: "class", label: `Class: ${classFilter}`, onRemove: () => setClassFilter("All") });
  if (search.trim()) chips.push({ key: "q", label: `Search: ${search.trim()}`, onRemove: () => setSearch("") });
  const clearAll = () => {
    setSearch("");
    setClassFilter("All");
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Priority review"
        description="A-S and A-N items are shown first: high financial impact with less consistent demand. A-F items follow as the core replenishment population."
      />
      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search item code or name" }}
        filters={
          <FilterSelect
            label="Class"
            value={classFilter}
            onChange={setClassFilter}
            allLabel="All classes"
            options={classes.map((c) => ({ value: c, label: c }))}
          />
        }
        chips={chips}
        onClearAll={clearAll}
      />
      <DataTable
        label="Priority review items"
        columns={columns}
        rows={rows}
        getRowId={(it) => it.itemCode}
        empty={
          items.length === 0
            ? { title: "No items to review yet", description: "Run “Sync invoiced sales history” to classify items." }
            : {
                title: "No items match your filters",
                action: (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear all filters
                  </Button>
                ),
              }
        }
      />
    </section>
  );
}
