import { getStore } from '@netlify/blobs';

export type Town = {
  slug: string;
  name: string;
  blurb: string;
  custom?: boolean;
};

export const DEFAULT_TOWNS: Town[] = [
  { slug: 'georgetown', name: 'Georgetown', blurb: 'Royals jerseys for Georgetown youth athletes.' },
  { slug: 'masco', name: 'Masco', blurb: 'Chieftains jerseys for Masco youth athletes.' },
  { slug: 'swampscott', name: 'Swampscott', blurb: 'Big Blue jerseys for Swampscott youth athletes.' },
];

// Back-compat alias (defaults only). Prefer getTowns() for the full live list.
export const TOWNS = DEFAULT_TOWNS;

const TOWNS_KEY = 'custom-towns';

function townStore() {
  return getStore({ name: 'pricing', consistency: 'strong' });
}

async function getCustomTowns(): Promise<Town[]> {
  try {
    const raw = await townStore().get(TOWNS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// All towns: built-in defaults plus any admin-added towns (deduped by slug).
export async function getTowns(): Promise<Town[]> {
  const custom = await getCustomTowns();
  const map = new Map<string, Town>();
  DEFAULT_TOWNS.forEach((t) => map.set(t.slug, t));
  custom.forEach((t) => {
    if (t && t.slug && !map.has(t.slug)) map.set(t.slug, { ...t, custom: true });
  });
  return Array.from(map.values());
}

export async function getTown(slug: string): Promise<Town | undefined> {
  if (!slug) return undefined;
  return (await getTowns()).find((t) => t.slug === slug);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function addTown(name: string): Promise<Town> {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Town name is required');
  const slug = slugify(cleanName);
  if (!slug) throw new Error('Invalid town name');
  if (await getTown(slug)) throw new Error('A town with that name already exists');

  const custom = await getCustomTowns();
  const town: Town = { slug, name: cleanName, blurb: `${cleanName} youth athletes.`, custom: true };
  custom.push(town);
  await townStore().set(TOWNS_KEY, JSON.stringify(custom));
  return town;
}
