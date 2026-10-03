import { ArrowUpDown } from "lucide-react";

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

export const INTERPRETATION_STYLES: Record<string, string> = {
  "Lean / clean excess": "bg-sky-100 text-sky-800 border-sky-300",
  "Normal / recovery": "bg-slate-100 text-slate-700 border-slate-300",
  "Regular-high": "bg-amber-100 text-amber-800 border-amber-300",
  "Peak / protect availability": "bg-rose-100 text-rose-800 border-rose-300",
};

export const ABC_COLORS: Record<string, string> = { A: "bg-emerald-50", B: "bg-amber-50", C: "bg-slate-50" };

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

export function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{title}</h2>;
}

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 border-r border-white/10 whitespace-nowrap ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 border-r border-slate-100 ${className}`}>{children}</td>;
}

export function SortTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th
      className="px-3 py-2.5 border-r border-white/10 whitespace-nowrap text-right cursor-pointer select-none hover:bg-white/10"
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </span>
    </th>
  );
}
