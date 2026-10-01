import { NextResponse } from "next/server";
import { syncOtpPendingSales } from "@/lib/sync-otp-pending-sales";

export async function POST() {
  try {
    const summary = await syncOtpPendingSales();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/otp-pending-sales error:", err);
    return NextResponse.json({ success: false, error: err.message || "OTP pending sales sync failed" }, { status: 500 });
  }
}
