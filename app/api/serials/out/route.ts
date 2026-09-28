import { NextRequest, NextResponse } from "next/server";
import { serialScanOut, SerialScanError } from "@/lib/serials";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await serialScanOut({
      locationCode: body.locationCode,
      serialNo: body.serialNo,
      override: !!body.override,
      createdBy: body.createdBy,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const status = err instanceof SerialScanError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Serial OUT failed" }, { status });
  }
}
