import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const movementSchema = z.object({
  productId: z.number().int().positive(),
  type: z.enum(["production", "purchase", "sale", "discard"]),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

const INBOUND = new Set(["production", "purchase"]);

export async function listMovements(req: Request, res: Response) {
  const productId = req.query.productId
    ? Number(req.query.productId)
    : undefined;

  const movements = await prisma.stockMovement.findMany({
    where: productId ? { productId } : undefined,
    include: { product: { select: { id: true, name: true, category: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(movements);
}

export async function createMovement(req: Request, res: Response) {
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { productId, type, quantity, note } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("NOT_FOUND");

      const delta = INBOUND.has(type) ? quantity : -quantity;
      const nextStock = product.stock + delta;
      if (nextStock < 0) throw new Error("INSUFFICIENT_STOCK");

      const unitPrice =
        parsed.data.unitPrice ??
        (INBOUND.has(type) ? product.unitProductionCost : product.marketPrice);

      const movement = await tx.stockMovement.create({
        data: {
          productId,
          type,
          quantity,
          unitPrice,
          note: note ?? null,
        },
        include: { product: { select: { id: true, name: true } } },
      });

      const updated = await tx.product.update({
        where: { id: productId },
        data: { stock: nextStock },
      });

      return { movement, product: updated };
    });

    res.status(201).json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message === "NOT_FOUND") {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }
    if (message === "INSUFFICIENT_STOCK") {
      res.status(400).json({ error: "Stock insuficiente para esa salida" });
      return;
    }
    res.status(500).json({ error: "No se pudo registrar el movimiento" });
  }
}
