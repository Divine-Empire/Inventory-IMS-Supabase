import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { getStockAvailability } from "@/lib/integrations/stock";

// OTP Packing List: free qty + that location's in-stock serials (oldest
// first) for every item of an order, in one call. Items are matched by name.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) => getStockAvailability({ locationCode: body.locationCode, items: body.items }));
}
