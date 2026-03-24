import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const svgPath = resolve(publicDir, 'favicon.svg');

const svg = readFileSync(svgPath);

const sizes = [192, 512];

for (const size of sizes) {
  // Add padding and background for the icon
  const padded = sharp(svg)
    .resize(Math.round(size * 0.7), Math.round(size * 0.7), { fit: 'contain' })
    .flatten({ background: { r: 15, g: 23, b: 42 } }); // dark bg matching app

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  })
    .composite([{ input: await padded.toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(resolve(publicDir, `pwa-${size}x${size}.png`));

  console.log(`Generated pwa-${size}x${size}.png`);
}

// Apple touch icon (180x180)
const applePadded = sharp(svg)
  .resize(126, 126, { fit: 'contain' })
  .flatten({ background: { r: 15, g: 23, b: 42 } });

await sharp({
  create: {
    width: 180,
    height: 180,
    channels: 4,
    background: { r: 15, g: 23, b: 42, alpha: 1 },
  },
})
  .composite([{ input: await applePadded.toBuffer(), gravity: 'centre' }])
  .png()
  .toFile(resolve(publicDir, 'apple-touch-icon.png'));

console.log('Generated apple-touch-icon.png');
console.log('Done!');
