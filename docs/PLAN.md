# Satanen: product and delivery plan

## Goal

A free, public app on the Play Store (then App Store) that makes Yle Teksti-TV pleasant to read on a phone: modern typography, sections, tappable links, favourites. A web app at satanen.io comes first, from the same code.

## MVP scope

**In**
- Reader mode only: teletext pages re-laid out as native text (see `YLE-API.md`)
- Front page: lead story + headlines grouped by section (from page 100 and section index pages)
- Article: all subpages joined into one scrolling article; previous/next story
- Links: page numbers in text become links; teletext's bottom navigation rows become the "Aiheesta" list
- Navigation: tab bar (Etusivu, Uutiset, Urheilu, Talous, Sää), ☰ drawer with all sections and Suosikit, "Siirry sivulle…" jump sheet with type-ahead (typing `2` suggests meaningful 2xx pages)
- Favourites with live preview cards (switched off on the web for now and kept for the store apps, D37); recent pages
- Light (Vaalea) and dark (Tumma) themes, following the phone
- Loading, "Sivua ei löytynyt" and offline states; last copy cached on device
- Finnish UI; Yle attribution in Asetukset: Tietoja (owner decision 2026-10-23, D24)

**Out (later)**
- Classic 40×24 teletext view
- iOS release, home-screen widget, "notify me when page X changes", search

**Fallback**: pages the reader mode can't handle well (weather maps, teletext art) show Yle's PNG image of the page (`/v1/teletext/images/{page}/{sub}.png`, via the proxy).

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Expo + React Native + TypeScript + expo-router | One codebase → web, Android, iOS; cloud builds (EAS), no Android Studio needed |
| API proxy | Cloudflare Worker | Keeps the key secret; shared 30–60 s cache so all users share one Yle fetch; free tier is enough |
| Web hosting | Cloudflare, satanen.io | Same account as the proxy |
| Storage | AsyncStorage on device | Favourites, recent, settings, cached pages. No accounts or server DB |
| Font | Schibsted Grotesk (Google Fonts, OFL) | Bundled with the app |

## Phases

0. **Setup (owner)** – Yle API keys ✅, domain satanen.io ✅, GitHub repo, accounts: GitHub, Expo, Cloudflare (free), Google Play developer (≈ $25 one-time). Email api.apua@yle.fi describing the app (free, non-commercial, re-laid-out, attributed): sent 2026-10-23, reply pending. Start recruiting ~12 Android testers now.
1. **Parser spike** – fetch ~50 representative pages through the key and save them in `fixtures/` (front page, indexes, news articles, sports results/tables, weather, TV guide, Swedish 799, English 190). Build parser + reader rules with tests. Deliverable: a simple preview screen to flip through real pages and spot bad layouts.
2. **Web MVP** – proxy + app deployed to satanen.io; installable to the home screen. Done: live; search engines may list it since version 1.0.0 (D52, lifting D20).
3. **Android release** – EAS build → internal test → **closed test with ≥ 12 testers for 14 days** (Google's rule for new personal developer accounts; check the current rule in Play Console) → production. Finnish store listing, screenshots, short privacy policy (no tracking, no ads; page counts with a daily visitor code, D32, D45).
4. **After launch** – iOS (Apple developer ≈ $99/yr), classic view, widget, change alerts.

## Risks

- **Licence fit**: re-layout is arguably not "modifying" content, but confirm with Yle by email before the public release. Keep attribution and independent branding.
- **Experimental API** (docs from 2020): check reliability and rate limits early; the proxy cache protects Yle and us.
- **Parser heuristics**: teletext pages are hand-laid-out; some will break. The PNG fallback means a bad layout is never a dead end.
- **Name**: "Satanen" can read as "Satan" to non-Finnish speakers; fine in Finland, worth keeping in mind for store review. Do a trademark search (PRH) before release.

## Costs

Google Play $25 once. Cloudflare and Expo free at this scale. satanen.io domain yearly fee. Apple $99/yr only when iOS is added.
