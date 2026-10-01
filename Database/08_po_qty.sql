-- PO Qty = quantity still pending at PFMS's Follow-Up Vendor stage
-- (PO + Negotiation exist, approved qty not fully lifted yet). Additive.
ALTER TABLE ims_pfms_pending_snapshot ADD COLUMN IF NOT EXISTS "poQty" double precision NOT NULL DEFAULT 0;
