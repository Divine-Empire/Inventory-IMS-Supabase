import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { checkSerial } from "@/lib/integrations/stock";

// OTP Packing List scan: is this serial usable at this location?
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) => checkSerial({ serialNo: body.serialNo, locationCode: body.locationCode, waveId: body.waveId }));
}
