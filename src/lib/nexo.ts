import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadResourceNames } from "./resources.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NEXO_CSV_PATH = path.resolve(
  __dirname,
  "../../data/nexo-products.csv",
);

export type NexoProduct = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  active: boolean;
  simcoResourceId: number;
  erpCategory: "insumo" | "terminado";
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Categorías Nexo → insumo/terminado del Micro-ERP. */
function toErpCategory(nexoCategory: string, name: string): "insumo" | "terminado" {
  const c = normalize(nexoCategory);
  if (/(electronica|alimento|moda|estacional)/.test(c)) return "terminado";
  if (/(energia|recursos|agricultura|construccion|fabrica)/.test(c)) {
    if (/(telefono|robot|reloj|cuadricoptero|vigas|unidades|ladrillo|concreto)/.test(normalize(name))) {
      return "terminado";
    }
    return "insumo";
  }
  return "insumo";
}

function skuFallbackId(sku: string): number {
  // IDs altos estables para SKUs sin kind oficial
  let hash = 0;
  for (const ch of sku) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 900000 + (hash % 90000);
}

export async function loadNexoProducts(
  csvPath = NEXO_CSV_PATH,
): Promise<NexoProduct[]> {
  const raw = await readFile(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => normalize(h));
  const idx = (label: string) => header.findIndex((h) => h.includes(label));

  const iSku = idx("sku");
  const iName = idx("nombre");
  const iCat = idx("categoria");
  const iUnit = idx("unidad");
  const iCost = idx("costo");
  const iPrice = idx("precio");
  const iStock = idx("existencia");
  const iMin = idx("minimo");
  const iActive = idx("activo");

  const names = await loadResourceNames();
  const nameToKind = new Map<string, number>();
  for (const [kind, name] of Object.entries(names)) {
    nameToKind.set(normalize(name), Number(kind));
  }
  // alias comunes del CSV Nexo
  const aliases: Record<string, number> = {
    verduras: 120,
    vegetales: 120,
    "cafe en polvo": 119,
    "granos de cafe": 118,
    "telefonos inteligentes": 24,
    smartphones: 24,
    "petroleo crudo": 10,
    "disfraz de bruja": 148,
    "adorno de navidad": 144,
    calabaza: 146,
    "calabaza de halloween": 147,
    cuero: 46,
    arena: 44,
    transporte: 13,
    grano: 6,
  };
  for (const [k, v] of Object.entries(aliases)) nameToKind.set(k, v);

  const products: NexoProduct[] = [];
  for (const cols of rows.slice(1)) {
    const sku = (cols[iSku] || "").trim();
    const name = (cols[iName] || "").trim();
    if (!sku || !name) continue;

    const key = normalize(name);
    let simcoResourceId = nameToKind.get(key);
    if (simcoResourceId == null && /^\d+$/.test(sku)) {
      simcoResourceId = Number(sku);
    }
    if (simcoResourceId == null) simcoResourceId = skuFallbackId(sku);

    const nexoCategory = (cols[iCat] || "").trim();
    products.push({
      sku,
      name,
      category: nexoCategory,
      unit: (cols[iUnit] || "pieza").trim(),
      cost: Number(cols[iCost]) || 0,
      price: Number(cols[iPrice]) || 0,
      stock: Number(cols[iStock]) || 0,
      minStock: Number(cols[iMin]) || 0,
      active: (cols[iActive] || "1").trim() !== "0",
      simcoResourceId,
      erpCategory: toErpCategory(nexoCategory, name),
    });
  }

  return products;
}
