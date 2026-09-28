import { NextResponse } from "next/server";
import { ITEM_IMPORT_HEADERS, LOCATION_CODES } from "@/lib/item-import";

export async function GET() {
  const sampleRows = LOCATION_CODES.map((loc) =>
    ["EXAMPLE-GROUP", "EXAMPLE-CATEGORY", "ITM-0001", "Example Item Name", "", loc, "0", "0", "0"].join(",")
  );

  const csv = [ITEM_IMPORT_HEADERS.join(","), ...sampleRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="item-master-import-template.csv"`,
    },
  });
}
