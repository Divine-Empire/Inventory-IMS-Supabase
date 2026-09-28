import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, pageAccess: true, locationAccess: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "login") {
      const { username, password } = body;
      if (!username || !password) {
        return NextResponse.json({ success: false, error: "Username and password required" }, { status: 400 });
      }

      const user = await prisma.user.findFirst({
        where: { username: String(username).trim(), password: String(password).trim() },
      });

      if (!user) {
        return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          pageAccess: user.pageAccess,
          locationAccess: user.locationAccess,
        },
      });
    }

    // Create user
    const { username, fullName, password, role, pageAccess, locationAccess } = body;
    if (!username || !fullName) {
      return NextResponse.json({ success: false, error: "username and fullName required" }, { status: 400 });
    }

    const created = await prisma.user.create({
      data: {
        username,
        fullName,
        password: password || "123456",
        role: role || "user",
        pageAccess: pageAccess ?? null,
        locationAccess: locationAccess ?? null,
      },
    });

    return NextResponse.json({ success: true, user: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, username, fullName, password, role, pageAccess, locationAccess, isActive } = body;
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    const updateData: Record<string, any> = {};
    if (username !== undefined) updateData.username = username;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (password !== undefined && password !== "") updateData.password = password;
    if (role !== undefined) updateData.role = role;
    if (pageAccess !== undefined) updateData.pageAccess = pageAccess;
    if (locationAccess !== undefined) updateData.locationAccess = locationAccess;

    const updated = await prisma.user.update({ where: { id }, data: updateData });
    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
