# Releasing Satanen

Plain-English guide for the owner. Agents do the releases; this tells you what happens and how to check it.

## How a release works

1. **Guard.** `scripts/assert-release.mjs` runs first, before anything is built or sent. It stops with a plain reason unless all of these are true: no uncommitted files, the branch is `main`, the local copy equals `origin/main` on GitHub, and CI finished green for exactly that commit. It also stops if `gh` (the GitHub tool) is missing or not logged in. There is no switch to skip it. The deploy step runs the same checks again itself (for the web site, after the build), so starting it directly does not skip them. Deploys happen from a clean checkout on the owner's machine: ignored local `.env*` files can still change the web build.
2. **Deploy.** The web site: `npm run deploy:web`. The Worker (the proxy): `npm --prefix proxy run deploy`. Both record the commit (short id and subject) as the Cloudflare version message.
3. **Smoke.** `npm run smoke:web` checks the live site, `npm --prefix proxy run smoke` checks the proxy. If a check fails, roll back (below) or fix forward.

## What is live right now

- Open `https://satanen.io/version.json`. It shows the full commit id (`sha`) and the build time. Look the id up on GitHub to see the change.
- In the Cloudflare dashboard, open Workers & Pages, pick `satanen-web` or the proxy Worker, then Deployments. Each version shows the message "short id and subject".

## Rolling back

Rollback goes back to an earlier Cloudflare version. Try it the first time together with someone who can read the command output.

- Proxy Worker: from the repo root, `proxy/node_modules/.bin/wrangler rollback -c proxy/wrangler.toml` (add a version id to pick one; without it, it goes to the previous version).
- Web site: from the repo root, `proxy/node_modules/.bin/wrangler rollback -c site/wrangler.toml`.

Afterwards run the smoke checks. `/version.json` will show the older commit.

## Emergency rule

The guard has no bypass, on purpose. If something is on fire and the guard blocks the fix, run `wrangler deploy` by hand and write it down in `docs/DECISIONS.md` as an urgent fix (D42): what, why, which commit. Then get the change merged and reviewed afterwards.

## Owner terminal steps

`wrangler login` and `wrangler secret put ...` are done by the owner in their own terminal. Agents do not do them (D43).
