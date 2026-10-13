import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ?q=...   substring search over item code / name (the pickers).
// ?name=...  exact, case-insensitive item NAME lookup (OTP's pre-filled
//            Stock Transfer matches items by name — OTP and IMS don't share
//            codes). Names can contain commas / brackets, which would break
//            the .or() filter above, so this path uses a plain ilike.
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const name = req.nextUrl.searchParams.get("name")?.trim();

    if (name) {
      const escaped = name.replace(/[\%_]/g, (c) => `\${c}`);
      const { data: items, error } = await supabase
        .from("ims_item_master")
        .select("itemCode, itemName, category, itemGroup")
        .ilike("itemName", escaped)
        .limit(20);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, items });
    }

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
