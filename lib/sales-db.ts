// Thin REST client for the OTP/LTO Supabase project (a genuinely separate
// project from PFMS/IMS's own DB — otp_* and lto_* tables both live here).
// Plain fetch against PostgREST, no supabase-js dependency needed.

const BASE_URL = process.env.LTO_SUPABASE_URL;
const SERVICE_KEY = process.env.LTO_SUPABASE_SERVICE_ROLE_KEY;

const PAGE_SIZE = 1000; // PostgREST's default per-request row cap

export async function salesDbSelect<T = any>(table: string, query: string): Promise<T[]> {
  if (!BASE_URL || !SERVICE_KEY) {
    throw new Error("LTO_SUPABASE_URL / LTO_SUPABASE_SERVICE_ROLE_KEY are not configured");
  }

  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const res = await fetch(`${BASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sales DB query failed (${table}): ${res.status} ${text}`);
    }

    const page: T[] = await res.json();
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

/** PostgREST `.in()` filter needs values comma-joined and quoted if they contain commas — our ids/quotation numbers don't, so a plain join is safe. */
export function inFilter(values: (string | null | undefined)[]): string {
  const unique = Array.from(new Set(values.filter(Boolean) as string[]));
  return `(${unique.map((v) => `"${v}"`).join(",")})`;
}
