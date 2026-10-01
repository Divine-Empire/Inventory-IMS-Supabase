-- Lets lib/sync-sales.ts use a single batched .upsert() instead of a
-- sequential per-row "does this exist?" check + insert/update (the same
-- N+1 pattern that was observed to take 65s/500 rows elsewhere in this
-- project before being batched). itemCode can be null (item-name-only
-- fallback match), and Postgres treats NULL as distinct in a unique index
-- — so a plain (quotationNo, invoiceNo, itemCode) constraint wouldn't
-- dedupe those rows. dedupeKey = COALESCE(itemCode, itemNameRaw, '') is
-- computed and set by the application on every write instead.
ALTER TABLE ims_sales_transaction ADD COLUMN IF NOT EXISTS "dedupeKey" text;
CREATE UNIQUE INDEX IF NOT EXISTS ims_sales_transaction_dedupe_idx
  ON ims_sales_transaction ("quotationNo", "invoiceNo", "dedupeKey");
