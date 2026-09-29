import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Serials currently IN_STOCK for a given item+location — used to populate
// the Stock Transfer form's serial dropdowns so users can only pick units
// that are actually available (prevents manual/irregular serial entries).
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
      .select("serialNo, warrantyExpiryDate, invoiceDate")
      .eq("itemCode", itemCode)
      .eq("currentLocationId", location.id)
      .eq("status", "IN_STOCK")
      .order("warrantyExpiryDate", { ascending: true, nullsFirst: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, serials: serials || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
