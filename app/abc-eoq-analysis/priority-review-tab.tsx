"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ItemClassification } from "./shared";
import { Th, Td, SortTh, SectionHeader, ABC_COLORS, CLASS_POLICY_TEXT, inr } from "./shared";

type SortKey = keyof Pick<ItemClassification, "salesValue" | "activeMonths" | "avgMonthlyQty" | "peakToAvg">;

export function PriorityReviewTab({ items }: { items: ItemClassification[] }) {
  const [sort, setSort] = useState<{ key: SortKey | "priority"; dir: "asc" | "desc" }>({ key: "priority", dir: "asc" });

  const sorted = useMemo(() => {
    const key = sort.key;
    if (key === "priority") return items;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => mul * ((a[key] ?? 0) - (b[key] ?? 0)));
  }, [items, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Priority Review — items that need management attention" />
      <p className="text-xs text-slate-500 -mt-1">
        A-S and A-N items are shown first — high financial impact with less consistent demand. A-F items follow as the core replenishment population.
      </p>
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto max-h-[70vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-900 text-white z-10">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>#</Th>
              <Th>Item</Th>
              <Th>ABC</Th>
              <Th>FSN</Th>
              <Th>Class</Th>
              <SortTh label="Sales Value" active={sort.key === "salesValue"} dir={sort.dir} onClick={() => toggleSort("salesValue")} />
              <SortTh label="Active Months" active={sort.key === "activeMonths"} dir={sort.dir} onClick={() => toggleSort("activeMonths")} />
              <SortTh label="Avg Monthly Qty" active={sort.key === "avgMonthlyQty"} dir={sort.dir} onClick={() => toggleSort("avgMonthlyQty")} />
              <SortTh label="Peak/Avg" active={sort.key === "peakToAvg"} dir={sort.dir} onClick={() => toggleSort("peakToAvg")} />
              <Th>Recommended Policy</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((it, idx) => (
              <tr key={it.itemCode} className={`${ABC_COLORS[it.abcClass]} hover:brightness-95`}>
                <Td className="text-slate-400">{idx + 1}</Td>
                <Td>
                  <span className="font-mono font-bold">{it.itemCode}</span>
                  <span className="text-slate-500"> — {it.itemName}</span>
                </Td>
                <Td><Badge variant="outline">{it.abcClass}</Badge></Td>
                <Td><Badge variant="outline">{it.fsnClass}</Badge></Td>
                <Td className="font-extrabold">{it.combinedClass}</Td>
                <Td className="text-right font-bold">{inr(it.salesValue)}</Td>
                <Td className="text-right">{it.activeMonths}/{it.elapsedMonths}</Td>
                <Td className="text-right">{it.avgMonthlyQty.toFixed(1)}</Td>
                <Td className="text-right">{it.peakToAvg !== null ? `${it.peakToAvg.toFixed(2)}x` : "-"}</Td>
                <Td className="text-xs">{CLASS_POLICY_TEXT[it.combinedClass]}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
