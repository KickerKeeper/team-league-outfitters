// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://gtownjerseys.com',
  adapter: netlify(),
  integrations: [sitemap()],
});
