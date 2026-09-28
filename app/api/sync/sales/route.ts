import { NextResponse } from "next/server";
import { syncSales } from "@/lib/sync-sales";

export async function POST() {
  try {
    const summary = await syncSales();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/sales error:", err);
    return NextResponse.json({ success: false, error: err.message || "Sales sync failed" }, { status: 500 });
  }
}
