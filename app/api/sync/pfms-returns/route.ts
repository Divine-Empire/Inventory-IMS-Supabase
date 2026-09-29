import { NextResponse } from "next/server";
import { syncPfmsReturns } from "@/lib/sync-pfms-returns";

export async function POST() {
  try {
    const summary = await syncPfmsReturns();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/pfms-returns error:", err);
    return NextResponse.json({ success: false, error: err.message || "PFMS returns sync failed" }, { status: 500 });
  }
}
