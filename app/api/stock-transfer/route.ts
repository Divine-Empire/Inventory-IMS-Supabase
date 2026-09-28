import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTransfer, StockTransferError } from "@/lib/stock-transfer";

export async function GET() {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      include: { items: true, fromLocation: true, toLocation: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, transfers });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transfer = await createTransfer({
      fromLocationCode: body.fromLocationCode,
      toLocationCode: body.toLocationCode,
      requestedBy: body.requestedBy,
      items: body.items,
    });
    return NextResponse.json({ success: true, transfer });
  } catch (err: any) {
    const status = err instanceof StockTransferError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Failed to create transfer" }, { status });
  }
}
