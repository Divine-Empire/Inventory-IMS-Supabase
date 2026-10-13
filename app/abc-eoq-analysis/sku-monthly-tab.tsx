"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataColumn } from "@/components/data/data-table";
import { FilterToolbar, type FilterChip } from "@/components/data/filter-toolbar";
import type { ItemClassification } from "./shared";
import { SectionHeader, inr, monthHeaderLabel } from "./shared";

type Metric = "value" | "qty";

const COPY: Record<Metric, { title: string; description: string; total: string; label: string }> = {
  value: {
    title: "Monthly sales value per SKU",
    description: "Invoiced sales value (₹) for each item, split by month, for this financial year.",
    total: "Total",
    label: "Monthly sales value per SKU",
  },
  qty: {
    title: "Monthly sales qty per SKU",
    description: "Units sold for each item, split by month, for this financial year.",
    total: "Total Qty",
    label: "Monthly sales quantity per SKU",
  },
};

/** One table for both the value and quantity views: they differ only by metric and formatting. */
export function SkuMonthlyTab({
  metric,
  items,
  elapsedMonths,
}: {
  metric: Metric;
  items: ItemClassification[];
  elapsedMonths: string[];
}) {
  const [search, setSearch] = useState("");
  const copy = COPY[metric];

  const monthly = (it: ItemClassification, m: string) => (metric === "value" ? it.monthlyValue[m] : it.monthlyQty[m]) || 0;
  const total = (it: ItemClassification) => (metric === "value" ? it.salesValue : it.qtySold);
  const fmt = (n: number) => (metric === "value" ? inr(n) : n.toLocaleString("en-IN"));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((it) => it.itemCode.toLowerCase().includes(q) || it.itemName.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const columns = useMemo<DataColumn<ItemClassification>[]>(
    () => [
      {
        id: "sku",
        header: "SKU",
        sticky: true,
        width: 120,
        sortValue: (it) => it.itemCode,
        cell: (it) => <span className="font-mono font-semibold text-brand-700">{it.itemCode}</span>,
      },
      {
        id: "name",
        header: "Item Name",
        sticky: "lg",
        width: 260,
        wrap: true,
        sortValue: (it) => it.itemName,
        cell: (it) => (
          <span className="line-clamp-2 text-muted-foreground" title={it.itemName}>
            {it.itemName}
          </span>
        ),
      },
      ...elapsedMonths.map<DataColumn<ItemClassification>>((m) => ({
        id: m,
        header: monthHeaderLabel(m),
        align: "right",
        sortValue: (it) => monthly(it, m),
        cell: (it) => {
          const v = monthly(it, m);
          return v > 0 ? fmt(v) : <span className="text-muted-foreground/60">—</span>;
        },
      })),
      {
        id: "total",
        header: copy.total,
        align: "right",
        stickyRight: true,
        sortValue: total,
        cell: (it) => <span className="font-semibold">{fmt(total(it))}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elapsedMonths, metric]
  );

  const chips: FilterChip[] = search.trim() ? [{ key: "q", label: `Search: ${search.trim()}`, onRemove: () => setSearch("") }] : [];

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={copy.title} description={copy.description} />
      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Search item code or name" }}
        chips={chips}
        onClearAll={() => setSearch("")}
      />
      <DataTable
        label={copy.label}
        columns={columns}
        rows={rows}
        getRowId={(it) => it.itemCode}
        defaultSort={{ id: "total", dir: "desc" }}
        empty={
          items.length === 0
            ? { title: "No invoiced sales yet this FY", description: "Run “Sync invoiced sales history” to load this financial year's sales." }
            : { title: "No items match your search" }
        }
      />
    </section>
  );
}
