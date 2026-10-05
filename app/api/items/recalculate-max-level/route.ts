import { NextRequest, NextResponse } from "next/server";
import { recalculateMaxLevels } from "@/lib/max-level-calc";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const safetyFactor = typeof body.safetyFactor === "number" && body.safetyFactor > 0 ? body.safetyFactor : undefined;
    const growthRate = typeof body.growthRate === "number" && body.growthRate > 0 ? body.growthRate : undefined;

    const summary = await recalculateMaxLevels({ safetyFactor, growthRate });
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("POST /api/items/recalculate-max-level error:", err);
    return NextResponse.json({ success: false, error: err.message || "Recalculation failed" }, { status: 500 });
  }
}
