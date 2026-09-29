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
