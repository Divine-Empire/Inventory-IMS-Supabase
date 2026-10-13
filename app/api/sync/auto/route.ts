import { NextResponse } from "next/server";
import { PAGE_JOBS, runJobs } from "@/lib/auto-sync";

export const maxDuration = 60;

// Called once when the Inventory page opens. Each job runs only if its data is
// older than its interval; otherwise this is a few cheap reads and nothing else.
export async function POST() {
  try {
    const results = await runJobs(PAGE_JOBS);
    return NextResponse.json({ success: true, results, changed: results.some((r) => r.status === "ran") });
  } catch (err: any) {
    console.error("POST /api/sync/auto error:", err);
    return NextResponse.json({ success: false, error: err.message || "Auto sync failed" }, { status: 500 });
  }
}
