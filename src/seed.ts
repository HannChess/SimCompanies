import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/prisma.js";
import { parseCompany } from "./lib/account.js";
import { loadNexoProducts, NEXO_CSV_PATH } from "./lib/nexo.js";
import { fetchMarketSuggestedPrices } from "./lib/simco.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "../data");

/**
 * Fuente de verdad: export CSV de Nexo (data/nexo-products.csv).
 * Opcional: data/my-company.json para el perfil SimCompanies.
 */
async function seed() {
  console.log("Seed desde Nexo CSV:", NEXO_CSV_PATH);

  const nexo = await loadNexoProducts();
  if (nexo.length === 0) {
    throw new Error("No se leyeron productos de data/nexo-products.csv");
  }

  let companyRaw: unknown = {};
  try {
    companyRaw = JSON.parse(
      await readFile(path.join(DATA, "my-company.json"), "utf8"),
    );
  } catch {
    console.warn("Sin data/my-company.json");
  }
  const company = parseCompany(companyRaw);

  await prisma.stockMovement.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.gameWarehouseItem.deleteMany();
  await prisma.product.deleteMany();

  const now = new Date();
  let loaded = 0;

  for (const item of nexo) {
    if (!item.active && item.stock <= 0) continue;

    const product = await prisma.product.create({
      data: {
        simcoResourceId: item.simcoResourceId,
        name: item.name,
        category: item.erpCategory,
        unitProductionCost: item.cost,
        marketPrice: item.price,
        transportCost: 0,
        stock: item.stock,
        imageUrl: `/img/resources/${item.simcoResourceId}.svg`,
        lastSyncedAt: now,
      },
    });

    await prisma.gameWarehouseItem.create({
      data: {
        simcoResourceId: item.simcoResourceId,
        name: item.name,
        quantity: item.stock,
        quality: 0,
        unitCost: item.cost,
      },
    });

    if (item.stock > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: "purchase",
          quantity: item.stock,
          unitPrice: item.cost,
          note: `Seed Nexo SKU ${item.sku} · cat. ${item.category}`,
        },
      });
    }

    loaded += 1;
  }

  await prisma.companyProfile.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      companyId: company.companyId,
      name: company.name ?? "LNI103.NEMKI GLOBAL",
      level: company.level,
      experience: company.experience,
      experienceToNextLevel: company.experienceToNextLevel,
      cash: company.cash,
      reputation: company.reputation,
      realm: company.realm ?? 0,
      rawJson: JSON.stringify(companyRaw),
      lastSyncedAt: now,
      source: "seed:nexo-products.csv",
    },
    update: {
      companyId: company.companyId ?? null,
      name: company.name ?? null,
      level: company.level ?? null,
      experience: company.experience ?? null,
      experienceToNextLevel: company.experienceToNextLevel ?? null,
      cash: company.cash ?? null,
      reputation: company.reputation ?? null,
      realm: company.realm ?? 0,
      rawJson: JSON.stringify(companyRaw),
      lastSyncedAt: now,
      source: "seed:nexo-products.csv",
    },
  });

  // Enriquecer precio sugerido de mercado desde API SimCompanies (si responde)
  let marketUpdated = 0;
  let marketSource = "nexo-price-fallback";
  try {
    const kinds = nexo.map((p) => p.simcoResourceId);
    const { prices, source } = await fetchMarketSuggestedPrices(kinds);
    marketSource = source;
    for (const item of nexo) {
      const next = prices.get(item.simcoResourceId);
      if (next == null || next <= 0) continue;
      await prisma.product.update({
        where: { simcoResourceId: item.simcoResourceId },
        data: { marketPrice: next, lastSyncedAt: new Date() },
      });
      marketUpdated += 1;
    }
    console.log(`Precios mercado SimCompanies: ${marketUpdated} · ${marketSource}`);
  } catch (err) {
    console.warn(
      "API SimCompanies no disponible para precios; se conservan precios Nexo.",
      (err as Error).message,
    );
  }

  await prisma.syncMeta.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      companyName: company.name ?? "LNI103.NEMKI GLOBAL",
      companyLevel: company.level ?? null,
      realm: company.realm ?? 0,
      lastSyncAt: now,
      lastSource: marketSource,
      notes: `Nexo: ${loaded} productos · precios mercado: ${marketUpdated}`,
    },
    update: {
      companyName: company.name ?? "LNI103.NEMKI GLOBAL",
      companyLevel: company.level ?? null,
      realm: company.realm ?? 0,
      lastSyncAt: now,
      lastSource: marketSource,
      notes: `Nexo: ${loaded} productos · precios mercado: ${marketUpdated}`,
    },
  });

  console.log(`Seed OK · ${loaded} productos desde Nexo · ${company.name ?? "—"}`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
