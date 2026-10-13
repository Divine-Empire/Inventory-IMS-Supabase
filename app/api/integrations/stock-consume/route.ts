import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { consumeReservation } from "@/lib/integrations/stock";

// OTP Pre-Invoice processed: the wave's reservation becomes a real OUT.
// Pass the final `items` (+ locationCode) if the dialog edited them.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) =>
    consumeReservation({
      waveId: body.waveId,
      referenceNo: body.referenceNo,
      orderNo: body.orderNo,
      locationCode: body.locationCode,
      items: body.items,
    })
  );
}
