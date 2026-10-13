-- Stock reservations: OTP's Packing List reserves stock (qty and/or specific
-- serials) at one exact location for one OTP pre-invoice wave. A reservation
-- is ACTIVE until Pre-Invoice either releases it (qty reduced / wave
-- cancelled) or consumes it (processed -> becomes a real OUT ledger entry).
-- Free qty at a location = ledger on-hand - SUM(ACTIVE reserved qty).
--
-- waveId = otp_pre_invoice_queue.id (a business key from another system's
-- table, so no FK). Every API that writes here is idempotent per waveId.
CREATE TABLE IF NOT EXISTS ims_stock_reservation (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemCode"   TEXT NOT NULL REFERENCES ims_item_master("itemCode") ON UPDATE CASCADE ON DELETE RESTRICT,
  "locationId" TEXT NOT NULL REFERENCES ims_location_master(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  qty          DOUBLE PRECISION NOT NULL,
  "serialNo"   TEXT,
  "orderNo"    TEXT,
  "waveId"     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | CONSUMED
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ims_stock_reservation_wave_idx ON ims_stock_reservation ("waveId", status);
CREATE INDEX IF NOT EXISTS ims_stock_reservation_item_loc_idx ON ims_stock_reservation ("itemCode", "locationId", status);
-- One serial can only be actively reserved by one wave at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ims_stock_reservation_active_serial_uq
  ON ims_stock_reservation ("serialNo") WHERE status = 'ACTIVE' AND "serialNo" IS NOT NULL;

DROP TRIGGER IF EXISTS ims_trg_stock_reservation_updated_at ON ims_stock_reservation;
CREATE TRIGGER ims_trg_stock_reservation_updated_at
  BEFORE UPDATE ON ims_stock_reservation
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

-- Lets a transfer be tied to what caused it (e.g. referenceType 'OTP Packing
-- List', referenceNo = the OTP order number), so analysis can answer "how
-- much moved from where to where, for which order".
ALTER TABLE ims_stock_transfer ADD COLUMN IF NOT EXISTS "referenceType" TEXT;
ALTER TABLE ims_stock_transfer ADD COLUMN IF NOT EXISTS "referenceNo" TEXT;
CREATE INDEX IF NOT EXISTS ims_stock_transfer_reference_idx ON ims_stock_transfer ("referenceType", "referenceNo");
