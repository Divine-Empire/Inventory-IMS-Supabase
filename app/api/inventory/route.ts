import { NextResponse } from "next/server";
import { getInventoryRows } from "@/lib/inventory";

export async function GET() {
  try {
    const rows = await getInventoryRows();
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("GET /api/inventory error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to load inventory" }, { status: 500 });
  }
}
