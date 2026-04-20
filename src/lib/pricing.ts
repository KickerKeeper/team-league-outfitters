import { getStore } from '@netlify/blobs';
import { TOWNS } from './towns';

export interface TownPrice {
  jerseyPriceCents: number;
  updatedAt: string;
  updatedBy?: string;
}

export type PriceMap = Record<string, TownPrice>;

const DEFAULT_PRICE_CENTS = 5000;
const STORE_KEY = 'town-prices';

export async function getAllPrices(): Promise<PriceMap> {
  const store = getStore('pricing');
  try {
    const raw = await store.get(STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PriceMap;
  } catch {
    return {};
  }
}

export async function getTownPrice(slug: string): Promise<TownPrice> {
  const all = await getAllPrices();
  return all[slug] || {
    jerseyPriceCents: DEFAULT_PRICE_CENTS,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function setTownPrice(
  slug: string,
  jerseyPriceCents: number,
  updatedBy?: string,
): Promise<TownPrice> {
  if (!TOWNS.find((t) => t.slug === slug)) {
    throw new Error(`Unknown town: ${slug}`);
  }
  if (!Number.isInteger(jerseyPriceCents) || jerseyPriceCents < 0) {
    throw new Error(`Invalid price: ${jerseyPriceCents}`);
  }

  const store = getStore('pricing');
  const all = await getAllPrices();
  const entry: TownPrice = {
    jerseyPriceCents,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  all[slug] = entry;
  await store.set(STORE_KEY, JSON.stringify(all));
  return entry;
}

export function formatPriceCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export { DEFAULT_PRICE_CENTS };
