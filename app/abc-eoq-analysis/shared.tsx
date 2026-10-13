import type { StatusTone } from "@/components/data/status-badge";

export type SeasonalityMonth = {
  month: string;
  monthLabel: string;
  salesValue: number;
  sharePct: number;
  seasonalIndex: number;
  qtySold: number;
  salesLines: number;
  interpretation: string;
};

export type ItemClassification = {
  itemCode: string;
  itemName: string;
  salesValue: number;
  qtySold: number;
  activeMonths: number;
  elapsedMonths: number;
  avgMonthlyQty: number;
  peakMonthlyQty: number;
  peakToAvg: number | null;
  abcClass: "A" | "B" | "C";
  fsnClass: "F" | "S" | "N";
  combinedClass: string;
  monthlyValue: Record<string, number>;
  monthlyQty: Record<string, number>;
};

export type ClassSummary = {
  class: string;
  skuCount: number;
  salesValue: number;
  salesSharePct: number;
  controlPolicy: string;
  review: string;
  peakHandling: string;
  stockingRule: string;
};

export type AnalysisData = {
  financialYear: string;
  elapsedMonths: string[];
  totalFyValue: number;
  unattributedValue: number;
  seasonality: SeasonalityMonth[];
  matrix: ClassSummary[];
  priorityReview: ItemClassification[];
};

export const INTERPRETATION_TONE: Record<string, StatusTone> = {
  "Lean / clean excess": "info",
  "Normal / recovery": "neutral",
  "Regular-high": "warning",
  "Peak / protect availability": "danger",
};

export const ABC_TONE: Record<string, StatusTone> = { A: "success", B: "info", C: "neutral" };
export const FSN_TONE: Record<string, StatusTone> = { F: "success", S: "warning", N: "neutral" };

export const CLASS_POLICY_TEXT: Record<string, string> = {
  AF: "Core stock / weekly review / protect peak availability",
  AS: "Controlled stock / weekly review / pre-build before peak",
  AN: "Order-backed or very low buffer; senior approval before buying",
  BF: "Stock with controlled buffer / fortnightly review",
  BS: "Low/medium buffer / fortnightly review",
  BN: "Avoid routine stock / order-backed / monthly review",
  CF: "Low buffer / monthly review",
  CS: "Buy selectively / monthly review",
  CN: "Buy-to-order / stop routine stock / exception review",
};

export const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthHeaderLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
