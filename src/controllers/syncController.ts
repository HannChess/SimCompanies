import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { fetchMarketSuggestedPrices } from "../lib/simco.js";

/**
 * Actualiza solo el precio sugerido de mercado (API SimCompanies).
 * No toca stock ni costo de producción (esos vienen de Nexo).
 */
export async function syncPrices(_req: Request, res: Response) {
  try {
    const products = await prisma.product.findMany({
      select: { id: true, simcoResourceId: true, name: true, marketPrice: true },
    });
    const kinds = products.map((p) => p.simcoResourceId);
    const { prices, source } = await fetchMarketSuggestedPrices(kinds);
    const now = new Date();
    let updated = 0;
    const samples: Array<{ name: string; from: number; to: number }> = [];

    for (const product of products) {
      const next = prices.get(product.simcoResourceId);
      if (next == null || !Number.isFinite(next) || next <= 0) continue;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          marketPrice: next,
          lastSyncedAt: now,
        },
      });

      await prisma.priceSnapshot.create({
        data: {
          productId: product.id,
          price: next,
          source,
        },
      });

      if (samples.length < 5) {
        samples.push({
          name: product.name,
          from: product.marketPrice,
          to: next,
        });
      }
      updated += 1;
    }

    const company = await prisma.companyProfile.findUnique({ where: { id: 1 } });

    await prisma.syncMeta.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        companyName: company?.name,
        companyLevel: company?.level,
        realm: company?.realm ?? 0,
        lastSyncAt: now,
        lastSource: source,
        notes: `Precios mercado SimCompanies: ${updated}`,
      },
      update: {
        lastSyncAt: now,
        lastSource: source,
        notes: `Precios mercado SimCompanies: ${updated}`,
      },
    });

    res.json({
      ok: true,
      source,
      updated,
      totalProducts: products.length,
      samples,
      hint:
        updated === 0
          ? "No hubo precios nuevos (API bloqueada o sin match de kind). Se mantiene el precio Nexo."
          : undefined,
    });
  } catch (err) {
    res.status(502).json({
      error: "No se pudieron obtener precios de mercado de SimCompanies",
      detail: (err as Error).message,
      hint: "El inventario Nexo no se modifica. Reintenta cuando la API responda; hay cache local si ya hubo una sync previa.",
    });
  }
}
