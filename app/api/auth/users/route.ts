import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: users, error } = await supabase
      .from("ims_User")
      .select("id, username, fullName, role, pageAccess, locationAccess, createdAt")
      .order("createdAt", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (body.action === "login") {
      const { username, password } = body;
      if (!username || !password) {
        return NextResponse.json({ success: false, error: "Username and password required" }, { status: 400 });
      }

      const { data: user, error } = await supabase
        .from("ims_User")
        .select("id, username, fullName, role, pageAccess, locationAccess")
        .eq("username", String(username).trim())
        .eq("password", String(password).trim())
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!user) {
        return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
      }

      return NextResponse.json({ success: true, user });
    }

    // Create user
    const { username, fullName, password, role, pageAccess, locationAccess } = body;
    if (!username || !fullName) {
      return NextResponse.json({ success: false, error: "username and fullName required" }, { status: 400 });
    }

    const { data: created, error } = await supabase
      .from("ims_User")
      .insert({
        username,
        fullName,
        password: password || "123456",
        role: role || "user",
        pageAccess: pageAccess ?? null,
        locationAccess: locationAccess ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, user: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, username, fullName, password, role, pageAccess, locationAccess } = body;
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    const updateData: Record<string, any> = {};
    if (username !== undefined) updateData.username = username;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (password !== undefined && password !== "") updateData.password = password;
    if (role !== undefined) updateData.role = role;
    if (pageAccess !== undefined) updateData.pageAccess = pageAccess;
    if (locationAccess !== undefined) updateData.locationAccess = locationAccess;

    const { data: updated, error } = await supabase.from("ims_User").update(updateData).eq("id", id).select().single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    const { error } = await supabase.from("ims_User").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
