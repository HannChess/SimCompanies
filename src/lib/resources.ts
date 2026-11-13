import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NAMES_PATH = path.resolve(__dirname, "../../data/resource-names.es.json");

let cache: Record<string, string> | null = null;

export async function loadResourceNames(): Promise<Record<string, string>> {
  if (cache) return cache;
  const raw = await readFile(NAMES_PATH, "utf8");
  cache = JSON.parse(raw) as Record<string, string>;
  return cache;
}

export async function resourceName(kind: number): Promise<string> {
  const names = await loadResourceNames();
  return names[String(kind)] ?? `Recurso #${kind}`;
}

/** Insumos típicos vs productos más elaborados (heurística para el Micro-ERP). */
export function categorizeResource(kind: number): "insumo" | "terminado" {
  const terminados = new Set([
    3, 4, 5, 7, 8, 9, 11, 12, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 35, 41,
    43, 45, 55, 56, 69, 70, 71, 98, 101, 102, 107, 108, 111, 112, 114, 117, 119,
    144, 148,
  ]);
  return terminados.has(kind) ? "terminado" : "insumo";
}

export function unitCostFromWarehouseRow(row: {
  amount?: number;
  cost?: number | Record<string, number>;
}): number {
  const amount = Number(row.amount) || 0;
  if (typeof row.cost === "number") {
    return amount > 0 ? row.cost / amount : row.cost;
  }
  if (row.cost && typeof row.cost === "object") {
    const total = Object.values(row.cost).reduce(
      (s, v) => s + (Number(v) || 0),
      0,
    );
    return amount > 0 ? total / amount : total;
  }
  return 0;
}
