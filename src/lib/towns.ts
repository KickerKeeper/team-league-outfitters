export type Town = {
  slug: string;
  name: string;
  blurb: string;
};

export const TOWNS: Town[] = [
  {
    slug: 'georgetown',
    name: 'Georgetown',
    blurb: 'Royals jerseys for Georgetown youth athletes.',
  },
  {
    slug: 'masco',
    name: 'Masco',
    blurb: 'Chieftains jerseys for Masco youth athletes.',
  },
  {
    slug: 'swampscott',
    name: 'Swampscott',
    blurb: 'Big Blue jerseys for Swampscott youth athletes.',
  },
];

export function getTown(slug: string): Town | undefined {
  return TOWNS.find((t) => t.slug === slug);
}
