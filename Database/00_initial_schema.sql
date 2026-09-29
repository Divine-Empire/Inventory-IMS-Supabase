-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ims_User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "pageAccess" TEXT,
    "locationAccess" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_item_master" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemGroup" TEXT,
    "category" TEXT,
    "uom" TEXT,
    "hsnCode" TEXT,
    "imageUrl" TEXT,
    "standardCost" DOUBLE PRECISION,
    "standardPrice" DOUBLE PRECISION,
    "orderingCost" DOUBLE PRECISION,
    "holdingCostPct" DOUBLE PRECISION,
    "defaultLeadTimeDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_item_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_item_location_setting" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "reorderLevel" DOUBLE PRECISION,
    "safetyStock" DOUBLE PRECISION,
    "avgSalePeak" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_item_location_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_location_master" (
    "id" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_location_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_stock_ledger" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "serialNo" TEXT,
    "referenceType" TEXT,
    "referenceNo" TEXT,
    "balanceAfter" DOUBLE PRECISION,
    "remarks" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ims_stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_serial_number" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "currentLocationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "warrantyExpiryDate" TIMESTAMP(3),
    "invoiceDate" TIMESTAMP(3),
    "inTxnId" TEXT,
    "outTxnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_serial_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_indent_po_sync" (
    "id" TEXT NOT NULL,
    "indentNo" TEXT NOT NULL,
    "itemCode" TEXT,
    "indentQty" DOUBLE PRECISION,
    "poNumber" TEXT,
    "poQty" DOUBLE PRECISION,
    "intransitQty" DOUBLE PRECISION,
    "receivedQty" DOUBLE PRECISION,
    "leadTimeDays" INTEGER,
    "plannedDeliveryDate" TIMESTAMP(3),
    "actualDeliveryDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_indent_po_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_stock_transfer" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "receivedBy" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_stock_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_stock_transfer_item" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ims_stock_transfer_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_sales_transaction" (
    "id" TEXT NOT NULL,
    "quotationNo" TEXT,
    "itemCode" TEXT,
    "itemNameRaw" TEXT,
    "qty" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "invoiceNo" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "locationId" TEXT,
    "sourceSystem" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ims_sales_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_abc_snapshot" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "qtySold" DOUBLE PRECISION NOT NULL,
    "cumPct" DOUBLE PRECISION NOT NULL,
    "abcClass" TEXT NOT NULL,
    "eoq" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ims_abc_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ims_audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ims_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ims_User_username_key" ON "ims_User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ims_item_master_itemCode_key" ON "ims_item_master"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "ims_item_location_setting_itemCode_locationId_key" ON "ims_item_location_setting"("itemCode", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ims_location_master_locationCode_key" ON "ims_location_master"("locationCode");

-- CreateIndex
CREATE INDEX "ims_stock_ledger_itemCode_locationId_idx" ON "ims_stock_ledger"("itemCode", "locationId");

-- CreateIndex
CREATE INDEX "ims_stock_ledger_referenceType_referenceNo_idx" ON "ims_stock_ledger"("referenceType", "referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "ims_serial_number_serialNo_key" ON "ims_serial_number"("serialNo");

-- CreateIndex
CREATE INDEX "ims_serial_number_itemCode_status_idx" ON "ims_serial_number"("itemCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ims_indent_po_sync_indentNo_key" ON "ims_indent_po_sync"("indentNo");

-- CreateIndex
CREATE UNIQUE INDEX "ims_stock_transfer_transferNo_key" ON "ims_stock_transfer"("transferNo");

-- CreateIndex
CREATE INDEX "ims_sales_transaction_itemCode_invoiceDate_idx" ON "ims_sales_transaction"("itemCode", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "ims_abc_snapshot_itemCode_period_key" ON "ims_abc_snapshot"("itemCode", "period");

-- AddForeignKey
ALTER TABLE "ims_item_location_setting" ADD CONSTRAINT "ims_item_location_setting_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_item_location_setting" ADD CONSTRAINT "ims_item_location_setting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ims_location_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_ledger" ADD CONSTRAINT "ims_stock_ledger_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_ledger" ADD CONSTRAINT "ims_stock_ledger_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ims_location_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_serial_number" ADD CONSTRAINT "ims_serial_number_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_serial_number" ADD CONSTRAINT "ims_serial_number_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "ims_location_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_indent_po_sync" ADD CONSTRAINT "ims_indent_po_sync_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_transfer" ADD CONSTRAINT "ims_stock_transfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "ims_location_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_transfer" ADD CONSTRAINT "ims_stock_transfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "ims_location_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_transfer_item" ADD CONSTRAINT "ims_stock_transfer_item_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "ims_stock_transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_stock_transfer_item" ADD CONSTRAINT "ims_stock_transfer_item_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_sales_transaction" ADD CONSTRAINT "ims_sales_transaction_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_sales_transaction" ADD CONSTRAINT "ims_sales_transaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ims_location_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ims_abc_snapshot" ADD CONSTRAINT "ims_abc_snapshot_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "ims_item_master"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;

