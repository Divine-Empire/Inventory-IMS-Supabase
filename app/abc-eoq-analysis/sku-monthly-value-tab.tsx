"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { ItemClassification } from "./shared";
import { SectionHeader, inr, monthHeaderLabel } from "./shared";

export function SkuMonthlyValueTab({ items, elapsedMonths }: { items: ItemClassification[]; elapsedMonths: string[] }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(
    () => [...items].sort((a, b) => (sortDir === "desc" ? b.salesValue - a.salesValue : a.salesValue - b.salesValue)),
    [items, sortDir]
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Monthly Sales Value per SKU" />
      <p className="text-xs text-slate-500 -mt-1">Invoiced sales value (₹) for each item, split by month — this financial year.</p>
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto max-h-[70vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-900 text-white">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <th className="sticky left-0 z-30 bg-slate-900 px-3 py-2.5 border-r border-white/10 whitespace-nowrap min-w-[110px]">SKU</th>
              <th className="sticky left-[110px] z-30 bg-slate-900 px-3 py-2.5 border-r border-white/10 whitespace-nowrap min-w-[220px]">Item Name</th>
              {elapsedMonths.map((m) => (
                <th key={m} className="px-3 py-2.5 border-r border-white/10 whitespace-nowrap text-right">
                  {monthHeaderLabel(m)}
                </th>
              ))}
              <th
                className="px-3 py-2.5 border-r border-white/10 whitespace-nowrap text-right cursor-pointer select-none hover:bg-white/10"
                onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              >
                <span className="inline-flex items-center gap-1">
                  Total <ArrowUpDown className="w-3 h-3 opacity-70" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr><td colSpan={elapsedMonths.length + 3} className="text-center py-8 text-slate-500">No invoiced sales yet this FY</td></tr>
            ) : (
              sorted.map((it) => (
                <tr key={it.itemCode} className="hover:bg-slate-50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-100 font-mono font-bold whitespace-nowrap">{it.itemCode}</td>
                  <td className="sticky left-[110px] z-10 bg-white px-3 py-2 border-r border-slate-100 text-slate-600">{it.itemName}</td>
                  {elapsedMonths.map((m) => {
                    const v = it.monthlyValue[m] || 0;
                    return (
                      <td key={m} className="px-3 py-2 border-r border-slate-100 text-right">
                        {v > 0 ? inr(v) : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 border-r border-slate-100 text-right font-bold">{inr(it.salesValue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
