import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createTransfer, StockTransferError } from "@/lib/stock-transfer";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: transfers, error } = await supabase
      .from("ims_stock_transfer")
      .select(
        "*, items:ims_stock_transfer_item(*), fromLocation:ims_location_master!ims_stock_transfer_fromLocationId_fkey(locationCode), toLocation:ims_location_master!ims_stock_transfer_toLocationId_fkey(locationCode)"
      )
      .order("createdAt", { ascending: false });
    if (error) throw new Error(error.message);
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
