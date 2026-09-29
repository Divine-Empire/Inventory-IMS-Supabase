import { NextRequest, NextResponse } from "next/server";
import { recordScanOut, ScanOutIntegrationError } from "@/lib/integrations/scan-out";

// Called live by OTP_Supabase (a separate deployed app) at scan-time —
// authenticated with a shared secret since there's no browser session to
// rely on across projects.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.INTEGRATION_API_KEY || apiKey !== process.env.INTEGRATION_API_KEY) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const result = await recordScanOut({
      serialNo: body.serialNo,
      locationCode: body.locationCode,
      itemCode: body.itemCode,
      itemName: body.itemName,
      qty: body.qty,
      source: body.source,
      referenceNo: body.referenceNo,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const status = err instanceof ScanOutIntegrationError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Scan-out integration failed" }, { status });
  }
}
