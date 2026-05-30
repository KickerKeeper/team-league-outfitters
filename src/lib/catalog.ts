import { getStore } from '@netlify/blobs';
import { getTown } from './towns';
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

// Global product definitions. Every town can offer any of these; per-town
// price + availability are stored in Netlify Blobs and edited in /admin.
type ProductDef = Omit<CatalogProduct, 'enabled'>;

export const PRODUCTS: ProductDef[] = [
  { id: 'jersey', label: 'Jersey', priceCents: 3000, sizing: 'apparel', taxCategory: 'clothing', personalized: true },
  { id: 'shorts', label: 'Shorts', priceCents: 2000, sizing: 'apparel', taxCategory: 'clothing' },
  {
    id: 'socks', label: 'Socks', priceCents: 1000, sizing: 'shoe', taxCategory: 'clothing',
    options: { id: 'sock_style', label: 'Sock Style', choices: ['Tight Compression', 'No Compression'] },
  },
  { id: 'sweatshirt', label: 'Sweatshirt', priceCents: 3500, sizing: 'apparel', taxCategory: 'clothing' },
  { id: 'practice-tee', label: 'Practice Tee', priceCents: 2000, sizing: 'apparel', taxCategory: 'clothing' },
  { id: 'soccer-ball', label: 'Soccer Ball', priceCents: 2000, sizing: 'none', taxCategory: 'general' },
  { id: 'backpack', label: 'Backpack', priceCents: 6500, sizing: 'none', taxCategory: 'general' },
];

const CATALOG_STORE_KEY = 'catalogs';

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

// Jersey is available for every town. Other products default OFF and are
// switched on per town in the admin grid — except Swampscott, which keeps its
// full launched kit on by default.
function defaultEnabled(slug: string, productId: string): boolean {
  if (productId === 'jersey') return true;
  return slug === 'swampscott';
}

function cloneProduct(p: ProductDef): ProductDef {
  return { ...p, options: p.options ? { ...p.options, choices: [...p.options.choices] } : undefined };
}

export async function getCatalog(slug: string): Promise<CatalogProduct[]> {
  const overrides = (await getOverrides())[slug] || {};

  // Legacy migration: seed the jersey price from the old town-prices store when
  // there's no explicit catalog override for it.
  let legacyJerseyCents: number | undefined;
  if (overrides.jersey?.priceCents == null) {
    try {
      const prices = await getAllPrices();
      legacyJerseyCents = prices[slug]?.jerseyPriceCents;
    } catch { /* ignore */ }
  }

  return PRODUCTS.map((def) => {
    const p = cloneProduct(def);
    const o = overrides[p.id] || {};
    let priceCents = o.priceCents != null ? o.priceCents : p.priceCents;
    if (p.id === 'jersey' && o.priceCents == null && legacyJerseyCents != null) {
      priceCents = legacyJerseyCents;
    }
    const enabled = o.enabled != null ? o.enabled : defaultEnabled(slug, p.id);
    return { ...p, priceCents, enabled };
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
  if (!(await getTown(slug))) throw new Error(`Unknown town: ${slug}`);
  if (!PRODUCTS.find((p) => p.id === productId)) throw new Error(`Unknown product: ${productId}`);
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
