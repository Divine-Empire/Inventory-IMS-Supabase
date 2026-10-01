import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Powers the Inventory page's "Serials" button/modal — every currently
// in-stock serial for an item+location, along with the PFMS lift number it
// came in on (via the IN ledger entry's referenceNo) and its
// warranty/invoice date.
export async function GET(req: NextRequest) {
  try {
    const itemCode = req.nextUrl.searchParams.get("itemCode");
    const locationCode = req.nextUrl.searchParams.get("locationCode");
    if (!itemCode || !locationCode) {
      return NextResponse.json({ success: false, error: "itemCode and locationCode are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: location, error: locErr } = await supabase
      .from("ims_location_master")
      .select("id")
      .eq("locationCode", locationCode)
      .maybeSingle();
    if (locErr) throw new Error(locErr.message);
    if (!location) return NextResponse.json({ success: true, serials: [] });

    const { data: serials, error } = await supabase
      .from("ims_serial_number")
      .select("serialNo, status, warrantyExpiryDate, invoiceDate, inTxnId")
      .eq("itemCode", itemCode)
      .eq("currentLocationId", location.id)
      .eq("status", "IN_STOCK")
      .order("warrantyExpiryDate", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);

    const txnIds = (serials || []).map((s) => s.inTxnId).filter(Boolean);
    const liftByTxnId = new Map<string, string>();
    if (txnIds.length) {
      const { data: ledgerEntries, error: ledgerErr } = await supabase
        .from("ims_stock_ledger")
        .select("id, referenceNo, referenceType")
        .in("id", txnIds);
      if (ledgerErr) throw new Error(ledgerErr.message);
      for (const l of ledgerEntries || []) {
        if (l.referenceType === "PFMS Serial Generation" && l.referenceNo) liftByTxnId.set(l.id, l.referenceNo);
      }
    }

    return NextResponse.json({
      success: true,
      serials: (serials || []).map((s) => ({
        serialNo: s.serialNo,
        liftNo: s.inTxnId ? liftByTxnId.get(s.inTxnId) ?? null : null,
        warrantyExpiryDate: s.warrantyExpiryDate,
        invoiceDate: s.invoiceDate,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
