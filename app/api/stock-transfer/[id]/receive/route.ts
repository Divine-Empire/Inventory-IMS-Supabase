import { NextRequest, NextResponse } from "next/server";
import { receiveTransfer, StockTransferError } from "@/lib/stock-transfer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const transfer = await receiveTransfer(id, body.receivedBy);
    return NextResponse.json({ success: true, transfer });
  } catch (err: any) {
    const status = err instanceof StockTransferError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Failed to receive transfer" }, { status });
  }
}
