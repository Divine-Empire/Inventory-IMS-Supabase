-- Splits the single "MAX LEVEL (PEAK)" CSV field into two distinct values:
-- maxLevel (normal) and maxLevelPeak (peak season). Additive only.
ALTER TABLE ims_item_location_setting ADD COLUMN IF NOT EXISTS "maxLevelPeak" DOUBLE PRECISION;
