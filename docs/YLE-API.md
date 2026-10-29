# Yle teletext API: notes for the parser

Official docs: https://developer.yle.fi/en/api/index.html · Sample response: https://developer.yle.fi/static/teletext-api/100.json

## Endpoints

All need `?app_id=…&app_key=…` (keys from developer.yle.fi, Yle Tunnus account). **Only the proxy adds these.** Locally the keys live in `.env.fixtures` (for `npm run fetch-fixtures`) and `proxy/.dev.vars` (for the dev proxy), never in `.env`, which Expo copies into the app.

- `GET https://external.api.yle.fi/v1/teletext/pages/{page}.json` – page data (also `.xml`)
- `GET https://external.api.yle.fi/v1/teletext/images/{page}/{subpage}.png` – the page as a 720×456 image (subpages start at 1)
- `404` if the page doesn't exist right now, can't be read, or the number is invalid

## Response shape

```
teletext
  network: "YLE"
  page
    number, name ("Uutiset"), time (last modified, "2020-05-05T10:43:26")
    subpagecount, prevpg, nextpg, toptype ("Block"), animated
    subpage[]            ← may be a single object, not an array
      number, time (seconds to display on TV)
      content[]          ← three representations of the same 24 lines
        type: "text"       plain text, control chars → spaces
        type: "all"        text with control codes as {Keywords}: {Blue}{NB}{DH}{GWhite}…
        type: "structured" lines of runs ← USE THIS ONE
          line[]: number (1–24), run[]  ← run may be a single object
            run: bg, fg, length, Text?, charcode?, link?, size?
```

All numbers come as **strings**. Every `line`/`run`/`subpage` can be a single object instead of an array: normalise first.

### Run fields that matter

- `fg` / `bg`: colour names `black red green yellow blue magenta cyan white`; a `g` prefix (`gblue`, `gwhite`) means **mosaic graphics**, not text.
- `charcode`: present only on graphics runs. Treat graphics as decoration and drop them in reader mode.
- `link`: Yle already marks links. A page number (`"105"`) or a URL (`"https://yle.fi/tekstitv"`). Ranges like `400-409` arrive as two separate link runs.
- `size: "double height"`: a headline. The **next line** repeats the same runs with no `Text`; skip that companion line.
- `Text`: missing on empty runs (spaces).
- Column 1 is usually blank, but not always as a separate 1-char run (see quirks below).

## Quirks seen in fixtures

Found by surveying all 62 captured pages (October 2026); quirk 28 was found later on page 891 (RP.8), quirk 29 on the fund pages (RP.9). `src/parser/normalize.ts` handles each one; `src/parser/normalize.test.ts` has a fixture test for each.

