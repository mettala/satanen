// One-off: renders public/og-image.png (the 1200x630 card shown when satanen.io is shared, D53).
// Usage: see assets/README.md. Needs `sharp` and `opentype.js` installed in the current directory
// (not in this repo). Text is turned into paths with opentype.js so the brand font does not have to
// be installed on the machine.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'noop.js'));
const sharp = require('sharp');
const opentype = require('opentype.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = join(root, 'node_modules/@expo-google-fonts/schibsted-grotesk');
const font = (weight) =>
  opentype.parse(
    readFileSync(join(fontDir, `${weight}/SchibstedGrotesk_${weight}.ttf`)).buffer.slice(0),
  );
const bold = font('700Bold');
const regular = font('400Regular');
const text = (f, s, x, y, size, fill) =>
  `<path d="${f.getPath(s, x, y, size).toPathData(2)}" fill="${fill}"/>`;

const logo = readFileSync(join(root, 'design-system/assets/Logos/satanen-icon.svg'), 'utf8').replace(
  /<metadata>[\s\S]*?<\/metadata>/,
  '',
);
const tile = await sharp(Buffer.from(logo), { density: 600 }).resize(300, 300).png().toBuffer();

// Colours from design-system/tokens.json (dark theme): bg, ink, ink-muted, link.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#15181D"/>
${text(bold, 'Satanen', 480, 300, 120, '#ECEEF1')}
${text(regular, 'Yle Teksti-TV modernina', 484, 378, 44, '#A0A7B2')}
${text(regular, 'lukusovelluksena', 484, 436, 44, '#A0A7B2')}
${text(regular, 'satanen.io', 484, 540, 30, '#9DB6FF')}
</svg>`;

await sharp(Buffer.from(svg))
  .composite([{ input: tile, left: 130, top: 165 }])
  .png({ compressionLevel: 9 })
  .toFile(join(root, 'public/og-image.png'));
console.log('done');
