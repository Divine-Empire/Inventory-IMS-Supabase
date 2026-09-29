-- Prisma previously generated UUIDs client-side (@default(uuid())), so the
-- "id" columns had no DB-level default. Now that the app talks to Postgres
-- via the Supabase client (PostgREST) instead of Prisma, inserts need the
-- DB to generate ids itself. Additive only — no existing data touched.

ALTER TABLE "ims_User" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_item_master" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_item_location_setting" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_location_master" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_stock_ledger" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_serial_number" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_indent_po_sync" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_stock_transfer" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_stock_transfer_item" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_sales_transaction" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_abc_snapshot" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ims_audit_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
