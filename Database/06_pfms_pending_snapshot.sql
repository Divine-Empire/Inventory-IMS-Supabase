-- Replaces the old pfms_for_ims-based sync (which just passed through
-- static "indent qty"/"po qty"/"intransit qty" columns) with a computation
-- driven by PFMS's own REAL "pending" conditions per stage:
--   - Indent Raised  = pfms_indent-approval.approvedQty for indents
--                       pending at Update 3 Vendors (approved, no
--                       pfms_update-3-vendors row yet)
--   - Intransit Qty  = pfms_lift.liftingQty for lifts pending at
--                       Transporter Follow-Up (status != 'received')
--   - Lead Time Days = nearest (soonest) of: Material Received pending's
--                       plannedMaterialRcd, Transporter Follow-Up
--                       pending's expectedDeliveryDate, Follow-Up Vendor
--                       pending's negotiated-vendor deliveryDate, or
--                       Indent Approval pending's static leadTime — all
--                       converted to "days from today"
--
-- This is a SNAPSHOT of current PFMS state, not an accumulating ledger —
-- an item+location row that's no longer pending anywhere should disappear,
-- not linger with stale numbers. So the sync does a full delete+reinsert
-- each run rather than upsert-only.
CREATE TABLE IF NOT EXISTS ims_pfms_pending_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemCode" text NOT NULL,
  "locationId" text NOT NULL REFERENCES ims_location_master(id),
  "indentRaisedQty" double precision NOT NULL DEFAULT 0,
  "intransitQty" double precision NOT NULL DEFAULT 0,
  "leadTimeDays" double precision,
  "computedAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("itemCode", "locationId")
);
