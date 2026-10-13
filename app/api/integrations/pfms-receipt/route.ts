import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { recordReceiptIn } from "@/lib/integrations/pfms";

// PFMS Material Received saved: IN the received qty at the receiving
// user's godown (locationCode), idempotent per lift.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) => recordReceiptIn({ liftNo: body.liftNo, locationCode: body.locationCode }));
}
