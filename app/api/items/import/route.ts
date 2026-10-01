import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin } from "@/lib/supabase";
import { LOCATIONS, parseItemImportRow } from "@/lib/item-import";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
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
      const { data, error } = await supabase
        .from("ims_location_master")
        .upsert({ locationCode: loc.code, locationName: loc.name }, { onConflict: "locationCode" })
        .select("id, locationCode")
        .single();
      if (error) throw new Error(`Location upsert failed: ${error.message}`);
      locationByCode.set(loc.code, data.id);
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

      const { data: existingItem } = await supabase
        .from("ims_item_master")
        .select("itemCode")
        .eq("itemCode", row.itemCode)
        .maybeSingle();

      const { error: itemErr } = await supabase.from("ims_item_master").upsert(
        {
          itemCode: row.itemCode,
          itemName: row.itemName,
          itemGroup: row.group || null,
          category: row.category || null,
          imageUrl: row.imageUrl || null,
        },
        { onConflict: "itemCode" }
      );
      if (itemErr) {
        errors.push(`Row ${i + 2}: ${itemErr.message}`);
        continue;
      }
      existingItem ? itemsUpdated++ : itemsCreated++;

      const locationId = locationByCode.get(row.locationCode)!;

      const { error: settingErr } = await supabase.from("ims_item_location_setting").upsert(
        {
          itemCode: row.itemCode,
          locationId,
          maxLevel: row.maxLevel,
          maxLevelPeak: row.maxLevelPeak,
          avgSalePeak: row.avgSalePeak,
        },
        { onConflict: "itemCode,locationId" }
      );
      if (settingErr) {
        errors.push(`Row ${i + 2}: ${settingErr.message}`);
        continue;
      }
      locationSettingsUpserted++;

      if (row.liveStock !== null && row.liveStock !== 0) {
        const { data: alreadyOpened } = await supabase
          .from("ims_stock_ledger")
          .select("id")
          .eq("itemCode", row.itemCode)
          .eq("locationId", locationId)
          .eq("referenceType", "Opening Import")
          .maybeSingle();

        if (alreadyOpened) {
          openingEntriesSkipped++;
        } else {
          const { error: ledgerErr } = await supabase.from("ims_stock_ledger").insert({
            itemCode: row.itemCode,
            locationId,
            txnType: "IN",
            qty: row.liveStock,
            referenceType: "Opening Import",
            remarks: "Opening balance from CSV import",
          });
          if (ledgerErr) {
            errors.push(`Row ${i + 2}: ${ledgerErr.message}`);
            continue;
          }
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
