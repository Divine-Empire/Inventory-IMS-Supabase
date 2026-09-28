import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const items = await prisma.itemMaster.findMany({
      where: q
        ? {
            OR: [
              { itemCode: { contains: q, mode: "insensitive" } },
              { itemName: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: { itemCode: true, itemName: true, category: true, itemGroup: true },
      take: 20,
      orderBy: { itemName: "asc" },
    });
    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
