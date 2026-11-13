import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function getDashboard(_req: Request, res: Response) {
  const [products, recentMovements, sync] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.syncMeta.findUnique({ where: { id: 1 } }),
  ]);

  const totalSkus = products.length;
  const inventoryValue = products.reduce(
    (sum, p) => sum + p.stock * p.unitProductionCost,
    0,
  );
  const marketValue = products.reduce(
    (sum, p) => sum + p.stock * p.marketPrice,
    0,
  );
  const lowStock = products.filter((p) => p.stock > 0 && p.stock < 50);
  const insumos = products.filter((p) => p.category === "insumo").length;
  const terminados = products.filter((p) => p.category === "terminado").length;

  res.json({
    metrics: {
      totalSkus,
      insumos,
      terminados,
      inventoryValue,
      marketValue,
      potentialMargin: marketValue - inventoryValue,
      lowStockCount: lowStock.length,
    },
    lowStock,
    recentMovements,
    sync,
  });
}
