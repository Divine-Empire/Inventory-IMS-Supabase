-- Prisma's @updatedAt used to stamp this client-side on every update.
-- Replaced with the same generic trigger pattern OTP_Supabase uses
-- (otp_trg_set_updated_at) so it now happens at the DB level regardless
-- of which client (Supabase JS, SQL editor, etc.) performs the update.

CREATE OR REPLACE FUNCTION ims_trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ims_trg_user_updated_at ON "ims_User";
CREATE TRIGGER ims_trg_user_updated_at
  BEFORE UPDATE ON "ims_User"
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_item_master_updated_at ON ims_item_master;
CREATE TRIGGER ims_trg_item_master_updated_at
  BEFORE UPDATE ON ims_item_master
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_item_location_setting_updated_at ON ims_item_location_setting;
CREATE TRIGGER ims_trg_item_location_setting_updated_at
  BEFORE UPDATE ON ims_item_location_setting
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_location_master_updated_at ON ims_location_master;
CREATE TRIGGER ims_trg_location_master_updated_at
  BEFORE UPDATE ON ims_location_master
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_serial_number_updated_at ON ims_serial_number;
CREATE TRIGGER ims_trg_serial_number_updated_at
  BEFORE UPDATE ON ims_serial_number
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_indent_po_sync_updated_at ON ims_indent_po_sync;
CREATE TRIGGER ims_trg_indent_po_sync_updated_at
  BEFORE UPDATE ON ims_indent_po_sync
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_stock_transfer_updated_at ON ims_stock_transfer;
CREATE TRIGGER ims_trg_stock_transfer_updated_at
  BEFORE UPDATE ON ims_stock_transfer
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();

DROP TRIGGER IF EXISTS ims_trg_sales_transaction_updated_at ON ims_sales_transaction;
CREATE TRIGGER ims_trg_sales_transaction_updated_at
  BEFORE UPDATE ON ims_sales_transaction
  FOR EACH ROW EXECUTE FUNCTION ims_trg_set_updated_at();
