import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** fetchAllRows for an `.in(column, values)` filter, split into chunks so the request URL stays short. */
export async function fetchAllRowsIn<T>(
  queryBuilder: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  values: string[],
  chunkSize = 100
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    rows.push(...(await fetchAllRows<T>(() => queryBuilder(chunk))));
  }
  return rows;
}

/**
 * PostgREST caps a single response at 1000 rows by default — several of the
 * tables this app reads (pfms_for_ims, pfms_item_master, ims_stock_ledger,
 * ...) already exceed that. `queryBuilder` must return a FRESH query each
 * call (so `.range()` can be applied per page), e.g.:
 *   fetchAllRows(() => supabase.from("pfms_for_ims").select("..."))
 */
export async function fetchAllRows<T>(
  queryBuilder: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await (queryBuilder() as any).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}
