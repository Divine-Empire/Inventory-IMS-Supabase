import { NextRequest } from "next/server";
import { integrationHandler } from "@/lib/integrations/http";
import { recordPurchaseReturnOut } from "@/lib/integrations/pfms";

// PFMS Purchase Return saved: the returned units leave stock — the picked
// serials, plus any qty beyond them from the returning user's godown.
export async function POST(req: NextRequest) {
  return integrationHandler(req, (body) =>
    recordPurchaseReturnOut({ returnId: body.returnId, locationCode: body.locationCode, serialNumbers: body.serialNumbers })
  );
}
