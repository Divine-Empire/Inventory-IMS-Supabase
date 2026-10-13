import { NextRequest, NextResponse } from "next/server";

export class IntegrationError extends Error {}

/**
 * Shared wrapper for every cross-system endpoint under /api/integrations —
 * OTP and PFMS are separate deployed apps with no browser session, so they
 * authenticate with the shared INTEGRATION_API_KEY. `fn` returns the fields
 * to merge into `{ success: true, ... }`.
 */
export async function integrationHandler(req: NextRequest, fn: (body: any) => Promise<Record<string, unknown>>) {
  const apiKey = req.headers.get("x-api-key");
  if (!process.env.INTEGRATION_API_KEY || apiKey !== process.env.INTEGRATION_API_KEY) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await fn(body);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const status = err instanceof IntegrationError ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message || "Integration call failed" }, { status });
  }
}
