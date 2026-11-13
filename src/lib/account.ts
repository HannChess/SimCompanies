import { simcoGet } from "./simco.js";
import { resourceName, unitCostFromWarehouseRow } from "./resources.js";

export type ParsedCompany = {
  companyId?: number;
  name?: string;
  level?: number;
  experience?: number;
  experienceToNextLevel?: number;
  cash?: number;
  companyValue?: number;
  reputation?: number;
  realm?: number;
};

export type ParsedWarehouseItem = {
  simcoResourceId: number;
  name: string;
  quantity: number;
  quality: number;
  unitCost?: number;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Extrae perfil de compañía desde auth-data (forma variable / actual). */
export function parseCompany(raw: unknown): ParsedCompany {
  const root = (raw ?? {}) as Record<string, unknown>;
  const authCompany = (root.authCompany ?? {}) as Record<string, unknown>;
  const levelInfo = (root.levelInfo ?? {}) as Record<string, unknown>;
  const company = (root.company ?? authCompany ?? root) as Record<string, unknown>;

  return {
    companyId: num(
      company.companyId ??
        company.id ??
        company.company_id ??
        authCompany.companyId ??
        root.company_id,
    ),
    name: str(
      company.company ??
        company.name ??
        company.companyName ??
        authCompany.company ??
        root.companyName ??
        root.name,
    ),
    level: num(company.level ?? authCompany.level ?? levelInfo.level ?? root.level),
    experience: num(
      levelInfo.experience ?? company.experience ?? root.experience,
    ),
    experienceToNextLevel: num(
      levelInfo.experienceToNextLevel ??
        company.experienceToNextLevel ??
        root.experienceToNextLevel,
    ),
    cash: num(
      company.money ??
        company.cash ??
        authCompany.money ??
        root.cash ??
        dig(raw, ["company", "cash"]),
    ),
    companyValue: num(
      company.companyValue ??
        company.value ??
        authCompany.companyValue ??
        root.companyValue ??
        root.value,
    ),
    reputation: num(
      company.reputation ??
        authCompany.rank ??
        company.rank ??
        root.reputation,
    ),
    realm: num(
      company.realmId ??
        company.realm ??
        authCompany.realmId ??
        root.realm ??
        root.realmId,
    ),
  };
}

type LooseItem = Record<string, unknown>;

function asItems(value: unknown): LooseItem[] {
  if (Array.isArray(value)) return value.filter((x) => x && typeof x === "object") as LooseItem[];
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (x) => x && typeof x === "object",
    ) as LooseItem[];
  }
  return [];
}

function candidateArrays(raw: unknown): LooseItem[] {
  if (Array.isArray(raw)) return asItems(raw);

  const root = (raw ?? {}) as Record<string, unknown>;
  const paths: unknown[] = [
    root.resources,
    root.warehouse,
    root.inventory,
    root.goods,
    dig(raw, ["company", "resources"]),
    dig(raw, ["company", "warehouse"]),
    dig(raw, ["company", "inventory"]),
    dig(raw, ["authCompany", "resources"]),
  ];

  const merged: LooseItem[] = [];
  for (const p of paths) merged.push(...asItems(p));
  return merged;
}

async function parseOneItem(item: LooseItem): Promise<ParsedWarehouseItem | null> {
  // En warehouse real, `id` es el lote; el recurso es `kind`.
  const simcoResourceId = num(
    item.kind ?? item.db_letter ?? item.resource ?? item.resourceId ?? item.re,
  );
  const quantity = num(
    item.amount ?? item.quantity ?? item.qty ?? item.stock ?? item.units,
  );
  if (simcoResourceId == null || quantity == null) return null;
  if (quantity <= 0) return null;

  const name =
    str(item.name ?? item.resourceName ?? item.label) ??
    (await resourceName(simcoResourceId));
  const quality = num(item.quality ?? item.q) ?? 0;

  let unitCost = num(item.unitCost ?? item.averageCost ?? item.price);
  if (unitCost == null) {
    unitCost = unitCostFromWarehouseRow({
      amount: quantity,
      cost: item.cost as number | Record<string, number> | undefined,
    });
  }

  return { simcoResourceId, name, quantity, quality, unitCost };
}

/** Intenta localizar filas de almacén dentro de un JSON de cuenta. */
export async function parseWarehouse(raw: unknown): Promise<ParsedWarehouseItem[]> {
  const byId = new Map<number, ParsedWarehouseItem>();
  for (const item of candidateArrays(raw)) {
    const parsed = await parseOneItem(item);
    if (!parsed) continue;
    const prev = byId.get(parsed.simcoResourceId);
    if (!prev) {
      byId.set(parsed.simcoResourceId, parsed);
    } else {
      byId.set(parsed.simcoResourceId, {
        ...prev,
        quantity: prev.quantity + parsed.quantity,
        unitCost: parsed.unitCost ?? prev.unitCost,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const WAREHOUSE_PATHS = [
  "/api/v3/companies/me/resources/",
  "/api/v2/companies/me/resources/",
  "/api/v3/resources/",
];

export async function fetchAccountLive(): Promise<{
  raw: unknown;
  company: ParsedCompany;
  warehouse: ParsedWarehouseItem[];
  source: string;
}> {
  const auth = await simcoGet<unknown>("/api/v3/companies/auth-data/");
  let warehouse = await parseWarehouse(auth);
  let source = "auth-data";

  if (warehouse.length === 0) {
    for (const path of WAREHOUSE_PATHS) {
      try {
        const data = await simcoGet<unknown>(path);
        const items = await parseWarehouse(data);
        if (items.length > 0) {
          warehouse = items;
          source = `auth-data+${path}`;
          break;
        }
        if (Array.isArray(data)) {
          const direct = await parseWarehouse({ resources: data });
          if (direct.length > 0) {
            warehouse = direct;
            source = path;
            break;
          }
        }
      } catch {
        // probar siguiente
      }
    }
  }

  return {
    raw: auth,
    company: parseCompany(auth),
    warehouse,
    source,
  };
}

export async function parseImportedAccount(raw: unknown): Promise<{
  company: ParsedCompany;
  warehouse: ParsedWarehouseItem[];
  source: string;
  warehouseOnly: boolean;
}> {
  const warehouseOnly = Array.isArray(raw);
  return {
    company: warehouseOnly ? {} : parseCompany(raw),
    warehouse: await parseWarehouse(raw),
    source: warehouseOnly ? "warehouse-json-import" : "browser-json-import",
    warehouseOnly,
  };
}
