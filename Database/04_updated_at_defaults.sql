-- Prisma set updatedAt client-side on INSERT too (not just UPDATE), so the
-- column has no DB-level default — inserts via the Supabase client fail
-- with a NOT NULL violation without this. Additive only.

ALTER TABLE "ims_User" ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_item_master ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_item_location_setting ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_location_master ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_serial_number ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_indent_po_sync ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_stock_transfer ALTER COLUMN "updatedAt" SET DEFAULT NOW();
ALTER TABLE ims_sales_transaction ALTER COLUMN "updatedAt" SET DEFAULT NOW();
