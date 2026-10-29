// One-off: renders the app icons from design-system/assets/Logos/*.svg.
// Usage: see assets/README.md. Needs `sharp` installed in the current directory (not in this repo).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(join(process.cwd(), 'noop.js'))('sharp');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logos = join(root, 'design-system/assets/Logos');
const read = (f) =>
  readFileSync(join(logos, f), 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');

const tile = read('satanen-icon.svg'); // rounded tile, transparent corners
const square = read('satanen-icon-android.svg'); // full-bleed graphite, mark in safe zone
const blocks = square.replace(/<rect width="120" height="120"[^>]*\/>/, ''); // mark only
const white = blocks.replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#FFFFFF"');
const graphite = { r: 0x15, g: 0x18, b: 0x1d, alpha: 1 };

const out = (f) => join(root, f);
const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(out(file));

await Promise.all([
  render(tile, 192, 'public/icons/icon-192.png'),
  render(tile, 512, 'public/icons/icon-512.png'),
  render(square, 512, 'public/icons/icon-maskable-512.png'),
  render(square, 180, 'public/icons/apple-touch-icon.png'),
  render(tile, 48, 'assets/favicon.png'),
  // iOS icon: the rounded tile, flattened onto graphite (the App Store rejects transparency).
  sharp(Buffer.from(tile), { density: 600 })
    .resize(1024, 1024)
    .flatten({ background: graphite })
    .png()
    .toFile(out('assets/icon.png')),
  render(blocks, 512, 'assets/android-icon-foreground.png'),
  render(white, 432, 'assets/android-icon-monochrome.png'),
  render(blocks, 1024, 'assets/splash-icon.png'),
  sharp({ create: { width: 512, height: 512, channels: 4, background: graphite } })
    .png()
    .toFile(out('assets/android-icon-background.png')),
]);
console.log('done');
