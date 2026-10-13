import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { releaseReservation } from "@/lib/integrations/stock";

// OTP Pre-Invoice: wave cancelled / emptied — give the reserved stock back.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) => releaseReservation({ waveId: body.waveId }));
}
