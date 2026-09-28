import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const locationCode = req.nextUrl.searchParams.get("locationCode");
    const status = req.nextUrl.searchParams.get("status");

    const location = locationCode ? await prisma.locationMaster.findUnique({ where: { locationCode } }) : null;

    const serials = await prisma.serialNumber.findMany({
      where: {
        ...(location ? { currentLocationId: location.id } : {}),
        ...(status ? { status } : {}),
      },
      include: { item: { select: { itemName: true } }, currentLocation: { select: { locationCode: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      serials: serials.map((s) => ({
        serialNo: s.serialNo,
        itemCode: s.itemCode,
        itemName: s.item.itemName,
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
