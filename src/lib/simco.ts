import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKET_CACHE_PATH = path.resolve(__dirname, "../../data/market-prices.json");

let lastRequestAt = 0;

function minIntervalMs() {
  return Number(process.env.SIMCO_MIN_INTERVAL_MS ?? 300_000);
}

async function respectRateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  const wait = minIntervalMs() - elapsed;
  if (lastRequestAt > 0 && wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

export async function simcoGet<T>(urlPath: string): Promise<T> {
  await respectRateLimit();
  const cookie = process.env.SIMCO_COOKIE?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  if (cookie) {
    headers.Cookie = cookie.includes("=") ? cookie : `sessionid=${cookie}`;
  }

  const url = urlPath.startsWith("http")
    ? urlPath
    : `https://www.simcompanies.com${urlPath}`;

  const res = await fetch(url, { headers, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SimCompanies ${res.status} en ${url}: ${body.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

type MarketTickerItem = {
  kind?: number;
  price?: number;
};

type MarketCache = {
  updatedAt: string;
  source: string;
  prices: Record<string, number>;
};

async function loadMarketCache(): Promise<MarketCache | null> {
  try {
    const raw = await readFile(MARKET_CACHE_PATH, "utf8");
    return JSON.parse(raw) as MarketCache;
  } catch {
    return null;
  }
}

async function saveMarketCache(cache: MarketCache) {
  await writeFile(MARKET_CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

/**
 * Solo precios de mercado (ticker) para enriquecer el inventario Nexo.
 * No reemplaza stock ni costos del CSV.
 */
export async function fetchMarketSuggestedPrices(kinds: number[]): Promise<{
  prices: Map<number, number>;
  source: string;
}> {
  const realm = Number(process.env.SIMCO_REALM ?? 0);
  const wanted = new Set(kinds.filter((k) => Number.isFinite(k) && k > 0 && k < 900000));
  const prices = new Map<number, number>();

  try {
    const ticker = await simcoGet<MarketTickerItem[]>(
      `/api/v3/market-ticker/${realm}/`,
    );
    for (const row of ticker) {
      if (typeof row.kind === "number" && typeof row.price === "number") {
        if (wanted.has(row.kind)) prices.set(row.kind, row.price);
      }
    }

    const cache: MarketCache = {
      updatedAt: new Date().toISOString(),
      source: "market-ticker",
      prices: Object.fromEntries([...prices.entries()].map(([k, v]) => [String(k), v])),
    };
    // merge previous cache for kinds not in this ticker response
    const prev = await loadMarketCache();
    if (prev?.prices) {
      for (const [k, v] of Object.entries(prev.prices)) {
        const id = Number(k);
        if (wanted.has(id) && !prices.has(id)) {
          prices.set(id, v);
          cache.prices[k] = v;
        }
      }
    }
    await saveMarketCache(cache);

    return { prices, source: "simcompanies-market-ticker" };
  } catch (err) {
    const prev = await loadMarketCache();
    if (prev?.prices) {
      for (const [k, v] of Object.entries(prev.prices)) {
        const id = Number(k);
        if (wanted.has(id)) prices.set(id, v);
      }
      if (prices.size > 0) {
        return {
          prices,
          source: `market-cache-fallback:${(err as Error).message.slice(0, 80)}`,
        };
      }
    }
    throw err;
  }
}
