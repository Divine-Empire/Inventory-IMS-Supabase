import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const locationCode = req.nextUrl.searchParams.get("locationCode");
    const status = req.nextUrl.searchParams.get("status");

    let locationId: string | null = null;
    if (locationCode) {
      const { data: location } = await supabase
        .from("ims_location_master")
        .select("id")
        .eq("locationCode", locationCode)
        .maybeSingle();
      locationId = location?.id ?? null;
    }

    let query = supabase
      .from("ims_serial_number")
      .select("serialNo, itemCode, status, warrantyExpiryDate, invoiceDate, updatedAt, item:ims_item_master(itemName), currentLocation:ims_location_master(locationCode)")
      .order("updatedAt", { ascending: false })
      .limit(50);

    if (locationId) query = query.eq("currentLocationId", locationId);
    if (status) query = query.eq("status", status);

    const { data: serials, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      serials: (serials || []).map((s: any) => ({
        serialNo: s.serialNo,
        itemCode: s.itemCode,
        itemName: s.item?.itemName ?? null,
        locationCode: s.currentLocation?.locationCode ?? null,
        status: s.status,
        warrantyExpiryDate: s.warrantyExpiryDate,
        invoiceDate: s.invoiceDate,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
