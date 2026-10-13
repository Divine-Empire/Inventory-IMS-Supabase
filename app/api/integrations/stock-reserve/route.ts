import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { reserveStock } from "@/lib/integrations/stock";

// OTP Packing List submit: reserve qty / serials at one location for one
// pre-invoice wave. Replaces the wave's earlier reservation, so it's safe to
// call again with an edited list or as a retry.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) =>
    reserveStock({ waveId: body.waveId, orderNo: body.orderNo, locationCode: body.locationCode, items: body.items })
  );
}
