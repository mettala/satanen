# Mock-ups

`screens/` holds the source of the final mock-ups (390×844 phone screens). They are Design Component files from the design canvas: plain HTML with inline styles, `{{holes}}` filled from the small script at the bottom of each file. They need the canvas runtime to render, so view them on the canvas:
https://claude.ai/artifact/7HSA5gVi6wTzhi4o3YLQZ6 (page "Lopulliset näkymät").

Use them as a **reference for layout, spacing and copy** when building the real screens. Colours and type must come from `../design-system/tokens.json`, not be copied as hex values.

| File | Screen |
|---|---|
| `01-etusivu` | Front page: header with logo, jump field, lead card, sections, tab bar |
| `02-siirry-sivulle` | Jump sheet after typing "2": favourites match, 2xx groups, number keyboard |
| `03-valikko` | ☰ drawer with all sections (mock-up still shows the attribution; it moved to Asetukset, D24) |
| `04-suosikit` | Favourites as live preview cards |
| `05-artikkeli` | Article: label, title, joined subpages, inline link, Aiheesta, prev/next (mock-up still shows the attribution, D24) |
| `06-lataus-virhe` | Loading skeleton and "Sivua ei löytynyt" |
| `07-logo` | Logo variations (B3 chosen) |
| `08-uutisvirta` | Uutiset feed (M3.25): ☰, chips Kaikki · Kotimaa · Ulkomaat, items with label, headline and first paragraph (the 4th, just below the fold, is still loading its paragraph); bar Etusivu · Uutiset · Urheilu · Talous · Sää |
| `09-artikkeli-virrasta` | Article opened from the feed, scrolled to its end: ☰ · ‹ Takaisin · 105 ☆ header, next-story card with the next headline |
| `10-talous` | Talous feed (page 160), no chips. The Urheilu feed (page 201) uses the same layout in green |
| `11-paivitys.html` | "Päivitä lista" and "Sivu päivitetty" (D39 / FR.1). Plain HTML, opens in any browser |
| `12-hakemisto.html` | Proposal for page 199 Päähakemistojen kooste (RP.11): grouped rows, 1/4 counters, and three options for Yle's cut region names. Plain HTML, opens in any browser; `png/12-hakemisto.png` is a picture of it |

Each phone screen has a `mode` prop (`light` / `dark`) for the two themes.

`08`–`10` aren't on the canvas yet. `png/` has light + dark pictures of them, rendered from these files.
