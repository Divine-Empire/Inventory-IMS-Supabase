# IMS Database Schema — Batch 1

Same Supabase Postgres instance as Purchase-FMS-Supabase. All new tables
are prefixed `ims_`, no cross-DB foreign keys — joins to `pfms_*` /
`otp_*` / `lto_*` tables happen via scheduled sync jobs keyed on business
keys (`itemCode`, `indentNo`, `quotationNo`, `invoiceNo`), never raw IDs.

## Tables

| Table | Purpose |
|---|---|
| `ims_User` | App users, role + `pageAccess` + optional `locationAccess` |
| `ims_item_master` | Canonical item catalog for IMS — extends `pfms_item_master` with UOM, min/max/reorder level, safety stock, cost, EOQ inputs. `itemCode` must match PFMS's `ITEM CODE`. |
| `ims_location_master` | Fixed set today: CG, NE, MANIQUIP, HO |
| `ims_stock_ledger` | Every stock movement (IN/OUT/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT). Live stock is always `SUM(qty)` from here, never a stored running total. |
| `ims_serial_number` | One row per serial, with warranty/invoice date, `status` (IN_STOCK/OUT/TRANSFERRED) and current location — powers the duplicate/expired-stock OUT-scan alert. |
| `ims_indent_po_sync` | Synced snapshot from PFMS (`pfms_for_ims` + `pfms_material-received`), keyed by `indentNo`. Source of Indent Raised Qty, PO Qty, In-Transit Qty, Lead Time. |
| `ims_stock_transfer` / `ims_stock_transfer_item` | Location-to-location transfer workflow with serial tracking. |
| `ims_sales_transaction` | Synced per-invoice, per-item sale rows. `rate`/`amount` come from LTO's `lto_make_quotation_items` (real line value); `invoiceNo`/`invoiceDate` confirm the sale via OTP's `otp_make_invoice`. |
| `ims_abc_snapshot` | Periodic (monthly) computed ABC class + EOQ per item. |
| `ims_audit_log` | IN/OUT/transfer/adjustment action trail. |

## Key formulas (computed at query time, not stored)

- **Live Stock** (item, location) = `SUM(qty)` from `ims_stock_ledger` where txnType is IN/TRANSFER_IN/ADJUSTMENT(+) minus OUT/TRANSFER_OUT/ADJUSTMENT(-)
- **Target Qty** = Live Stock + Material-in-Transit (`ims_indent_po_sync.intransitQty`)
- **Reorder Qty** = Max Level − (Live Stock + Indent Raised Qty)
- **Status** (Fast/Slow/Non-Moving) = derived from `ims_stock_ledger` OUT frequency over a rolling window (thresholds TBD in Batch 6)
- **ABC Class**: rank items by `ims_sales_transaction.amount` (descending), cumulative % of total revenue — A ≤ 70%, B ≤ 90%, C ≤ 100%
- **EOQ** = `SQRT(2 × Annual Demand × orderingCost / (standardCost × holdingCostPct))`

## Known cross-system linking risk

Item identity across PFMS/OTP/LTO is matched by **name string**, not a
shared ID (confirmed in all three codebases). `ims_sales_transaction`
keeps the raw incoming name (`itemNameRaw`) alongside the reconciled
`itemCode`, so unmatched rows are visible and fixable rather than
silently dropped.
