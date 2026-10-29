// Lets `node` run TypeScript scripts that import other project files using
// extensionless specifiers (e.g. `import … from './model'`). Node's built-in
// type stripping needs an explicit extension, so this loader resolves a
// relative import with no extension by trying the TypeScript/JavaScript ones.
//
// Used only by `npm run section-map` (scripts/build-section-map.mts), via
// `node --experimental-loader`. (registerHooks + `--import` does not compose
// with Node's type stripping on Node 24/26, so this classic loader is used.)
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(m?[jt]sx?)$/.test(specifier)) {
    for (const extension of ['.ts', '.tsx', '.mts', '.js', '.mjs']) {
      try {
        return await nextResolve(specifier + extension, context);
      } catch {
        // try the next extension
      }
    }
  }
  return nextResolve(specifier, context);
}
