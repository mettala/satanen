# Satanen

A calm, modern reader for Yle Teksti-TV. *Satanen* ("a hundred") is named after page 100, where teletext always starts. It is an independent app and must never look like an official Yle product.

## Logo

The mark is **"100" drawn in rounded teletext mosaic blocks on the graphite ground**, each digit in a section colour: 1 in `section-news`, the first 0 in `section-sport`, the second 0 in `section-business` (dark-theme values, so they glow on graphite). The colour system *is* the logo.

- **App icon (iOS)**: `assets/Logos/satanen-icon.svg`, graphite `#15181D` tile, digits filling the tile.
- **App icon (Android adaptive)**: `assets/Logos/satanen-icon-android.svg`, same mark scaled down to sit inside the round safe zone, on a full-bleed graphite background.
- **In the app**: the mark at 28px beside the wordmark **Satanen** in `title` style replaces the screen title on the front page. On the light theme the mark keeps its graphite tile.
- Never recolour the digits, put the mark on a colour other than graphite, or rebuild "100" in a font. Below 24px use the tile alone, without the wordmark.
- The wordmark is plain Schibsted Grotesk 800, letter-spacing −0.02em, sentence case: *Satanen*.

## Principles

- **Content first.** Teletext is short text. No images, no decoration competing with it; whitespace and type do the work.
- **Familiar, not retro.** It behaves like a modern news site (sections, tabs, scrolling articles). Teletext shows through only in the page numbers.
- **Colour means section.** Each section owns one colour, used for its label, dot and active tab. Everything else is ink on a quiet ground, except rising and falling prices (see Colour).
- **Every page number is a way in.** Numbers stay visible and tappable, and typing one is always one tap away.

## Voice

Finnish only (owner decision 2026-10-25: no Swedish or English UI planned). Short, plain UI words: *Siirry sivulle…*, *Suosikit*, *Päivitetty 14:32*, *Sivua ei löytynyt*. No exclamation marks. Times as 14:32 (colon; hour without leading zero: 9:05, 0:13), dates as 21.10.

Attribution is required by Yle's API licence: show **"Sisältö: Yle Teksti-TV"** in Asetukset → Tietoja, with the sentence that Satanen is independent of Yle (owner decision, D24). It is not shown under articles or in the drawer.

## Colour

Two themes: **Vaalea** (light) and **Tumma** (neutral dark grey). The app follows the phone's setting.

- `bg` under everything; `surface` for raised cards and sheets; `field` for inputs.
- `ink` for all reading text; `ink-muted` for page numbers, times and inactive tabs.
- Section colours (`section-news`, `section-world`, `section-business`, `section-sport`, `section-weather`) are for **labels, 8px dots and the active tab only**, never for body text or large fills. Sections without a colour use `section-other`.
- `link` is only for tappable page links in article text and the Aiheesta list. It is deliberately darker than `section-news` so links and labels don't blur together.
- `danger` only on error states.
- `price-up` and `price-down` only for the price-change values in the stock and fund tables (pages 176–187): rising in `price-up` (Yle's yellow), falling in `price-down` (Yle's blue), as page 175 explains. Text colour only, never a fill, and the `+` / `-` sign always stays, so the meaning never rests on colour alone.

All text tokens meet 4.5:1 on `bg` and `surface` in both themes (checked by `src/theme/contrast.test.ts`).

## Typography

One family: **Schibsted Grotesk** (Google Fonts, free to bundle). Headlines are heavy (800) and tight; reading text is regular at 18/28.

| Style | Use |
|---|---|
| `display` 30/33 · 800 | Article title |
| `lead` 27/30 · 800 | Front-page lead story |
| `title` 24/28 · 800 | Screen titles |
| `headline` 17/22 · 500 | Headline rows |
| `body` 18/28 | Article text |
| `body-sm` 16/23 | Ingress, drawer and list rows |
| `label` 12/16 · 700 · caps | Section labels |
| `meta` 13/18 | Page numbers, times (tabular figures) |
| `tab` 12/16 · 600 | Tab bar |

Respect the phone's text-size setting: all sizes scale together.

## Layout

- Screen gutter `space-5` (20px) on list screens, `space-6` (24px) in articles.
- Rows are separated by 1px `line` hairlines; cards use `radius-lg` and `surface`, no shadows.
- Everything tappable is at least `touch` (44px).

## Navigation

- **Tab bar** (bottom): Etusivu · Uutiset · Urheilu · Sää · Suosikit. It is shown on every screen that shows a page. Active tab takes its section colour (Suosikit: `ink`).
- **☰ drawer** (top-left): all sections with colour dots and page numbers, plus a link to settings.
- **Siirry sivulle…** field at the top opens the jump sheet: big section tiles, and a number field with **type-ahead**: typing `2` immediately lists meaningful 2xx pages (e.g. 201 Urheilu, 235 Liiga), `23` narrows to 23x. Three digits jump straight to the page. Suggestions come from page names in the API.
- **Article**: all subpages joined into one scroll, separated by a hairline with `2/3`. Previous/next story at the bottom.

## Links

- Page numbers inside article text: underlined `link` text, number in brackets: *sähkön hinnasta (160)*.
- Teletext's bottom navigation rows become the **Aiheesta** list at the end of the article: name left, `160 ›` right in `link`.

## States

- **Loading**: `skeleton` bars in the shape of the content, no spinners.
- **Error**: `danger` icon and title, one plain sentence, one action (*Yritä uudelleen* / *Etusivulle*).
- **Offline**: show the last copy with *Päivitetty 14:32 · ei yhteyttä* in `meta`.

## Iconography

Simple 24px outline icons, 1.8px stroke, round caps, `currentColor`. No emoji, no filled icons except the active favourite star.
