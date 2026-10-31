# Satanen proxy

A small Cloudflare Worker. It is the only part of Satanen that knows the Yle API key. The app asks this Worker for pages; the Worker asks Yle and hands the answer back unchanged (see D10 in `docs/DECISIONS.md`).

## What it serves

| Request                                                                            | Answer                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `GET /v1/pages/{100-899}.json`                                                     | Yle's page JSON, untouched                    |
| `GET /v1/images/{100-899}/{1-99}.png`                                              | The page as a PNG picture                     |
| `POST /v1/opened/{100-899}`                                                        | 204 (a page count, see D32 below)             |
| any request from a browser on another website (an `Origin` not allowed)            | 403 `{"error":"forbidden"}`, Yle is not asked |
| anything else                                                                      | 404 `{"error":"not-found"}`                   |
| other methods (POST on pages and images, PUT and so on)                            | 405                                           |
| the page does not exist at Yle                                                     | 404 `{"error":"not-found"}`                   |
| a picture of a subpage the page isn't known to have (see "Protecting the key")     | 404 `{"error":"not-found"}`, Yle is not asked |
| Yle is down, answers an error or a redirect, or takes more than 8 s                | 502 `{"error":"upstream"}`                    |
| Yle failed moments ago, or this hour's requests are used up, and nothing is stored | 503 `{"error":"busy"}` with `Retry-After`     |

### Other websites (PUB.14)

Production allows one origin, `https://satanen.io` (`ALLOWED_ORIGINS` in `wrangler.toml`). A request whose `Origin` header is anything else gets `403 {"error":"forbidden"}` with `Cache-Control: no-store`, before the cache, Yle or the page counts are touched. So a script on another website can't make a reader's browser spend our Yle requests through `fetch`, and its opens are not counted. The check is exact: `http://satanen.io`, `https://satanen.io.evil.example` and `null` are refused.

What it can't do, honestly: only browsers send `Origin`, and only for some requests. Requests with no `Origin` are served as before, because the Android app sends none. That includes:

- another website's `<img src="https://api.satanen.io/v1/images/…">`: a plain image tag sends no `Origin`, so other sites can still show our pictures (hotlinking), and a picture that isn't in the cache costs a Yle request;
- scripts and servers (`curl` and the like), which can send any `Origin` they want, or none.

What stops those is the hourly cap, the picture rule and the Cloudflare rate-limiting rule in "Protecting the key" below, not the Origin check.

