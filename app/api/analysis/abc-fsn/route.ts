import { NextResponse } from "next/server";
import { getAbcFsnAnalysis } from "@/lib/abc-fsn-analysis";

export async function GET() {
  try {
    const data = await getAbcFsnAnalysis();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("GET /api/analysis/abc-fsn error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to compute analysis" }, { status: 500 });
  }
}
