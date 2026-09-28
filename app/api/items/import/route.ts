import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { LOCATIONS, parseItemImportRow } from "@/lib/item-import";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: `CSV parse error: ${parsed.errors[0].message}` },
        { status: 400 }
      );
    }

    // Ensure the fixed location set exists (idempotent, additive only).
    const locationByCode = new Map<string, string>();
    for (const loc of LOCATIONS) {
      const record = await prisma.locationMaster.upsert({
        where: { locationCode: loc.code },
        update: {},
        create: { locationCode: loc.code, locationName: loc.name },
      });
      locationByCode.set(loc.code, record.id);
    }

    const errors: string[] = [];
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let locationSettingsUpserted = 0;
    let openingEntriesAdded = 0;
    let openingEntriesSkipped = 0;

    for (let i = 0; i < parsed.data.length; i++) {
      const { row, error } = parseItemImportRow(parsed.data[i], i + 2); // +2: header row + 1-index
      if (error) {
        errors.push(error);
        continue;
      }
      if (!row) continue;

      const existingItem = await prisma.itemMaster.findUnique({ where: { itemCode: row.itemCode } });

      await prisma.itemMaster.upsert({
        where: { itemCode: row.itemCode },
        update: {
          itemName: row.itemName,
          itemGroup: row.group || undefined,
          category: row.category || undefined,
          imageUrl: row.imageUrl || undefined,
        },
        create: {
          itemCode: row.itemCode,
          itemName: row.itemName,
          itemGroup: row.group || null,
          category: row.category || null,
          imageUrl: row.imageUrl || null,
        },
      });
      existingItem ? itemsUpdated++ : itemsCreated++;

      const locationId = locationByCode.get(row.locationCode)!;

      await prisma.itemLocationSetting.upsert({
        where: { itemCode_locationId: { itemCode: row.itemCode, locationId } },
        update: {
          maxLevel: row.maxLevel ?? undefined,
          avgSalePeak: row.avgSalePeak ?? undefined,
        },
        create: {
          itemCode: row.itemCode,
          locationId,
          maxLevel: row.maxLevel,
          avgSalePeak: row.avgSalePeak,
        },
      });
      locationSettingsUpserted++;

      if (row.liveStock !== null && row.liveStock !== 0) {
        const alreadyOpened = await prisma.stockLedger.findFirst({
          where: { itemCode: row.itemCode, locationId, referenceType: "Opening Import" },
        });

        if (alreadyOpened) {
          openingEntriesSkipped++;
        } else {
          await prisma.stockLedger.create({
            data: {
              itemCode: row.itemCode,
              locationId,
              txnType: "IN",
              qty: row.liveStock,
              referenceType: "Opening Import",
              remarks: "Opening balance from CSV import",
            },
          });
          openingEntriesAdded++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        rowsProcessed: parsed.data.length,
        itemsCreated,
        itemsUpdated,
        locationSettingsUpserted,
        openingEntriesAdded,
        openingEntriesSkipped,
        errorCount: errors.length,
      },
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/items/import error:", err);
    return NextResponse.json({ success: false, error: err.message || "Import failed" }, { status: 500 });
  }
}
