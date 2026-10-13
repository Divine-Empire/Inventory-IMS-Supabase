import { NextRequest } from "next/server";
import { integrationHandler, IntegrationError } from "@/lib/integrations/http";
import { syncPfmsSerials } from "@/lib/sync-pfms-serials";

// PFMS Serial Generation saved: attach that lift's serials to the godown it
// was received into (no extra qty — see lib/sync-pfms-serials.ts).
export async function POST(req: NextRequest) {
  return integrationHandler(req, async (body) => {
    const liftNos: string[] = Array.isArray(body.liftNos) ? body.liftNos : body.liftNo ? [body.liftNo] : [];
    if (liftNos.length === 0) throw new IntegrationError("liftNo (or liftNos) is required");
    return { ...(await syncPfmsSerials({ liftNos })) };
  });
}