| # | Quirk | Where seen | How normalize handles it |
| - | ----- | ---------- | ------------------------ |
| 1 | `run` is a single object instead of an array (about half of all lines) | 103 line 2 and most blank lines | Wrapped into a one-item array. |
| 2 | `subpage`, `content` and `line` are documented as possibly single objects, but every fixture sends arrays | none | Wrapped the same way (tested with a modified 103). |
| 3 | Every number is a string (`"103"`, `"40"`) | all pages | Parsed to integers; real numbers are accepted too. |
| 4 | `name` is `""` on most pages (46 of 62); only some index pages are named | 103, 725, 417… | Kept as `""`. The UI must fall back to something else (page number or section). |
| 5 | `prevpg` is missing on page 100 | 100 | `prevPage` is undefined. |
| 6 | `animated: "yes"` only on page 100; other pages have no `animated` field | 100 | `animated: boolean`. |
| 7 | Subpage `time` is display seconds (`"15"`, `"8"` on page 100), not a timestamp | all | `displaySeconds`. |
| 8 | Two page timestamps: `time` (Finnish local, no offset) and `utctime` (UTC, no `Z`) | all | `time` kept as sent; `updatedAt` = `utctime` + `Z`. Some pages are months old (101: 2025-05-26). |
| 9 | Runs without `Text` are blank cells; `Text` is never `""` or whitespace-only | all | `text` = `length` spaces, `hasText: false`. Every row joins to exactly 40 characters. |
| 10 | `Text` length always equals `length`, and runs on a row always sum to 40 | all | Columns computed from `length` (`run.column`). A mismatch warns; a too-short `Text` is padded with spaces so later runs keep their column, a too-long one is kept whole. A run is only skipped when its width is unknown. |
| 11 | The left spacer is not always a 1-char run: it can be a 2-char blank run (103 line 3) or part of a 40-char text run starting with a space (103 line 6) | 103 and most articles | Nothing dropped or trimmed; later steps must not assume a fixed spacer run. |
| 12 | Graphics colours are `g` + colour (`gblue`, `gwhite`, `ggreen`, `gyellow`, `gmagenta`…). Plain `green` also starts with g, so "starts with g" is wrong | 100, 199 (green page numbers) | Whole-name match; `fg` is the base colour and `graphics: true`. |
| 13 | Every `g` graphics run has `charcode` and every `charcode` run is graphics; its `Text` is mosaic characters like `####`, `pppp`, `hh` | 100 line 5 and many | `charcode` kept, `text` kept verbatim. Graphics runs found by quirk 28 have no `charcode`. |
| 14 | Text can contain DEL (`\x7f`, a solid block): mostly in graphics runs (charcode `7Fh`), but a few times in plain-text runs that are part of decorative art | 330, 401, 410, 418, 890; plain text on 420 lines 3, 5, 7 and 890 line 6 | Kept verbatim. `classify` treats any run holding DEL as decoration. |
| 15 | `size` only ever `"double height"` | 100, 103… | `doubleHeight: true`. `"double size"` (never seen) is treated as double height with a warning; other values warn and count as normal. |
| 16 | Double-height row is followed by a companion row with the same runs but no `Text`; links stay on the companion | 103 lines 3–4, 100 lines 6–7 | Both rows kept; the companion has `hasText: false` runs with `doubleHeight: true`. Skipping it is M1.3's job. |
| 17 | `link` values: 3-digit page (`"136"`), `https://…`, `mailto:…`, and `">>>"` | 100, 101, 417, 199 | `{kind:'page', page}`, `{kind:'url', href}`, `{kind:'other', raw}`. |
| 18 | URL link text omits the scheme (`yle.fi/tekstitv` → `https://yle.fi/tekstitv`) | 100, 101, 190, 410, 700… | `href` from `link`, display text unchanged. |
| 19 | Ranges arrive as link, plain `-` run, link: `406`,`-`,`408`; sometimes ` - ` with spaces | 100 line 22, 101 line 23 | Kept as three runs; merging is a later step. |
| 20 | Yle's link detector also fires inside mosaic graphics, one digit per run (`7`,`5`,`7` each linking 757). On screen these are blocks, not digits | 890 line 2 | Kept (with `graphics: true`); later steps should drop links on graphics runs. |
| 21 | Plain green text links inside a row of graphics, e.g. index page numbers | 190, 199 | Normal text runs (`graphics: false`). |
| 22 | `toptype` is `normal`, `group` or `block`, but it does **not** tell indexes from articles (see below) | all | `topType` kept, never used by the parser. |
| 23 | `content` holds three copies of the rows (`text`, `all`, `structured`) | all | Runs come from `structured`; `all` is only read to find graphics cells (quirk 28). |
| 24 | 404s are XML (`NoSuchKey`), not JSON | 112, 999 | Error result `not-a-page`, never a throw. |
| 25 | On 420, mosaic art arrives in plain-colour runs (`fg: "green"`), although the `all` content shows `{GGreen}` (graphics mode). `structured` loses the graphics flag there | 420 rows 7, 21–23 | Fixed in normalize by quirk 28. As a safety net, `classify` still drops such rows by their look (DEL, or symbols with no word or number) when `all` cannot be used. |
| 26 | `">>>"` links appear only on 199 subpages 2 and 3 (bottom bar), not on the last subpage 4: the TV's "continues on the next subpage" arrow | 199 | `classify` blanks it and does not keep it as a link; reader mode joins subpages anyway. |
| 27 | Yle's link detector marks any 3-digit number as a page link, also in prose and tables: `161 prosenttia` (162), `200 m` (417), points `340` (298), scores `185-127` (260) | many | `classify` keeps them in `links`; it never treats a lower-case "number + text" row as a headline, and never merges a falling pair like `185-127` into a range. Later steps should be wary of links in paragraphs and tables. A 3-digit link followed by a decimal part (`-439,32`, `62 734,60` on 174, `206,91` on 175) is a number, not a link: `collectLinks` drops it, so quote rows stay table rows. |
| 28 | After a separated-graphics code (`{SG}`), `structured` loses the graphics flag until the next contiguous-graphics code (`{CG}`): mosaic cells arrive as plain text, often in the same run as real words (`+ bs,bupuu AURINKO   NOUSEE LASKEE`). The `all` content keeps every control code. In graphics mode, upper-case letters still show as text ("blast-through"): `TORSTAI` on 130 and 160 | 891 rows 2–14 (big date and sun picture), 890 rows 4–6, 700 and 799 rows 1–3, 420 | `normalize` reads the row's `all` text with the teletext rules (`src/parser/graphicsMode.ts`: `{GRed}`… switch to graphics, `{Red}`… back to text, both from the next cell; every code takes one cell) and splits a plain run where its cells are mosaic; the mosaic pieces get `graphics: true` and `graphicsFromAll: true`. Blast-through letters stay text. When the `all` row has an unknown code or does not match `structured` cell for cell, the row is left as `structured` sent it. |
| 29 | A run can carry `conceal: "true"` (`{Conceal}` in `all`): a TV hides those cells until the viewer presses "reveal". On the fund pages 181-187 row 2 they hold `sn`, where Yle's page image shows the subpage counter (`1/16`) | 184, 187 (also 181-183, 185, 186 live) | `concealed: true` on the run; `classify` blanks it like decoration, so the title reads `Osakerahastot O-Z`. The counter is the reader's subpage divider. Watch for: if Yle ever conceals real content (quiz answers), reader mode cannot reveal it; check `normalize.test.ts`'s list of concealed rows when fixtures are refreshed. |
| 30 | On the stock and fund pages the price changes carry their direction in the run colour, as page 175/2 explains (`nousevien kurssien muutosprosenttia merkitään keltaisella ja laskevien sinisellä`): rising `yellow`, falling `cyan`. In every fixture the colour matches the sign, `+0,00` included (yellow). Two changes of the same colour on one row can arrive as one run (`+0,15  +30,82` on 184) | 176, 184, 187 | `blocks` marks them in `TableBlock.trends` (`trendMarks`), only in tables with a `MUUTOS` column label and only when colour and sign agree; the reader colours them with `price-up` / `price-down`. The index line `OMXH 13 206,91 ( +0,64 )` under 175-176 is a paragraph and stays plain. |

