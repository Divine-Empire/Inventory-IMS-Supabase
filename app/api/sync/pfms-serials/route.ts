import { NextResponse } from "next/server";
import { syncPfmsSerials } from "@/lib/sync-pfms-serials";

export async function POST() {
  try {
    const summary = await syncPfmsSerials();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/pfms-serials error:", err);
    return NextResponse.json({ success: false, error: err.message || "PFMS serial sync failed" }, { status: 500 });
  }
}
