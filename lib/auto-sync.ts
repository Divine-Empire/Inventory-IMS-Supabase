import { getSupabaseAdmin } from "@/lib/supabase";
import { syncPfms } from "@/lib/sync-pfms";
import { syncOtpPendingSales } from "@/lib/sync-otp-pending-sales";
import { syncSales } from "@/lib/sync-sales";
import { syncReservations } from "@/lib/sync-reservations";
import { recalculateMaxLevels } from "@/lib/max-level-calc";

// Syncs that run by themselves, without anyone pressing a button — but only
// when the data is actually stale, so idle time costs nothing.
//
//  - "page" jobs: triggered when someone opens the Inventory page, at most once
//    per interval no matter how many people open it (atomic claim below).
//  - "nightly" jobs: run by the cron route, once a day.
//
// A failed run is retried after RETRY_AFTER_MS instead of hammering the source.

const RETRY_AFTER_MS = 5 * 60 * 1000;

export type AutoJob = {
  key: string;
  label: string;
  maxAgeMs: number;
  run: () => Promise<unknown>;
};

export const PAGE_JOBS: AutoJob[] = [
  { key: "pfms", label: "PFMS Pending", maxAgeMs: 30 * 60 * 1000, run: syncPfms },
  { key: "otp-pending-sales", label: "OTP Pre-Invoice Sales", maxAgeMs: 30 * 60 * 1000, run: syncOtpPendingSales },
];

// Order matters: Max Level reads the invoiced sales history.
export const NIGHTLY_JOBS: AutoJob[] = [
  { key: "sales", label: "Invoiced Sales History", maxAgeMs: 20 * 60 * 60 * 1000, run: syncSales },
  { key: "max-level", label: "Max Level", maxAgeMs: 20 * 60 * 60 * 1000, run: () => recalculateMaxLevels({}) },
  { key: "otp-reservations", label: "Reconcile OTP Reservations", maxAgeMs: 20 * 60 * 60 * 1000, run: syncReservations },
];

export type AutoJobResult =
  | { key: string; label: string; status: "ran"; summary: unknown }
  | { key: string; label: string; status: "fresh" | "running-elsewhere" }
  | { key: string; label: string; status: "failed"; error: string }
  | { key: string; label: string; status: "unavailable"; error: string };

/** Runs one job only if it is stale and nobody else has claimed it. */
export async function runIfStale(job: AutoJob): Promise<AutoJobResult> {
  const { key, label } = job;
  const supabase = getSupabaseAdmin();

  // Make sure the row exists (harmless if it already does).
  const seed = await supabase.from("ims_sync_state").upsert({ key }, { onConflict: "key", ignoreDuplicates: true });
  if (seed.error) return { key, label, status: "unavailable", error: seed.error.message };

  // Atomic claim: only one caller can flip lastStartedAt while it is older than the cutoff.
  const now = Date.now();
  const cutoff = new Date(now - job.maxAgeMs).toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("ims_sync_state")
    .update({ lastStartedAt: new Date(now).toISOString(), lastStatus: "RUNNING" })
    .eq("key", key)
    .or(`lastStartedAt.is.null,lastStartedAt.lt.${cutoff}`)
    .select("key");
  if (claimErr) return { key, label, status: "unavailable", error: claimErr.message };
  if (!claimed || claimed.length === 0) return { key, label, status: "fresh" };

  try {
    const summary = await job.run();
    await supabase
      .from("ims_sync_state")
      .update({ lastFinishedAt: new Date().toISOString(), lastStatus: "OK", lastSummary: summary as object, lastError: null })
      .eq("key", key);
    return { key, label, status: "ran", summary };
  } catch (err: any) {
    const message = err?.message || "Sync failed";
    // Back-date the claim so it is retried in RETRY_AFTER_MS, not after a full interval.
    await supabase
      .from("ims_sync_state")
      .update({
        lastStartedAt: new Date(Date.now() - job.maxAgeMs + RETRY_AFTER_MS).toISOString(),
        lastStatus: "FAILED",
        lastError: message,
      })
      .eq("key", key);
    return { key, label, status: "failed", error: message };
  }
}

/** Runs jobs one after another (they share the DB; sequential keeps load flat). */
export async function runJobs(jobs: AutoJob[]): Promise<AutoJobResult[]> {
  const results: AutoJobResult[] = [];
  for (const job of jobs) results.push(await runIfStale(job));
  return results;
}
