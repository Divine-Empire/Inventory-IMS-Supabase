-- AlterTable (additive only)
ALTER TABLE "ims_indent_po_sync" ADD COLUMN "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "ims_indent_po_sync" ADD CONSTRAINT "ims_indent_po_sync_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ims_location_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
