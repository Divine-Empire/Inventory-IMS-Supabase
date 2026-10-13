"use client";

import { useMemo } from "react";
import { DataTable, type DataColumn } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import type { SeasonalityMonth, ClassSummary } from "./shared";
import { SectionHeader, INTERPRETATION_TONE, ABC_TONE, inr } from "./shared";

export function AnalysisTab({ seasonality, matrix }: { seasonality: SeasonalityMonth[]; matrix: ClassSummary[] }) {
  return (
    <div className="flex flex-col gap-8">
      <SeasonalitySection seasonality={seasonality} />
      <MatrixSection matrix={matrix} />
    </div>
  );
}

function SeasonalitySection({ seasonality }: { seasonality: SeasonalityMonth[] }) {
  const columns = useMemo<DataColumn<SeasonalityMonth>[]>(
    () => [
      { id: "month", header: "Month", cell: (m) => <span className="font-medium">{m.monthLabel}</span> },
      { id: "value", header: "Sales Value", align: "right", sortValue: (m) => m.salesValue, cell: (m) => <span className="font-semibold">{inr(m.salesValue)}</span> },
      { id: "share", header: "Share of FY Sales", align: "right", sortValue: (m) => m.sharePct, cell: (m) => `${m.sharePct.toFixed(1)}%` },
      {
        id: "index",
        header: "Seasonal Index",
        align: "right",
        sortValue: (m) => m.seasonalIndex,
        cell: (m) => <span className="font-mono">{m.seasonalIndex.toFixed(3)}x</span>,
      },
      {
        id: "interpretation",
        header: "Planning Interpretation",
        cell: (m) => <StatusBadge tone={INTERPRETATION_TONE[m.interpretation] ?? "neutral"}>{m.interpretation}</StatusBadge>,
      },
      { id: "qty", header: "Qty Sold", align: "right", sortValue: (m) => m.qtySold, cell: (m) => m.qtySold.toLocaleString("en-IN") },
      { id: "lines", header: "Sales Lines", align: "right", sortValue: (m) => m.salesLines, cell: (m) => m.salesLines },
    ],
    []
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Seasonality" description="How invoiced sales are spread across the months of this financial year." />
      <DataTable
        label="Seasonality by month"
        columns={columns}
        rows={seasonality}
        getRowId={(m) => m.month}
        paginate={false}
        maxHeightClassName=""
        empty={{
          title: "No invoiced sales yet this FY",
          description: "Run “Sync invoiced sales history” to load this financial year's sales.",
        }}
      />
    </section>
  );
}

function MatrixSection({ matrix }: { matrix: ClassSummary[] }) {
  const columns = useMemo<DataColumn<ClassSummary>[]>(
    () => [
      {
        id: "class",
        header: "Class",
        width: 90,
        cell: (c) => (
          <StatusBadge tone={ABC_TONE[c.class[0]] ?? "neutral"} className="font-semibold">
            {c.class}
          </StatusBadge>
        ),
      },
      { id: "skus", header: "SKU Count", align: "right", sortValue: (c) => c.skuCount, cell: (c) => c.skuCount },
      { id: "value", header: "Sales Value", align: "right", sortValue: (c) => c.salesValue, cell: (c) => <span className="font-semibold">{inr(c.salesValue)}</span> },
      { id: "share", header: "Sales Share", align: "right", sortValue: (c) => c.salesSharePct, cell: (c) => `${c.salesSharePct.toFixed(1)}%` },
      { id: "policy", header: "Control Policy", wrap: true, width: 200, cell: (c) => c.controlPolicy },
      { id: "review", header: "Review", wrap: true, width: 110, cell: (c) => c.review },
      { id: "peak", header: "Peak Handling", wrap: true, width: 200, cell: (c) => c.peakHandling },
      { id: "rule", header: "Stocking Rule", wrap: true, width: 220, cell: (c) => c.stockingRule },
    ],
    []
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="ABC-FSN inventory control matrix" description="Recommended control policy for each combination of value (ABC) and movement (FSN) class." />
      <DataTable
        label="ABC-FSN inventory control matrix"
        columns={columns}
        rows={matrix}
        getRowId={(c) => c.class}
        paginate={false}
        maxHeightClassName=""
        empty={{ title: "No classification data yet" }}
      />
    </section>
  );
}
