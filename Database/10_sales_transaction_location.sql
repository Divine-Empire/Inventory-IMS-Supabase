-- Lets lib/sync-sales.ts attach a warehouse location to each historical
-- sale (from otp_pre_invoice_queue.dispatch_location, via the 1:1 FK
-- otp_make_invoice.pre_invoice_queue_id), so Average Sale/Day for the Max
-- Level formula can be computed per item+location instead of company-wide.
-- NULL is expected and valid — "Direct Dispatch" and unset dispatch_location
-- values have no corresponding physical warehouse.
ALTER TABLE ims_sales_transaction ADD COLUMN IF NOT EXISTS "locationId" text;
