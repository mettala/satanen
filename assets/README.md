# Icons

All app icons are rendered once from the logo SVGs in `design-system/assets/Logos/` and committed. Nothing renders at build time and no dependency is added to the project.

Regenerate (only when the logo changes). Install `sharp` in a scratch folder, then run the script from that folder; it finds `sharp` in the current directory:

```sh
mkdir /tmp/satanen-icons && cd /tmp/satanen-icons && npm init -y && npm i sharp
node /path/to/satanen/assets/render-icons.mjs
```

Outputs: `assets/` (Expo: icon, adaptive icon layers, splash, favicon) and `public/` (web: `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`). `npx expo export -p web` copies `public/` as-is into `dist/`.

## Share image

`public/og-image.png` (1200×630) is the card shown when `satanen.io` is shared on LinkedIn and similar (D53). Same idea: rendered once and committed. Needs `sharp` and `opentype.js` in a scratch folder, and the repo's `node_modules` for the font:

```sh
mkdir /tmp/satanen-og && cd /tmp/satanen-og && npm init -y && npm i sharp opentype.js
node /path/to/satanen/assets/render-og-image.mjs
```

After the file changes, LinkedIn keeps showing the old card until you refresh it in the Post Inspector (https://www.linkedin.com/post-inspector/).
