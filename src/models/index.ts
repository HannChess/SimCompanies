/**
 * Capa de modelos (rúbrica: src/models).
 * Prisma es el ORM; aquí se reexportan entidades del dominio Inventario.
 */
export { prisma } from "../lib/prisma.js";
export type { Product, StockMovement, PriceSnapshot, SyncMeta } from "@prisma/client";
