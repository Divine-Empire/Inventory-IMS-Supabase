import { NextRequest, NextResponse } from "next/server";
import { NIGHTLY_JOBS, runJobs } from "@/lib/auto-sync";

export const maxDuration = 300;

// Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runJobs(NIGHTLY_JOBS);
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("GET /api/cron/nightly error:", err);
    return NextResponse.json({ success: false, error: err.message || "Nightly sync failed" }, { status: 500 });
  }
}
