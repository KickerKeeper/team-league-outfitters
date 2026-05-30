import { getStore } from '@netlify/blobs';
import { TOWNS } from './towns';
import { getAllPrices } from './pricing';

export type Sizing = 'apparel' | 'shoe' | 'none';
export type TaxCategory = 'clothing' | 'general';

export interface ProductOption {
  id: string;
  label: string;
  choices: string[];
}

export interface CatalogProduct {
  id: string;
  label: string;
  priceCents: number;
  sizing: Sizing;
  taxCategory: TaxCategory;
  personalized?: boolean; // collects player name + number (jersey)
  options?: ProductOption; // e.g. sock style
  enabled: boolean;
}

export const APPAREL_SIZES = [
  'Youth XS', 'Youth S', 'Youth M', 'Youth L', 'Youth XL',
  'Adult XS', 'Adult S', 'Adult M', 'Adult L', 'Adult XL',
];

const CATALOG_STORE_KEY = 'catalogs';

// Per-town default catalogs. Product STRUCTURE (sizing/tax/options/personalized)
// is code-defined here; price + enabled can be overridden per town via the admin
// editor and persisted to Netlify Blobs.
export const DEFAULT_CATALOGS: Record<string, CatalogProduct[]> = {
  georgetown: [
    { id: 'jersey', label: 'Jersey', priceCents: 5000, sizing: 'apparel', taxCategory: 'clothing', personalized: true, enabled: true },
  ],
  masco: [
    { id: 'jersey', label: 'Jersey', priceCents: 5000, sizing: 'apparel', taxCategory: 'clothing', personalized: true, enabled: true },
  ],
  swampscott: [
    { id: 'jersey', label: 'Jersey', priceCents: 3000, sizing: 'apparel', taxCategory: 'clothing', personalized: true, enabled: true },
    { id: 'shorts', label: 'Shorts', priceCents: 2000, sizing: 'apparel', taxCategory: 'clothing', enabled: true },
    {
      id: 'socks', label: 'Socks', priceCents: 1000, sizing: 'shoe', taxCategory: 'clothing', enabled: true,
      options: { id: 'sock_style', label: 'Sock Style', choices: ['Tight Compression', 'No Compression'] },
    },
    { id: 'sweatshirt', label: 'Sweatshirt', priceCents: 3500, sizing: 'apparel', taxCategory: 'clothing', enabled: true },
    { id: 'practice-tee', label: 'Practice Tee', priceCents: 2000, sizing: 'apparel', taxCategory: 'clothing', enabled: true },
    { id: 'soccer-ball', label: 'Soccer Ball', priceCents: 2000, sizing: 'none', taxCategory: 'general', enabled: true },
    { id: 'backpack', label: 'Backpack', priceCents: 6500, sizing: 'none', taxCategory: 'general', enabled: true },
  ],
};

// Stored overrides: { [slug]: { [productId]: { priceCents?, enabled? } } }
type CatalogOverrides = Record<string, Record<string, { priceCents?: number; enabled?: boolean }>>;

function catalogStore() {
  return getStore({ name: 'pricing', consistency: 'strong' });
}

async function getOverrides(): Promise<CatalogOverrides> {
  try {
    const raw = await catalogStore().get(CATALOG_STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CatalogOverrides;
  } catch {
    return {};
  }
}

function defaultsFor(slug: string): CatalogProduct[] {
  // Deep-clone so callers can't mutate the module constant.
  return (DEFAULT_CATALOGS[slug] || []).map((p) => ({
    ...p,
    options: p.options ? { ...p.options, choices: [...p.options.choices] } : undefined,
  }));
}

export async function getCatalog(slug: string): Promise<CatalogProduct[]> {
  const products = defaultsFor(slug);
  if (!products.length) return [];

  const overrides = (await getOverrides())[slug] || {};

  // Legacy migration: if no stored jersey-price override, seed the jersey price
  // from the old town-prices store so existing per-town prices carry over.
  let legacyJerseyCents: number | undefined;
  if (overrides.jersey?.priceCents == null) {
    try {
      const prices = await getAllPrices();
      legacyJerseyCents = prices[slug]?.jerseyPriceCents;
    } catch { /* ignore */ }
  }

  return products.map((p) => {
    const o = overrides[p.id] || {};
    let priceCents = o.priceCents != null ? o.priceCents : p.priceCents;
    if (p.id === 'jersey' && o.priceCents == null && legacyJerseyCents != null) {
      priceCents = legacyJerseyCents;
    }
    return {
      ...p,
      priceCents,
      enabled: o.enabled != null ? o.enabled : p.enabled,
    };
  });
}

export async function getCatalogProduct(slug: string, productId: string): Promise<CatalogProduct | undefined> {
  const catalog = await getCatalog(slug);
  return catalog.find((p) => p.id === productId);
}

export async function setProductOverride(
  slug: string,
  productId: string,
  patch: { priceCents?: number; enabled?: boolean },
): Promise<CatalogProduct> {
  if (!TOWNS.find((t) => t.slug === slug)) throw new Error(`Unknown town: ${slug}`);
  const def = defaultsFor(slug).find((p) => p.id === productId);
  if (!def) throw new Error(`Unknown product: ${productId} for ${slug}`);
  if (patch.priceCents != null && (!Number.isInteger(patch.priceCents) || patch.priceCents < 0)) {
    throw new Error(`Invalid price: ${patch.priceCents}`);
  }

  const store = catalogStore();
  const overrides = await getOverrides();
  const townOverrides = overrides[slug] || {};
  townOverrides[productId] = { ...townOverrides[productId], ...patch };
  overrides[slug] = townOverrides;
  await store.set(CATALOG_STORE_KEY, JSON.stringify(overrides));

  const merged = await getCatalogProduct(slug, productId);
  return merged!;
}

export function formatPriceCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
