"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";

type ImportResult = {
  success: boolean;
  summary?: {
    rowsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    locationSettingsUpserted: number;
    openingEntriesAdded: number;
    openingEntriesSkipped: number;
    errorCount: number;
  };
  errors?: string[];
  error?: string;
};

export default function ItemMasterPage() {
  return (
    <MainLayout>
      <ItemMasterContent />
    </MainLayout>
  );
}

function ItemMasterContent() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/items/import", { method: "POST", body: formData });
      const data: ImportResult = await res.json();
      setResult(data);

      if (data.success) {
        toast.success(`Import done — ${data.summary?.itemsCreated ?? 0} created, ${data.summary?.itemsUpdated ?? 0} updated`);
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
        <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">Item Master — CSV Import</h1>
      </div>

      <div className="bg-white border border-slate-300 rounded-lg p-5 flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Template me har item ke liye ek row per location honi chahiye (CG / NE / MANIQUIP / HO). Same ITEM CODE
          dobara import karne par existing item update ho jayega — opening LIVE STOCK sirf ek baar add hota hai.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href="/api/items/template"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800"
          >
            <Download className="w-4 h-4" />
            Download Template
          </a>

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm font-semibold text-white"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Importing..." : "Import CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
      </div>

      {result?.summary && (
        <div className="bg-white border border-slate-300 rounded-lg p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wide">Import Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <SummaryStat label="Rows Processed" value={result.summary.rowsProcessed} />
            <SummaryStat label="Items Created" value={result.summary.itemsCreated} />
            <SummaryStat label="Items Updated" value={result.summary.itemsUpdated} />
            <SummaryStat label="Location Settings" value={result.summary.locationSettingsUpserted} />
            <SummaryStat label="Opening Entries Added" value={result.summary.openingEntriesAdded} />
            <SummaryStat label="Opening Entries Skipped" value={result.summary.openingEntriesSkipped} />
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-red-700 mb-2">{result.errors.length} row(s) had errors:</p>
              <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3 max-h-48 overflow-auto list-disc list-inside">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <div className="text-lg font-extrabold text-slate-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
    </div>
  );
}
