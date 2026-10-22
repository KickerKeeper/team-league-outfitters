// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://gtownjerseys.com',
  adapter: netlify(),
  integrations: [sitemap()],
  // Astro 7 defaults compressHTML to 'jsx', which drops whitespace between
  // inline elements. Keep the Astro 6 behavior so rendered copy is unchanged.
  compressHTML: true,
});
