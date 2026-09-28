import { NextResponse } from "next/server";
import { syncPfms } from "@/lib/sync-pfms";

export async function POST() {
  try {
    const summary = await syncPfms();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/pfms error:", err);
    return NextResponse.json({ success: false, error: err.message || "PFMS sync failed" }, { status: 500 });
  }
}
