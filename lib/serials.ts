import { prisma } from "@/lib/prisma";

export class SerialScanError extends Error {}

async function resolveLocation(locationCode: string) {
  const location = await prisma.locationMaster.findUnique({ where: { locationCode } });
  if (!location) throw new SerialScanError(`Unknown location "${locationCode}"`);
  return location;
}

export async function serialScanIn(params: {
  itemCode: string;
  locationCode: string;
  serialNo: string;
  warrantyExpiryDate: string | null; // ISO date, mutually exclusive-ish with invoiceDate
  invoiceDate: string | null;
  createdBy?: string;
}) {
  const serialNo = params.serialNo.trim();
  if (!serialNo) throw new SerialScanError("Serial number is required");
  if (!params.warrantyExpiryDate && !params.invoiceDate) {
    throw new SerialScanError("Either Warranty Expiry Date or Invoice Date is required");
  }

  const item = await prisma.itemMaster.findUnique({ where: { itemCode: params.itemCode } });
  if (!item) throw new SerialScanError(`Unknown item code "${params.itemCode}"`);

  const location = await resolveLocation(params.locationCode);

  const existing = await prisma.serialNumber.findUnique({ where: { serialNo } });
  if (existing && existing.status === "IN_STOCK") {
    throw new SerialScanError(
      `Serial "${serialNo}" is already IN STOCK (item ${existing.itemCode}). Scan it OUT first before scanning IN again.`
    );
  }

  const ledgerEntry = await prisma.stockLedger.create({
    data: {
      itemCode: item.itemCode,
      locationId: location.id,
      txnType: "IN",
      qty: 1,
      serialNo,
      referenceType: "Serial IN",
      createdBy: params.createdBy,
    },
  });

  const warrantyExpiryDate = params.warrantyExpiryDate ? new Date(params.warrantyExpiryDate) : null;
  const invoiceDate = params.invoiceDate ? new Date(params.invoiceDate) : null;

  const serial = existing
    ? await prisma.serialNumber.update({
        where: { serialNo },
        data: {
          itemCode: item.itemCode,
          currentLocationId: location.id,
          status: "IN_STOCK",
          warrantyExpiryDate,
          invoiceDate,
          inTxnId: ledgerEntry.id,
          outTxnId: null,
        },
      })
    : await prisma.serialNumber.create({
        data: {
          itemCode: item.itemCode,
          serialNo,
          currentLocationId: location.id,
          status: "IN_STOCK",
          warrantyExpiryDate,
          invoiceDate,
          inTxnId: ledgerEntry.id,
        },
      });

  return serial;
}

function expiryKey(s: { warrantyExpiryDate: Date | null; invoiceDate: Date | null }): number {
  const d = s.warrantyExpiryDate ?? s.invoiceDate;
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
}

export async function serialScanOut(params: {
  locationCode: string;
  serialNo: string;
  override?: boolean;
  createdBy?: string;
}) {
  const serialNo = params.serialNo.trim();
  const location = await resolveLocation(params.locationCode);

  const serial = await prisma.serialNumber.findUnique({ where: { serialNo } });
  if (!serial) throw new SerialScanError(`Unknown serial number "${serialNo}" — it was never scanned IN.`);

  if (serial.status !== "IN_STOCK") {
    throw new SerialScanError(`Serial "${serialNo}" is not in stock (current status: ${serial.status}).`);
  }

  if (serial.currentLocationId !== location.id) {
    const actualLocation = serial.currentLocationId
      ? await prisma.locationMaster.findUnique({ where: { id: serial.currentLocationId } })
      : null;
    throw new SerialScanError(
      `Serial "${serialNo}" is in stock at ${actualLocation?.locationCode ?? "an unknown location"}, not at ${params.locationCode}.`
    );
  }

  // FIFO / oldest-stock-first advisory: if older stock of the same item+location
  // exists, warn before letting a newer-dated serial go OUT first.
  const siblings = await prisma.serialNumber.findMany({
    where: { itemCode: serial.itemCode, currentLocationId: location.id, status: "IN_STOCK" },
  });
  const sorted = [...siblings].sort((a, b) => expiryKey(a) - expiryKey(b));
  const oldest = sorted[0];

  if (oldest && oldest.serialNo !== serial.serialNo && !params.override) {
    return {
      needsConfirmation: true as const,
      message: `Older stock is already available for this item: Serial "${oldest.serialNo}" (${
        oldest.warrantyExpiryDate ? "warranty expiry" : "invoice date"
      } ${(oldest.warrantyExpiryDate ?? oldest.invoiceDate)?.toISOString().slice(0, 10)}). Use that one first, or confirm to proceed with this scan anyway.`,
      oldestSerial: oldest,
    };
  }

  const ledgerEntry = await prisma.stockLedger.create({
    data: {
      itemCode: serial.itemCode,
      locationId: location.id,
      txnType: "OUT",
      qty: 1,
      serialNo,
      referenceType: "Serial OUT",
      createdBy: params.createdBy,
    },
  });

  const updated = await prisma.serialNumber.update({
    where: { serialNo },
    data: { status: "OUT", outTxnId: ledgerEntry.id },
  });

  return { needsConfirmation: false as const, serial: updated };
}
