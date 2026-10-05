-- Restructures the location model: top-level is now CG, NE, WB, OD
-- (states/regions). MANIQUIP and HO (previously independent top-level
-- locations) become CG's sub-godowns instead, alongside two brand-new
-- sub-godowns (Warehouse, Service Inbound). Their existing `id`s are kept
-- unchanged (only parentLocationId is set), so every row that already
-- references them (ims_stock_ledger, ims_item_location_setting,
-- ims_serial_number, ims_sales_transaction, ims_pfms_pending_snapshot)
-- stays valid with zero backfill. WB/OD are new, single flat godowns (no
-- sub-split) — nothing feeds them yet, they're added for the hierarchy to
-- be complete.

ALTER TABLE ims_location_master ADD COLUMN IF NOT EXISTS "parentLocationId" TEXT
  REFERENCES ims_location_master(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Reparent the existing MANIQUIP / HO rows under CG.
UPDATE ims_location_master
SET "parentLocationId" = (SELECT id FROM ims_location_master WHERE "locationCode" = 'CG')
WHERE "locationCode" IN ('MANIQUIP', 'HO');

-- New CG sub-godowns.
INSERT INTO ims_location_master ("locationCode", "locationName", "parentLocationId")
SELECT 'CG-WAREHOUSE', 'Warehouse', id FROM ims_location_master WHERE "locationCode" = 'CG'
ON CONFLICT ("locationCode") DO NOTHING;

INSERT INTO ims_location_master ("locationCode", "locationName", "parentLocationId")
SELECT 'CG-SERVICE-INBOUND', 'Service Inbound', id FROM ims_location_master WHERE "locationCode" = 'CG'
ON CONFLICT ("locationCode") DO NOTHING;

-- New top-level states (single flat godown each, no sub-split for now).
INSERT INTO ims_location_master ("locationCode", "locationName") VALUES
  ('WB', 'West Bengal'),
  ('OD', 'Odisha')
ON CONFLICT ("locationCode") DO NOTHING;
