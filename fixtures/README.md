# Fixtures

Real responses from the Yle Teksti-TV API, saved by `npm run fetch-fixtures` for offline parser tests.
Content is (c) Yle and is used only for testing; it is not part of the app. No API keys or
query strings are stored (`fixtures/no-secrets.test.ts` checks this).

The fixtures are Yle content and are not covered by the project licence; see [NOTICE.md](../NOTICE.md). They are for tests only. Do not add more: ask the maintainer first. Design mock-ups `design/screens/08-uutisvirta.dc.html`, `09-artikkeli-virrasta.dc.html`, `10-talous.dc.html` and `11-paivitys.html` also contain real Yle text, and `design/screens/12-hakemisto.html` (with its PNG) holds the entries of Yle's page 199 and the region names of page 500.

The folder `fixtures/live-index` is no longer committed: the weekly section-map workflow reads the live index pages in memory and commits only `src/sections/sectionMap.generated.ts`.

- `pages/<n>.json`: API response for page `<n>`. A 404 is stored as `{"_fixture": "not-found", "status": 404, ...}`.
- `images/<n>.png`: PNG of subpage 1.

| Page | What it is                                                                                                 | First text line (auto)                  | Subpages | PNG | Captured   |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------- | --- | ---------- |
| 100  | Front page (Uutiset), 4 subpages                                                                           | 136 Putin: Olen valmis neuvotteluihin   | 4        | yes | 2026-10-21 |
| 101  | Uutiset index                                                                                              | UUTISET 190 News in English             | 1        | yes | 2026-10-21 |
| 102  | Kotimaa index                                                                                              | 103 Etelässä odotetaan lämpenemistä     | 1        | yes | 2026-10-21 |
| 103  | Domestic news article                                                                                      | Keskiviikkona aamulla liikenteessä      | 1        | yes | 2026-10-21 |
| 104  | Domestic news article                                                                                      | Limingassa neljä ihmistä loukkaantui    | 1        | yes | 2026-10-21 |
| 105  | Domestic news article                                                                                      | Jyväskylässä Hämeenkadulla              | 1        | yes | 2026-10-21 |
| 109  | Domestic news article                                                                                      | Valtion tieto- ja                       | 1        | yes | 2026-10-21 |
| 110  | Domestic news article                                                                                      | Poliisi epäilee, että eilen             | 1        | yes | 2026-10-21 |
| 136  | Foreign news article                                                                                       | Venäjän presidentti Vladimir Putin      | 1        | yes | 2026-10-21 |
| 199  | Main index (Paahakemisto), 4 subpages                                                                      | 101 UUTISET 112 Vaaratiedotteet         | 4        | yes | 2026-10-21 |
| 200  | Urheilu index                                                                                              | 228 SUOMI-SARJA 269 DIVARIT             | 1        | yes | 2026-10-21 |
| 201  | Urheilu news index (sports headlines)                                                                      | 277-278 Memphis - Utah torstaiaamuna    | 1        | yes | 2026-10-21 |
| 202  | URHEILUSÄHKEET bulletin (no heading), "120 NHL-ottelua" in sentences                                       | kaikkien aikojen lyöjäkuningatar        | 2        | yes | 2026-10-24 |
| 203  | SM cross-country results (no text, a sports feed item on 24.10.)                                           | Miesten 10 km                           | 2        | no  | 2026-10-24 |
| 205  | Sports news article                                                                                        | Miesten jääkiekkoliigajoukkue HIFK on   | 1        | yes | 2026-10-21 |
| 207  | F1 practice lap times (table only, a sports feed item)                                                     | 1. Lewis Hamilton Ferrari 1.34,893      | 1        | no  | 2026-10-24 |
| 218  | Alpine skiing results (a sports feed item)                                                                 | Sölden, Itävalta                        | 1        | no  | 2026-10-24 |
| 221  | Liiga scores with goal scorers (a sports feed item)                                                        | Ilves - Jukurit vl 1-2 (0-0,0-0,1-1)    | 1        | no  | 2026-10-24 |
| 160  | Talous index                                                                                               | 161 Netflixin osake laskussa            | 1        | yes | 2026-10-21 |
| 190  | English news page                                                                                          | on the 1st June 2026.                   | 1        | yes | 2026-10-21 |
| 230  | Liiga table, 2 subpages                                                                                    | Pelicans 13 10 0 0 3 50- 31 30          | 2        | yes | 2026-10-21 |
| 233  | Ice hockey table, 3 subpages                                                                               | HIFK 11 7 3 0 1 35- 20 27               | 3        | yes | 2026-10-21 |
| 235  | NHL results with goal scorers and bracketed assists, 5 subpages                                            | Pittsburgh - Florida 4-0                | 5        | yes | 2026-10-23 |
| 237  | NHL table, 3 subpages                                                                                      | Carolina 11 7 1 1 2 42- 27 17           | 3        | yes | 2026-10-21 |
| 242  | Football table (Veikkausliiga), 5 subpages                                                                 | FC Inter 28 14 10 4 34-20 52            | 5        | yes | 2026-10-21 |
| 246  | Football results, 4 subpages                                                                               | FC Honka - ÅIFK YT 1-0                  | 4        | yes | 2026-10-21 |
| 250  | Football table, 3 subpages                                                                                 | VJS 9 6 0 3 22-14 21                    | 3        | yes | 2026-10-21 |
| 254  | Table, 2 subpages                                                                                          | Kuusamo 5 4 0 0 1 13-5 12               | 2        | yes | 2026-10-21 |
| 260  | Table with page links, 4 subpages                                                                          | HIFK 5 4 1 0 185-127 9                  | 4        | yes | 2026-10-21 |
| 263  | Table, 3 subpages                                                                                          | SPV 7 6 1 0 0 59-23 20                  | 3        | yes | 2026-10-21 |
| 270  | Basketball results, 3 subpages                                                                             | Szombathely - Vilpas 85-72              | 3        | yes | 2026-10-21 |
| 298  | F1 standings, 4 subpages                                                                                   | 1. Kimi Antonelli ITA Mercedes 340      | 4        | yes | 2026-10-21 |
| 299  | WRC standings, 2 subpages                                                                                  | 1. Elfyn Evans GBR Toyota 243           | 2        | yes | 2026-10-21 |
| 300  | TV / Radio index                                                                                           | 302 TV2 312 Yle Teema & Fem             | 1        | yes | 2026-10-21 |
| 301  | TV guide YLE TV1, 3 subpages                                                                               | 22.50 Ruotsalainen paloittelumurha (12) | 3        | yes | 2026-10-21 |
| 302  | TV guide YLE TV2, 3 subpages                                                                               | 23.00 Paratiisi (12) T A >354           | 3        | yes | 2026-10-21 |
| 310  | TV guide, 3 subpages                                                                                       | 06.25 Ylen aamu A                       | 3        | yes | 2026-10-21 |
| 330  | TV index                                                                                                   | 334 Tekstitys TV2                       | 1        | yes | 2026-10-21 |
| 400  | Saa ja liikenne index                                                                                      | ja lämpötiloja ulkomailla               | 1        | yes | 2026-10-21 |
| 401  | Weather, 2 subpages                                                                                        | Säätiedotus klo 22                      | 2        | yes | 2026-10-21 |
| 402  | Weather, 3 subpages                                                                                        | Hki-Vantaa 9 E 4 SELKEÄÄ                | 3        | yes | 2026-10-21 |
| 405  | Five-day weather forecast (plain text article)                                                             | Viiden vuorokauden ennuste ajalle 22.-  | 1        | yes | 2026-10-21 |
| 406  | Weather table (observations)                                                                               | klo 18 klo 00 klo 06                    | 1        | yes | 2026-10-21 |
| 407  | Weather table (forecast)                                                                                   | klo 15 TO PE LA                         | 1        | yes | 2026-10-21 |
| 410  | Traffic index, graphics-heavy title, 2 subpages                                                            | 411 Eteläinen Suomi                     | 2        | yes | 2026-10-21 |
| 420  | Graphics-heavy index                                                                                       | ............. .... .... ..              | 1        | yes | 2026-10-21 |
| 425  | Airport board Tampere-Pirkkala, departures and arrivals, 6 subpages                                        | 05:25 Riika BT358                       | 6        | yes | 2026-10-25 |
| 426  | Airport board Helsinki-Vantaa departures, 4 subpages (flight numbers and trailing numbers marked as links) | 16:10 Mancheste AY1365 Sulj 200         | 4        | yes | 2026-10-25 |
| 427  | Airport board Helsinki-Vantaa arrivals, 4 subpages                                                         | 15:00 Riika AY1074 Arvioit 19:56        | 4        | yes | 2026-10-25 |
| 460  | Ravit index                                                                                                | Frankriken, Deauvillen, Kempton         | 1        | yes | 2026-10-21 |
| 470  | Veikkaus index                                                                                             | 472 Vikinglotto, Jokeri, Lomatonni      | 1        | yes | 2026-10-21 |
| 500  | Alueuutiset index                                                                                          | 503 Häme 513 Pohj.-Pohjanmaa            | 1        | yes | 2026-10-21 |
| 575  | Teksti-TV info index                                                                                       | 569 Kanavahaun uusimisen perusohje      | 1        | yes | 2026-10-21 |
| 700  | Svenska index (pa svenska)                                                                                 | 702-709 Inrikes 715-719 Sport           | 1        | yes | 2026-10-21 |
| 714  | Svenska page                                                                                               | Listan på nyheter hittar du på          | 1        | yes | 2026-10-21 |
| 725  | Swedish multi-subpage article, 3 subpages                                                                  | Gammelstadsforsen                       | 3        | yes | 2026-10-21 |
| 799  | Svenska section                                                                                            | 701-714 NYHETER 715 SPORT               | 1        | yes | 2026-10-21 |
| 890  | Kalenteri index                                                                                            | 889 Koko vuoden kalenteri 2026          | 1        | yes | 2026-10-21 |
| 130  | Foreign news index                                                                                         | 131 Witkoff tapasi Putinin              | 1        | yes | 2026-10-21 |
| 131  | Foreign news article                                                                                       | Yhdysvaltojen erityislähettiläs Steve   | 1        | yes | 2026-10-21 |
| 132  | Foreign news article                                                                                       | Avaruusyhtiö SpaceX:n toimitusjohtaja   | 1        | yes | 2026-10-21 |
| 161  | Economy article                                                                                            | Suoratoistopalvelu Netflixin osakkeen   | 1        | yes | 2026-10-21 |
| 162  | Economy article                                                                                            | Miljardööri Elon Musk sanoo, että       | 1        | yes | 2026-10-21 |
| 163  | Economy article                                                                                            | Asuntojen hintojen odotetaan nousevan   | 1        | yes | 2026-10-21 |
| 403  | Weather text, 5 subpages                                                                                   | Merisääennuste klo 21.00                | 5        | yes | 2026-10-21 |
| 404  | Weather text                                                                                               | Kotka 11 SE 5 Kylmäpih 11 E 9           | 1        | yes | 2026-10-21 |
| 408  | Weather table, 3 subpages                                                                                  | klo 15 TO PE LA                         | 3        | yes | 2026-10-21 |
| 417  | Road conditions, 44 subpages (stress case)                                                                 | Tarkempi paikka: Topinoja. Haittaa      | 44       | yes | 2026-10-21 |
| 418  | Map-heavy article (Finland map graphic beside text), 2 subpages                                            | 19.10.                                  | 2        | yes | 2026-10-21 |
| 419  | Graphic + text page                                                                                        | Esimerkki: Vaasa -7 Ls SE3              | 1        | yes | 2026-10-21 |
| 112  | Valid-looking page that returned 404 at capture time (no hazard notices)                                   | HTTP 404                                | -        | no  | 2026-10-21 |
| 174  | World stock market quotes (monospace rows, numbers split over lines)                                       | Nikkei : -439,32 = -0,70                | 1        | yes | 2026-10-24 |
| 175  | Linked from indexes                                                                                        | 175 Sisällysluettelo ja ohjeet          | 2        | yes | 2026-10-21 |
| 999  | Non-existent page, 404 with XML error body                                                                 | HTTP 404                                | -        | no  | 2026-10-21 |
| 189  | Electricity spot price (Pörssisähkö), 4 subpages, "Keskihinnat s.188" and ">>" hints                       | Hinta nyt 0,25 snt/kWh (sis. ALV:n)     | 4        | no  | 2026-10-25 |
| 196  | Alphabetical index (Aakkosellinen hakemisto), 3 subpages, "Svenska sidor index på s." bar                  | Aamu-tv:n aiheet 399                    | 3        | no  | 2026-10-25 |
| 197  | Alphabetical index M-S, 3 subpages, notes wrapped into the next row                                        | Maailman sää 408                        | 3        | no  | 2026-10-25 |
| 198  | Alphabetical index T-Y, 4 subpages, a page list continued on the next row                                  | Talousuutiset ja -sivut 160             | 4        | no  | 2026-10-25 |
| 891  | Calendar page, "Ajatus päivälle s." reference                                                              | KESÄAIKA PÄÄTTYY                        | 1        | no  | 2026-10-25 |
| 176  | Helsinki stock exchange, OMXH Large Cap, 5 subpages (title and column labels on one row, two-row records)  | OSTO MYYNTI ALIN YLIN VIIM              | 5        | no  | 2026-10-25 |
| 184  | Equity fund prices O-Z, 16 subpages (stamp row, concealed "sn" cells, two column-header rows)              | OSUUDEN MUUTOS MUUTOS                   | 16       | no  | 2026-10-25 |
| 187  | Alternative and real-estate funds, 8 subpages (title wrapped into a column-header row)                     | rahastot OSUUDEN MUUTOS MUUTOS          | 8        | no  | 2026-10-25 |

Parser baseline: `scripts/parser-baseline.test.ts` (part of `npm test`) compares every fixture page with `fixtures/parser-report.baseline.json` and fails if a page newly falls back or reads with low confidence. After a deliberate change, run `UPDATE_PARSER_BASELINE=1 npx vitest run scripts/parser-baseline.test.ts` and commit the new file.

## Notes on the API

- A missing page returns 404 with an XML body (`NoSuchKey`, served by S3/CloudFront), not JSON. Pages that normally exist can 404 temporarily (112 did).
- Success responses are JSON; `subpage` can be an object or array and numbers are strings (see docs/YLE-API.md).
- 417 has 44 subpages and is about 490 KB, a good stress test.
- Rate limiting: none seen. About 130 sequential requests with a 300 ms delay all succeeded and no rate-limit or retry headers were returned.
- Subpage counts and content change through the day; this is a snapshot.
