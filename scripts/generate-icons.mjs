// Renders public/favicon.svg to the PNG icons the manifest and iOS need.
// The artwork is full-bleed with everything important inside the middle 80%,
// so the same file works as a maskable icon. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const svg = readFileSync(resolve(publicDir, 'favicon.svg'));

const targets = { 'pwa-192x192.png': 192, 'pwa-512x512.png': 512, 'apple-touch-icon.png': 180 };

for (const [file, size] of Object.entries(targets)) {
  await sharp(svg, { density: Math.round((72 * size) / 512) * 4 })
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, file));
  console.log(`Generated ${file}`);
}
