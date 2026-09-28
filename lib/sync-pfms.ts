import { prisma } from "@/lib/prisma";

// PFMS's warehouseLocation free-text values, normalized -> our fixed
// location codes. "C.G Warehosue" is a real typo present in PFMS's live
// data (verified against pfms_for_ims), kept here deliberately.
const LOCATION_ALIASES: Record<string, string> = {
  "NE WAREHOUSE": "NE",
  "MANIQUIP STORE": "MANIQUIP",
  "C.G WAREHOUSE": "CG",
  "C.G WAREHOSUE": "CG",
  "HEAD OFFICE": "HO",
};

type PfmsForImsRow = {
  indent_no: string;
  material_name: string | null;
  warehouse_location: string | null;
  indent_qty: number | null;
  po_qty: number | null;
  receiving_qty: number | null;
  intransit_qty: number | null;
  item_code: string | null; // resolved via pfms_item_master name match, in SQL
  lead_time_days: number | null;
};

export async function syncPfms() {
  // Same physical DB as PFMS — read directly via raw SQL (these tables
  // aren't Prisma models here; they're owned/migrated by PFMS's own repo).
  const rows = await prisma.$queryRawUnsafe<PfmsForImsRow[]>(`
    SELECT
      f."indent no." AS indent_no,
      f."material name" AS material_name,
      f."warehouse location" AS warehouse_location,
      f."indent qty" AS indent_qty,
      f."po qty" AS po_qty,
      f."receiving qty" AS receiving_qty,
      f."intransit qty" AS intransit_qty,
      im."ITEM CODE" AS item_code,
      ig."leadTime" AS lead_time_days
    FROM pfms_for_ims f
    LEFT JOIN pfms_item_master im
      ON upper(trim(im."ITEM NAME")) = upper(trim(f."material name"))
    LEFT JOIN pfms_indent_generation ig
      ON ig."indentNo" = f."indent no."
  `);

  const locations = await prisma.locationMaster.findMany();
  const locationByCode = new Map(locations.map((l) => [l.locationCode, l.id]));
  const itemCodes = new Set((await prisma.itemMaster.findMany({ select: { itemCode: true } })).map((i) => i.itemCode));

  let upserted = 0;
  let unmatchedItem = 0;
  let unmatchedLocation = 0;

  for (const row of rows) {
    if (!row.indent_no) continue;

    const itemCode = row.item_code && itemCodes.has(row.item_code) ? row.item_code : null;
    if (!itemCode) unmatchedItem++;

    const locKey = (row.warehouse_location || "").trim().toUpperCase();
    const locationId = LOCATION_ALIASES[locKey] ? locationByCode.get(LOCATION_ALIASES[locKey]) : undefined;
    if (!locationId) unmatchedLocation++;

    await prisma.indentPoSync.upsert({
      where: { indentNo: row.indent_no },
      update: {
        itemCode,
        locationId: locationId ?? null,
        indentQty: row.indent_qty,
        poQty: row.po_qty,
        receivedQty: row.receiving_qty,
        intransitQty: row.intransit_qty,
        leadTimeDays: row.lead_time_days,
      },
      create: {
        indentNo: row.indent_no,
        itemCode,
        locationId: locationId ?? null,
        indentQty: row.indent_qty,
        poQty: row.po_qty,
        receivedQty: row.receiving_qty,
        intransitQty: row.intransit_qty,
        leadTimeDays: row.lead_time_days,
      },
    });
    upserted++;
  }

  return { totalRows: rows.length, upserted, unmatchedItem, unmatchedLocation };
}
