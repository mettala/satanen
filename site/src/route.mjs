// Decides what the site does with a missing file. Pure, so it can be tested.
// 'asset' = a real 404 (a script URL must never answer with HTML)
// 'app'   = hand out index.html (single-page app)
export function classify(pathname) {
  if (pathname.startsWith('/_expo/static/') || pathname.startsWith('/assets/')) return 'asset';
  return 'app';
}
