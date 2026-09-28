import { prisma } from "@/lib/prisma";

export class StockTransferError extends Error {}

async function nextTransferNo(): Promise<string> {
  const count = await prisma.stockTransfer.count();
  const seq = String(count + 1).padStart(5, "0");
  return `ST-${seq}`;
}

export async function createTransfer(params: {
  fromLocationCode: string;
  toLocationCode: string;
  requestedBy?: string;
  items: { itemCode: string; qty: number; serialNumbers?: string[] }[];
}) {
  if (params.fromLocationCode === params.toLocationCode) {
    throw new StockTransferError("From and To location must be different");
  }
  if (!params.items.length) {
    throw new StockTransferError("Add at least one item to transfer");
  }

  const [fromLocation, toLocation] = await Promise.all([
    prisma.locationMaster.findUnique({ where: { locationCode: params.fromLocationCode } }),
    prisma.locationMaster.findUnique({ where: { locationCode: params.toLocationCode } }),
  ]);
  if (!fromLocation) throw new StockTransferError(`Unknown location "${params.fromLocationCode}"`);
  if (!toLocation) throw new StockTransferError(`Unknown location "${params.toLocationCode}"`);

  for (const item of params.items) {
    if (item.serialNumbers && item.serialNumbers.length > 0 && item.serialNumbers.length !== item.qty) {
      throw new StockTransferError(
        `Item ${item.itemCode}: qty (${item.qty}) must match the number of serial numbers listed (${item.serialNumbers.length})`
      );
    }
  }

  const transferNo = await nextTransferNo();

  return prisma.stockTransfer.create({
    data: {
      transferNo,
      fromLocationId: fromLocation.id,
      toLocationId: toLocation.id,
      status: "pending",
      requestedBy: params.requestedBy,
      items: {
        create: params.items.map((i) => ({
          itemCode: i.itemCode,
          qty: i.qty,
          serialNumbers: i.serialNumbers ?? [],
        })),
      },
    },
    include: { items: true, fromLocation: true, toLocation: true },
  });
}

export async function shipTransfer(transferId: string, approvedBy?: string) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "pending") {
    throw new StockTransferError(`Transfer is already "${transfer.status}" — cannot ship again`);
  }

  for (const item of transfer.items) {
    for (const serialNo of item.serialNumbers) {
      const serial = await prisma.serialNumber.findUnique({ where: { serialNo } });
      if (!serial || serial.status !== "IN_STOCK" || serial.currentLocationId !== transfer.fromLocationId) {
        throw new StockTransferError(`Serial "${serialNo}" is not in stock at the source location`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      await tx.stockLedger.create({
        data: {
          itemCode: item.itemCode,
          locationId: transfer.fromLocationId,
          txnType: "TRANSFER_OUT",
          qty: item.qty,
          referenceType: "Stock Transfer",
          referenceNo: transfer.transferNo,
        },
      });

      for (const serialNo of item.serialNumbers) {
        await tx.serialNumber.update({
          where: { serialNo },
          data: { status: "TRANSFERRED", currentLocationId: null },
        });
      }
    }

    await tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "in_transit", approvedBy },
    });
  });

  return prisma.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
}

export async function receiveTransfer(transferId: string, receivedBy?: string) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "in_transit") {
    throw new StockTransferError(`Transfer must be "in_transit" to receive (currently "${transfer.status}")`);
  }

  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      await tx.stockLedger.create({
        data: {
          itemCode: item.itemCode,
          locationId: transfer.toLocationId,
          txnType: "TRANSFER_IN",
          qty: item.qty,
          referenceType: "Stock Transfer",
          referenceNo: transfer.transferNo,
        },
      });

      for (const serialNo of item.serialNumbers) {
        await tx.serialNumber.update({
          where: { serialNo },
          data: { status: "IN_STOCK", currentLocationId: transfer.toLocationId },
        });
      }
    }

    await tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "received", receivedBy },
    });
  });

  return prisma.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
}

export async function cancelTransfer(transferId: string) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new StockTransferError("Transfer not found");
  if (transfer.status !== "pending") {
    throw new StockTransferError(`Only a "pending" transfer can be cancelled (currently "${transfer.status}")`);
  }
  return prisma.stockTransfer.update({ where: { id: transferId }, data: { status: "cancelled" } });
}
