import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '..', 'public', 'images', 'logo');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const NAVY = '#2B5EA7';
const NAVY_DARK = '#1E4478';
const GOLD = '#E8A317';
const WHITE = '#FFFFFF';

const DISPLAY_FONT = "Impact, 'Arial Black', 'Helvetica Neue', Helvetica, sans-serif";
const TEXT_FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const horizontal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2816 1536">
  <rect width="2816" height="1536" fill="${WHITE}"/>
  <rect y="0" width="2816" height="60" fill="${NAVY}"/>
  <rect y="1476" width="2816" height="60" fill="${NAVY}"/>
  <text x="1408" y="580" font-family="${DISPLAY_FONT}" font-size="360" font-weight="900" fill="${NAVY}" text-anchor="middle" letter-spacing="8">GEORGETOWN</text>
  <rect x="1008" y="680" width="800" height="10" fill="${GOLD}"/>
  <text x="1408" y="1060" font-family="${DISPLAY_FONT}" font-size="360" font-weight="900" fill="${GOLD}" text-anchor="middle" letter-spacing="90">JERSEYS</text>
  <text x="1408" y="1270" font-family="${TEXT_FONT}" font-size="72" font-weight="600" fill="${NAVY}" text-anchor="middle" letter-spacing="24">SPORTS APPAREL · GEORGETOWN, MA</text>
</svg>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
  <rect width="2048" height="2048" rx="320" ry="320" fill="${NAVY}"/>
  <text x="1024" y="1340" font-family="${DISPLAY_FONT}" font-size="1300" font-weight="900" fill="${WHITE}" text-anchor="middle" letter-spacing="40">GJ</text>
  <rect x="540" y="1560" width="968" height="24" fill="${GOLD}"/>
</svg>`;

const stacked = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
  <rect width="2048" height="2048" fill="${NAVY}"/>
  <rect x="0" y="90" width="2048" height="24" fill="${GOLD}"/>
  <rect x="0" y="1934" width="2048" height="24" fill="${GOLD}"/>
  <text x="1024" y="780" font-family="${DISPLAY_FONT}" font-size="320" font-weight="900" fill="${WHITE}" text-anchor="middle" letter-spacing="6">GEORGETOWN</text>
  <rect x="724" y="880" width="600" height="10" fill="${GOLD}"/>
  <text x="1024" y="1180" font-family="${DISPLAY_FONT}" font-size="320" font-weight="900" fill="${GOLD}" text-anchor="middle" letter-spacing="80">JERSEYS</text>
  <text x="1024" y="1440" font-family="${TEXT_FONT}" font-size="92" font-weight="600" fill="${WHITE}" text-anchor="middle" letter-spacing="14">TEAM UNIFORMS · CUSTOM APPAREL</text>
  <text x="1024" y="1600" font-family="${TEXT_FONT}" font-size="74" font-weight="400" fill="${WHITE}" fill-opacity="0.75" text-anchor="middle" letter-spacing="10">GEORGETOWN, MASSACHUSETTS · SINCE 2013</text>
</svg>`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
  <rect width="2048" height="2048" rx="220" ry="220" fill="${NAVY}"/>
  <text x="1024" y="1400" font-family="${DISPLAY_FONT}" font-size="1400" font-weight="900" fill="${GOLD}" text-anchor="middle" letter-spacing="40">GJ</text>
</svg>`;

const jobs = [
  { svg: horizontal, out: path.join(LOGO_DIR, 'logo-horizontal.png'), w: 2816, h: 1536 },
  { svg: icon, out: path.join(LOGO_DIR, 'logo-icon.png'), w: 2048, h: 2048 },
  { svg: stacked, out: path.join(LOGO_DIR, 'logo-stacked.png'), w: 2048, h: 2048 },
  { svg: favicon, out: path.join(PUBLIC_DIR, 'favicon.png'), w: 2048, h: 2048 },
];

for (const { svg, out, w, h } of jobs) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(w, h, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${out} (${w}x${h})`);
}
