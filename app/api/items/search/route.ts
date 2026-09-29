import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";

    let query = supabase
      .from("ims_item_master")
      .select("itemCode, itemName, category, itemGroup")
      .order("itemName", { ascending: true })
      .limit(20);

    if (q) {
      query = query.or(`itemCode.ilike.%${q}%,itemName.ilike.%${q}%`);
    }

    const { data: items, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
