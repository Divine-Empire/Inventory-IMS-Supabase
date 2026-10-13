import { NextResponse } from "next/server";
import { syncReservations } from "@/lib/sync-reservations";

export async function POST() {
  try {
    const summary = await syncReservations();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/sync/otp-reservations error:", err);
    return NextResponse.json({ success: false, error: err.message || "Reservation reconcile failed" }, { status: 500 });
  }
}