`OPTIONS` (the browser's preflight) from `https://satanen.io` is answered as before and never reaches Yle; from another origin it is a 403 too.

## Protecting the key (PUB.6, D39 amendment)

Yle allows about 300 requests an hour for the whole key. Every page that isn't in the cache costs one, so without limits a short script asking for all 800 pages could use up the hour for every reader. The limits below stop that, and keep a failing Yle from being asked again and again.

**In the code** (`src/ttl.ts`, `src/upstream.ts`, `src/index.ts`):

- **Hard cap**: each Worker copy asks Yle at most `YLE_HOURLY_CAP` = 250 times per UTC hour. Past that it never asks Yle until the next hour: it serves the stored copy if it is still fresh, otherwise the last good copy (marked `X-Satanen-Stale: 1`), otherwise `503 {"error":"busy"}` with `Retry-After` (seconds to the next hour). `?fresh=1` follows the same cap. The count is in memory per Worker copy (like the doubling of limits), so it is a safety net, not an exact total.
- **Pictures of subpages**: `/v1/images/{page}/{sub}.png` goes to Yle only if `sub` is 1, or the page's JSON is stored in this data centre (fresh or last good copy, 24 h) and says the page has at least `sub` subpages. Otherwise the answer is `404 {"error":"not-found"}` with `Cache-Control: no-store` and Yle is not asked. The app always loads a page's JSON before it shows any of its pictures, so readers are not affected. This shrinks the pictures a script can ask for from 99 per page to the ones that exist. A picture already in the cache is served whatever the rule says.
- **A pause after Yle fails** (PUB.14, `src/upstream.ts`): when Yle answers 401 (key refused or quota used up) or 429 (too many requests), this Worker copy asks Yle nothing at all for 60 s (`QUOTA_PAUSE_S`), for any page or picture. When Yle answers 5xx or a redirect, takes more than 8 s, or can't be reached, only that address waits 15 s (`ERROR_PAUSE_S`). During a pause a reader gets the fresh copy if there is one, otherwise the last good copy (`X-Satanen-Stale: 1`, with the usual browser time), otherwise `503 {"error":"busy"}` with `Retry-After` (the seconds left; the longer wait if the hourly cap is also reached) and `Cache-Control: no-store`. Without the pause every reader's tap would ask Yle again while it is down, wait up to 8 s, and use up the hour's requests. The pause is judged from the Worker's clock, with no timers running in the background, so a recovered Yle is used again within 15 s (or 60 s after a 401/429). A Yle answer (200 or 404) for an address forgets that address's pause. The 60 s pause ends only by time: while it lasts nothing is sent, so the only answers that could arrive are to requests sent before the 401. The pause is in memory per Worker copy, like the cap. Cache hits are never affected.
- **One Yle request for many readers** (PUB.14): when several readers ask for the same address at the same moment and it isn't in the cache, this Worker copy sends one request to Yle and gives the answer (or the failure) to all of them. It counts once against the hourly cap, is stored once and is counted once in the stats. Each reader still gets their own headers (CORS, HEAD without a body). The shared request is forgotten as soon as Yle answers or fails, so memory doesn't grow, and the next miss asks again (after any pause); one that hasn't finished in 10 s is not joined any more, as a safety net. The address is the key, like the cache key, so `?fresh=1` and a plain request for the same page share one Yle request: either answer is newer than the stored copy and replaces it. A `?fresh=1` reader whose shared request fails still gets the copy it skipped.
- **Redirects are not followed**: the Worker asks Yle with `redirect: 'manual'`. A 3xx answer is a failure (502, or the last good copy, and the 15 s pause); its `Location` is never followed or passed on, so the key in the address can't be sent elsewhere and another server's answer can't pass for Yle's.

**In Cloudflare (set up by the owner or orchestrator, once)**: a rate-limiting rule that blocks one IP address that sends too many requests. It runs before the Worker, so blocked requests don't count against Yle or against the Workers daily request limit. The Free plan includes one such rule.

- Dashboard: the `satanen.io` zone, Security, WAF (or Security rules), Rate limiting rules, Create rule.
- Name: `api burst limit`.
- When incoming requests match: Hostname equals `api.satanen.io` and URI Path starts with `/v1/`. As an expression: `(http.host eq "api.satanen.io" and starts_with(http.request.uri.path, "/v1/"))`.
- Counted by: IP.
- Rate: 120 requests per 10 seconds (60 until 31.10.2026, see D56).
- Action: Block, for 10 seconds.

120 in 10 s is far above one reader (reading the whole Uutiset feed is about 20 requests, at most 4 at a time), but still stops a script in seconds. It was 60 until a reader on a VPN got "Ei yhteyttä" on the front page (30.10.2026): a VPN or mobile network shares one address among many people, and a Cloudflare block carries no CORS headers, so the browser reports it as a lost connection (D56). If many readers behind one shared address are ever blocked again, raise the number again. Blocking uses the IP address only for that moment, inside Cloudflare, which the privacy policy covers.

## Caching (D39 B, replacing the 45 s of D11)

Each kind of page has its own limit, decided from the page number in `src/ttl.ts`:

| Kind               | Pages                                                                                    | Kept at the edge | In the browser |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------- | -------------- |
| live results       | 221, 222 (SM-liiga), 241 (Veikkausliiga), 261 (F-liiga): `LIVE_PAGES`                    | 60 s             | 15 s           |
| headline lists     | 100, 101, 102, 130, 160, 199, 200, 201, 220, 300, 400, 500, 700, 799, 800: `INDEX_PAGES` | 2 min            | 30 s           |
| news articles      | 103–129, 131–159, 161–171, 202–219, 501–521, 600–699, 701–749: `NEWS_RANGES`             | 5 min            | 75 s           |
| everything else    | TV listings, weather, tables, stock prices…                                              | 30 min           | 2 min          |
| missing page (404) | any                                                                                      | 30 s             | 7 s            |

- A picture of a page (`/v1/images/…`) has the limit of its page. Errors are never cached.
- The browser gets a quarter of the limit, at most 2 minutes (`Cache-Control: public, max-age=…`).
- Every page and image answer says its limit in seconds in `X-Satanen-Ttl`, so the app can use the same number.
- **When Yle's limit comes near**: the Worker counts its own requests to Yle in the current hour (in memory, so only roughly: each copy of the Worker counts for itself). Past 70 % of Yle's 300 an hour, every limit is doubled for the rest of the hour. At 250 the Worker stops asking Yle until the next hour (see "Protecting the key"). Copies are held in Cloudflare's cache for twice the limit so that a doubling can still use them.
- Every good answer is also kept as a "last good copy" for 24 h. If Yle fails or takes over 8 s, that copy is served with `X-Satanen-Stale: 1`. Older than 24 h gives 502.
- Every page and image answer has `X-Satanen-Cache: HIT | MISS | STALE`, `X-Satanen-Fetched-At` (ISO time, when Yle was asked) and `X-Satanen-Ttl`.
- The cache key is the path only; query strings and headers are ignored.
- **`?fresh=1` on a page** (D39 C): the app saw a list headline that its article doesn't match and asks for a newer copy. The Worker asks Yle again only if its stored copy is at least 30 s old (judged from the stored `X-Satanen-Fetched-At`, so all Worker copies in a data centre agree) and the hour's Yle count isn't running high; otherwise it answers from the cache as usual. The new copy replaces the stored one (same cache entry). If Yle fails, the copy it skipped is served. The request is counted like any other. Ignored on images. It is a query parameter, not a `Cache-Control: no-cache` request header, because that header would make browsers send a CORS preflight (the Worker allows only `Content-Type`).
- The cache works only on a real domain (`api.satanen.io`), not on `*.workers.dev`. Under `wrangler dev` it may not hold entries, so every call can show MISS.

## Page counts (D32)

The Worker counts which pages readers open, with no cookies, no accounts and nothing stored on the reader's device. Counts go to a Workers Analytics Engine dataset (`satanen_analytics`, kept by Cloudflare for three months; the free plan allows 100,000 writes a day).

| Request                     | What happens                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/opened/{100-899}` | The app says a reader opened that page. Answer `204`, counted, when there is no `Origin` header (the Android app) or it is in `ALLOWED_ORIGINS`. From another origin: `403`, not counted (PUB.14).    |
| every request sent to Yle   | Counted with its outcome (`ok`, `not-found`, `timeout`, `failed`, `status-401`…) and the Cloudflare data centre that asked, to watch Yle's limit of 300 requests an hour. Cache hits are not counted. |

What one "page opened" record holds: page number, country (from Cloudflare), `web` or `app`, and a **daily visitor hash**. The hash is an HMAC of the day, the IP address and the browser string with the secret `ANALYTICS_SALT`. It changes every day, so a reader can't be followed across days, and the IP address and browser string themselves are never written, logged or returned. Counting never delays or breaks an answer: if the binding or the secret is missing, nothing is counted.

- Set the secret once (from `proxy/`; pipe a random value so it never appears on screen): `openssl rand -hex 32 | npx wrangler secret put ANALYTICS_SALT`. Changing it later only starts a new set of visitor hashes.
- Read the numbers with `npm --prefix proxy run stats` (see "Reading the numbers" below).
- Layout of the records is at the top of `src/analytics.ts`.

### Reading the numbers

`npm --prefix proxy run stats` prints a plain-text report; `npm --prefix proxy run stats -- 30` covers 30 days (1 to 90, default 7). It shows readers and pages opened per day, the 20 most opened pages, countries, web versus app, and requests to Yle in the busiest hours and days next to Yle's limit (300 an hour, 7200 a day), with a warning near the limit, the requests per Cloudflare data centre (each one keeps its own cache), and a count of Yle's "limit used up" (401) answers.

It needs two lines in the repo's `.env.fixtures` (see `.env.example`; if they are still in the old `.env`, the command warns and reads them from there): `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ANALYTICS_TOKEN`. Make the token in the Cloudflare dashboard: My Profile, API Tokens, Create Token, Custom token, one permission only, Account > Account Analytics > Read. The token can read statistics and nothing else; it is never printed. "Readers" are daily visitor hashes, so they are approximate and can't be followed across days.

## Run it on your computer

1. `npm --prefix proxy install`
2. Copy `proxy/.dev.vars.example` to `proxy/.dev.vars` and fill in the Yle `YLE_APP_ID` and `YLE_APP_KEY` (the same values as in the root `.env.fixtures`). `.dev.vars` is ignored by git. Never commit it.
3. `npm --prefix proxy run dev` serves the Worker on <http://localhost:8787>. Try <http://localhost:8787/v1/pages/100.json>.

The app in development runs on `http://localhost:8081`. Production does not allow that origin (anything on a computer's own address could otherwise read the live proxy), so a development app must use this local proxy: set `EXPO_PUBLIC_PROXY_URL=http://localhost:8787` (as in `.env.example`). `npm --prefix proxy run dev` allows `https://satanen.io,http://localhost:8081` by itself (`--var ALLOWED_ORIGINS:…` in `package.json`), so nothing needs to be added to `.dev.vars`. A development app pointed at `https://api.satanen.io` gets 403.

## Check it

- `npm --prefix proxy run typecheck`
- `npm --prefix proxy test` (uses a fake Yle, so no key is needed)

## Put it online (api.satanen.io)

The Worker runs on Cloudflare at <https://api.satanen.io>. `wrangler.toml` tells Cloudflare to attach that address to the Worker; the DNS record and certificate are made automatically on deploy.

- **Deploy**: `npm --prefix proxy run deploy` (needs `wrangler login` once on this Mac).
- **Check production**: `npm --prefix proxy run smoke`. It asks the live proxy for page 100 (twice, to see a cache `HIT`), a missing page 999, an image, the CORS answer for `https://satanen.io` and the 403 for another origin, and fails if the Yle key shows up anywhere. To test another address: `npm --prefix proxy run smoke -- http://localhost:8787` (cache HIT may not hold locally).
- **After any merge that changes `proxy/`**: deploy, then smoke (see `docs/agents/ORCHESTRATOR.md`).
- **Yle keys** are Worker secrets, set once. Change them with `npx wrangler secret put YLE_APP_ID` and `YLE_APP_KEY` from `proxy/` (wrangler asks for the value; do not paste it into chat or files). They are never in git.
- If a new computer cannot find `api.satanen.io` right after the first deploy, that is its own DNS memory; it clears within the hour.

## Rules

- The key is read only from `env.YLE_APP_ID` and `env.YLE_APP_KEY`. It is never put in a response, a header or a log line. Tests check this, including error cases.
- No account id and no secrets in `wrangler.toml`.
