import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { LOCATIONS, parseItemImportRow, type ItemImportRow } from "@/lib/item-import";

// Batched: a row-by-row import (several round trips per CSV row) is hopeless
// at a few thousand rows, so everything below is a bulk read followed by
// 500-row bulk writes.
//
//   ims_item_master           upsert by itemCode (CSV fills what it has; a blank
//                             CSV cell never wipes an existing value)
//   ims_item_location_setting create the (item, location) row if missing; MAX LEVEL /
//                             MAX LEVEL PEAK are set only when the CSV cell is filled
//                             (blank keeps the existing value)
//   ims_stock_ledger          LIVE STOCK -> ONE "Opening Import" IN entry per
//                             (item, location), skipped if one already exists —
//                             so re-importing the same CSV can't double the stock
const BATCH_SIZE = 500;

async function batched<T>(rows: T[], write: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>, label: string) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await write(rows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`${label} (rows ${i + 1}-${Math.min(i + BATCH_SIZE, rows.length)}): ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const text = (await file.text()).replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json({ success: false, error: `CSV parse error: ${parsed.errors[0].message}` }, { status: 400 });
    }

    // Ensure the fixed location set exists (insert-only — never rename an existing location).
    const existingLocations = await fetchAllRows<{ id: string; locationCode: string }>(() =>
      supabase.from("ims_location_master").select("id, locationCode")
    );
    const have = new Set(existingLocations.map((l) => l.locationCode));
    const missingLocations = LOCATIONS.filter((l) => !have.has(l.code)).map((l) => ({ locationCode: l.code, locationName: l.name }));
    if (missingLocations.length > 0) {
      const { error } = await supabase.from("ims_location_master").insert(missingLocations);
      if (error) throw new Error(`Location insert failed: ${error.message}`);
    }
    const locationIdByCode = new Map(
      (await fetchAllRows<{ id: string; locationCode: string }>(() => supabase.from("ims_location_master").select("id, locationCode"))).map(
        (l) => [l.locationCode, l.id]
      )
    );

    // Validate + dedupe.
    const errors: string[] = [];
    const warnings: string[] = [];
    const rows: { row: ItemImportRow; line: number }[] = [];
    const seenKey = new Set<string>();
    const firstNameByCode = new Map<string, string>();
    for (let i = 0; i < parsed.data.length; i++) {
      const line = i + 2; // header row + 1-index
      const { row, error } = parseItemImportRow(parsed.data[i], line);
      if (error || !row) {
        errors.push(error!);
        continue;
      }
      const key = `${row.itemCode}::${row.locationCode}`;
      if (seenKey.has(key)) {
        errors.push(`Row ${line}: duplicate ${row.itemCode} at ${row.locationCode} — skipped (first occurrence kept)`);
        continue;
      }
      seenKey.add(key);
      const firstName = firstNameByCode.get(row.itemCode);
      if (firstName === undefined) firstNameByCode.set(row.itemCode, row.itemName);
      else if (firstName.toLowerCase() !== row.itemName.toLowerCase()) {
        warnings.push(`Row ${line}: ${row.itemCode} is also named "${firstName}" elsewhere in the file — the first name is kept`);
      }
      rows.push({ row, line });
    }

    // 1. Item master — one entry per itemCode.
    const existingItems = await fetchAllRows<any>(() =>
      supabase.from("ims_item_master").select("itemCode, itemName, itemGroup, category, uom, imageUrl")
    );
    const existingByCode = new Map(existingItems.map((i) => [i.itemCode, i]));
    const itemRows = new Map<string, any>();
    for (const { row } of rows) {
      if (itemRows.has(row.itemCode)) continue;
      const prev = existingByCode.get(row.itemCode);
      itemRows.set(row.itemCode, {
        itemCode: row.itemCode,
        itemName: firstNameByCode.get(row.itemCode) ?? row.itemName,
        itemGroup: row.group || prev?.itemGroup || null,
        category: row.category || prev?.category || null,
        uom: row.uom || prev?.uom || null,
        imageUrl: row.imageUrl || prev?.imageUrl || null,
      });
    }
    const itemsToWrite = Array.from(itemRows.values());
    const itemsCreated = itemsToWrite.filter((i) => !existingByCode.has(i.itemCode)).length;
    await batched(itemsToWrite, (b) => supabase.from("ims_item_master").upsert(b, { onConflict: "itemCode" }), "Item master upsert failed");

    // 2. (item, location) settings — create if missing; max levels only when the CSV gives one.
    const settingRows = rows.map(({ row }) => ({ itemCode: row.itemCode, locationId: locationIdByCode.get(row.locationCode)! }));
    await batched(
      settingRows,
      (b) => supabase.from("ims_item_location_setting").upsert(b, { onConflict: "itemCode,locationId", ignoreDuplicates: true }),
      "Location setting insert failed"
    );
    const withLevels = rows.filter(({ row }) => row.maxLevel !== null || row.maxLevelPeak !== null);
    if (withLevels.length > 0) {
      const existingSettings = await fetchAllRows<{ itemCode: string; locationId: string; maxLevel: number | null; maxLevelPeak: number | null }>(() =>
        supabase.from("ims_item_location_setting").select("itemCode, locationId, maxLevel, maxLevelPeak")
      );
      const prevByKey = new Map(existingSettings.map((s) => [`${s.itemCode}::${s.locationId}`, s]));
      const levelRows = withLevels.map(({ row }) => {
        const locationId = locationIdByCode.get(row.locationCode)!;
        const prev = prevByKey.get(`${row.itemCode}::${locationId}`);
        return {
          itemCode: row.itemCode,
          locationId,
          maxLevel: row.maxLevel ?? prev?.maxLevel ?? null,
          maxLevelPeak: row.maxLevelPeak ?? prev?.maxLevelPeak ?? null,
        };
      });
      await batched(levelRows, (b) => supabase.from("ims_item_location_setting").upsert(b, { onConflict: "itemCode,locationId" }), "Max level update failed");
    }

    // 3. Opening stock.
    const alreadyOpened = new Set(
      (
        await fetchAllRows<{ itemCode: string; locationId: string }>(() =>
          supabase.from("ims_stock_ledger").select("itemCode, locationId").eq("referenceType", "Opening Import")
        )
      ).map((l) => `${l.itemCode}::${l.locationId}`)
    );
    const withStock = rows.filter(({ row }) => row.liveStock !== null && row.liveStock > 0);
    const openingRows = withStock
      .map(({ row }) => ({ itemCode: row.itemCode, locationId: locationIdByCode.get(row.locationCode)!, qty: row.liveStock! }))
      .filter((r) => !alreadyOpened.has(`${r.itemCode}::${r.locationId}`));
    await batched(
      openingRows.map((r) => ({ ...r, txnType: "IN", referenceType: "Opening Import", remarks: "Opening balance from CSV import" })),
      (b) => supabase.from("ims_stock_ledger").insert(b),
      "Opening stock insert failed"
    );

    return NextResponse.json({
      success: true,
      summary: {
        rowsProcessed: parsed.data.length,
        itemsCreated,
        itemsUpdated: itemsToWrite.length - itemsCreated,
        locationSettingsUpserted: settingRows.length,
        maxLevelsSet: withLevels.length,
        openingEntriesAdded: openingRows.length,
        openingEntriesSkipped: withStock.length - openingRows.length,
        rowsWithoutStock: rows.length - withStock.length,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
      errors,
      warnings,
    });
  } catch (err: any) {
    console.error("POST /api/items/import error:", err);
    return NextResponse.json({ success: false, error: err.message || "Import failed" }, { status: 500 });
  }
}
