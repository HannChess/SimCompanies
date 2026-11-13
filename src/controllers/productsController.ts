import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const productSchema = z.object({
  simcoResourceId: z.number().int().positive(),
  name: z.string().min(1),
  category: z.enum(["insumo", "terminado"]),
  unitProductionCost: z.number().nonnegative().default(0),
  marketPrice: z.number().nonnegative().default(0),
  transportCost: z.number().nonnegative().default(0),
  stock: z.number().nonnegative().optional(),
  imageUrl: z.string().url().optional().nullable(),
});

const productUpdateSchema = productSchema.partial();

export async function listProducts(req: Request, res: Response) {
  const category = req.query.category as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();

  const products = await prisma.product.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  res.json(products);
}

export async function getProduct(req: Request, res: Response) {
  const id = Number(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id },
    include: { movements: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(product);
}

export async function createProduct(req: Request, res: Response) {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const product = await prisma.product.create({
      data: {
        ...parsed.data,
        stock: parsed.data.stock ?? 0,
        imageUrl: parsed.data.imageUrl ?? null,
      },
    });
    res.status(201).json(product);
  } catch {
    res.status(409).json({ error: "Ya existe un producto con ese simcoResourceId" });
  }
}

export async function updateProduct(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: parsed.data,
    });
    res.json(product);
  } catch {
    res.status(404).json({ error: "Producto no encontrado" });
  }
}

export async function deleteProduct(req: Request, res: Response) {
  const id = Number(req.params.id);
  try {
    await prisma.product.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Producto no encontrado" });
  }
}