### Does `toptype` tell index pages from articles? No.

Checked over all 62 fixtures (October 2026):

- `group`: 102, 130, 160, 175, 190, 201 (indexes), but also **301 and 302** (TV guides, really tables).
- `block`: 100, 200, 300, 400, 460, 470, 500, 700 (indexes / section fronts).
- `normal`: all articles and tables, but also the indexes **101, 199 (main index), 330, 410, 575, 799, 890**.

So `toptype` agrees with the page's real type only some of the time, and is wrong in both directions. The parser does not use it; `classify` decides per row from the content instead.

## Line classification (`src/parser/classify.ts`)

Layer 2 of the parser labels every row of every subpage with a kind (`drop`, `blank`, `title`, `headline`, `heading`, `nav`, `table`, `paragraph`) and the id of the rule that decided it. The rule list and order are at the top of `classify.ts`; each rule has a fixture test in `classify.test.ts`. The plan below is the original sketch; where they differ, the code wins.

## From grid to reader blocks

1. **Normalise** arrays and numbers; build `Page → Subpage → Line → Run`.
2. **Drop decoration**: runs with a `g…` fg; lines made only of graphics (logo rows, `####`/`pppp` separators).
3. **Header**: lines 1–4 are the Teksti-TV header and page title area; use `page.name` and the page number instead of rendering them.
4. **Classify each remaining line**:
   - starts with a `link` run followed by text → **headline row** (number + headline) on index pages
   - `double height` → **heading** (article title or lead)
   - coloured `bg` (not black) with several links → **navigation row** → collected into the **Aiheesta** list
   - columns aligned with runs of 2+ spaces, many digits → **table** (sports results, standings, weather) → keep as a monospace block, don't reflow
   - otherwise → **paragraph text**
5. **Reflow paragraphs**: join consecutive text lines into paragraphs; join words split with a trailing hyphen; a blank line ends a paragraph.
6. **Inline links**: link runs inside paragraphs become inline page links, rendered as *words (160)*.
7. **Subpages**: concatenate into one article, separated by a `2/3` divider.
8. **Fallback**: if a page is mostly graphics or a table classifier is unsure, offer the PNG image.

## Page names for type-ahead

`page.name` gives each page's name (e.g. "Uutiset"). The jump sheet's suggestions ("2 → 201 Urheilu, 230–239 Jääkiekko…") need a list of pages and names: build a small static map of known sections from the index pages (100, 199, 200…) during the spike, refresh it from live data later.

## Known sections (from Yle's sample; verify live)

100 Etusivu · 101 Uutiset · 160 Talous · 190 English · 199 Päähakemisto · 201 Urheilu · 300 Ohjelmat · 350 Radiot · 400 Sää · 470 Veikkaus · 500 Alueet · 575 Teksti-TV · 799 Svenska · 890 Kalenteri

## Caching

Proxy: cache each page JSON for 30–60 s at the edge. App: keep the last copy of favourites and recent pages on the device; show *Päivitetty 14:32 · ei yhteyttä* when offline.
