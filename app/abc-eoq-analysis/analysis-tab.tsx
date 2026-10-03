"use client";

import type { SeasonalityMonth, ClassSummary } from "./shared";
import { Th, Td, SectionHeader, INTERPRETATION_STYLES, ABC_COLORS, inr } from "./shared";

export function AnalysisTab({ seasonality, matrix }: { seasonality: SeasonalityMonth[]; matrix: ClassSummary[] }) {
  return (
    <div className="flex flex-col gap-8">
      <SeasonalitySection seasonality={seasonality} />
      <MatrixSection matrix={matrix} />
    </div>
  );
}

function SeasonalitySection({ seasonality }: { seasonality: SeasonalityMonth[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Section 1 — Seasonality" />
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>Month</Th>
              <Th className="text-right">Sales Value</Th>
              <Th className="text-right">Share of FY Sales</Th>
              <Th className="text-right">Seasonal Index</Th>
              <Th>Planning Interpretation</Th>
              <Th className="text-right">Qty Sold</Th>
              <Th className="text-right">Sales Lines</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {seasonality.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">No invoiced sales yet this FY — run the sync above</td></tr>
            ) : (
              seasonality.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <Td className="font-semibold">{m.monthLabel}</Td>
                  <Td className="text-right font-bold">{inr(m.salesValue)}</Td>
                  <Td className="text-right">{m.sharePct.toFixed(1)}%</Td>
                  <Td className="text-right font-mono">{m.seasonalIndex.toFixed(3)}x</Td>
                  <Td>
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${INTERPRETATION_STYLES[m.interpretation]}`}>
                      {m.interpretation}
                    </span>
                  </Td>
                  <Td className="text-right">{m.qtySold.toLocaleString("en-IN")}</Td>
                  <Td className="text-right">{m.salesLines}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixSection({ matrix }: { matrix: ClassSummary[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Section 2 — ABC-FSN Inventory Control Matrix" />
      <div className="border border-slate-300 rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr className="text-left text-[11px] uppercase tracking-wide font-extrabold">
              <Th>Class</Th>
              <Th className="text-right">SKU Count</Th>
              <Th className="text-right">Sales Value</Th>
              <Th className="text-right">Sales Share</Th>
              <Th>Control Policy</Th>
              <Th>Review</Th>
              <Th>Peak Handling</Th>
              <Th>Stocking Rule</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map((c) => (
              <tr key={c.class} className={ABC_COLORS[c.class[0]]}>
                <Td className="font-extrabold">{c.class}</Td>
                <Td className="text-right">{c.skuCount}</Td>
                <Td className="text-right font-bold">{inr(c.salesValue)}</Td>
                <Td className="text-right">{c.salesSharePct.toFixed(1)}%</Td>
                <Td>{c.controlPolicy}</Td>
                <Td>{c.review}</Td>
                <Td>{c.peakHandling}</Td>
                <Td>{c.stockingRule}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
