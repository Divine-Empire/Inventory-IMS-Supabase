import { NextRequest, NextResponse } from "next/server";
import { serialScanIn, SerialScanError } from "@/lib/serials";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const serial = await serialScanIn({
      itemCode: body.itemCode,
      locationCode: body.locationCode,
      serialNo: body.serialNo,
      warrantyExpiryDate: body.warrantyExpiryDate || null,
      invoiceDate: body.invoiceDate || null,
      createdBy: body.createdBy,
    });
    return NextResponse.json({ success: true, serial });
  } catch (err: any) {
    const status = err instanceof SerialScanError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Serial IN failed" }, { status });
  }
}
