-- "Total Sales Qty/Value" on the Inventory page = items sitting in OTP's
-- Pre-Invoice PENDING queue (about to be sold, not yet invoiced) — a
-- distinct concept from ims_sales_transaction (actual completed/invoiced
-- sales, kept as-is for future ABC/EOQ use). Item-level only — the
-- pre-invoice queue doesn't reliably carry a warehouse location, so this
-- total is the same across every location-row of that item.
-- Snapshot table (not a ledger) — full delete+reinsert on every sync run.
CREATE TABLE IF NOT EXISTS ims_sales_pending_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemCode" text NOT NULL UNIQUE,
  qty double precision NOT NULL DEFAULT 0,
  amount double precision NOT NULL DEFAULT 0,
  "computedAt" timestamp NOT NULL DEFAULT now()
);
