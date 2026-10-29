// Production web builds leave the developer preview screens (app/dev) and the
// saved Yle fixtures out entirely (PUB.16). `npm run build:web` sets NO_DEV_ROUTES=1.
// In `npm run web` the variable is unset and /dev/* works as before.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.NO_DEV_ROUTES === '1') {
  const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sep = '[\\\\/]';
  const blocked = [
    new RegExp(`${escape(__dirname)}${sep}app${sep}dev${sep}.*`),
    new RegExp(`${escape(__dirname)}${sep}src${sep}dev${sep}.*`),
    new RegExp(`${escape(__dirname)}${sep}fixtures${sep}.*`),
  ];
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    ...blocked,
  ];
}

module.exports = config;
