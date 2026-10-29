# Design decisions

Made in design rounds on 21.10.2026. The full exploration (all A/B/C options) is on the mock-up canvas; the result is in `design-system/` and `design/screens/`.

| # | Topic | Choice | Notes |
|---|---|---|---|
| 1 | Look & feel | **Pohjoinen** | Light Nordic minimal, soft surfaces, lots of air |
| 2 | Front page | **Newspaper front** | One lead story card, then headlines grouped under section labels |
| 3 | Navigation | **Tabs + "Siirry sivulle…" field** | Familiar app pattern |
| 4 | Article | **One continuous article** | All subpages joined, `2/3` dividers, next story at the bottom |
| 5 | Dark theme | **Tumma** (was Grafiitti) | Neutral dark grey (#15181D), mirrors light |
| 6 | Section colour | **Own colour per section** | Kotimaa blue, Ulkomaat teal, Talous orange, Urheilu green, Sää purple; others grey |
| 7 | Typeface | **Schibsted Grotesk** | Built for Nordic news; 800 headlines, 400 body |
| 8 | Links | **Inline underlined + "Aiheesta" list** | In-text numbers → *words (160)*; teletext nav rows → list at the end |
| 9 | Go to page | **Jump sheet with type-ahead** | Typing `2` immediately lists meaningful 2xx groups; favourites first; 3 digits jump |
| 10 | All sections | **☰ side drawer** | With colour dots, page numbers, settings (attribution moved to Asetukset: Tietoja, D24) |
| 11 | Favourites | **Live preview cards** | Each card shows what's on the page now + update time |
| 12 | Name | **Satanen** | "A hundred", after page 100. Domain satanen.io |
| 13 | Logo | **B3 · Grafiitti mosaic** | "100" in rounded teletext blocks on graphite, one section colour per digit |

## Tabs

**Etusivu · Uutiset · Urheilu · Talous · Sää** (owner, 24.10.2026; built in M3.22b). The active tab takes its section colour (Etusivu and Uutiset: `section-news`, Talous: `section-business`). Suosikit moves out of the bar and into the ☰ drawer. ☰ is always visible: it sits top-left on every screen (see "The ☰ button on every screen" below). Uutiset, Urheilu and Talous become scrolling feeds (M3.25).

## Open items

- Real page names for type-ahead groups and favourite previews (placeholders in mock-ups, marked with [brackets]) — come from the parser spike.
- Store screenshots (the listing copy is drafted in `docs/store/`).

## News feeds for Uutiset, Urheilu and Talous (proposal, M3.25)

**Status: the owner answered the questions and approved the mock-ups on 24.10.2026 (decisions below); the feeds are built (M3.26–M3.30).** Mock-ups: `design/screens/08-uutisvirta` (the Uutiset feed), `09-artikkeli-virrasta` (an article opened from it) and `10-talous` (the Talous feed). Light + dark pictures are in `design/screens/png/`. The Urheilu feed has the same layout as Talous, with green labels and page 201's stories. Technical choices: D25–D29 in `DECISIONS.md`.

The owner asked for news that scrolls like a news site (Helsingin Sanomat) instead of page by page, as teletext does.

### What the feed shows

- One scrolling list per feed. Each item has three things: the **section label** with its colour dot and page number (`KOTIMAA · 105`), the **headline** (`title` style, 24/28 heavy) and the article's **first paragraph** (`body-sm`, `ink-muted`). Items are separated by hairlines, no cards, like the front page's lists.
- The first paragraph shows at most 3 lines and ends with "…" if it's longer. Only the screen clamps it: the text itself is never shortened or reworded (Yle's licence, same as the front page's lead card, D19).
- Some articles have no first paragraph to show (result tables). Those items show only the label and headline.
- **Brief pages show as a "sähkekortti"** (owner chose option B, 25.10.2026; D35). A brief page is a roundup of short news items, each starting with a topic in capitals and a colon (`PESÄPALLO: …`, `JÄÄKIEKKO: …`), like 202 Urheilusähkeet. It is one item in the same hairline layout: the label adds the number of briefs (`URHEILU · 202 · 4 SÄHKETTÄ`, one brief: `1 SÄHKE`), the headline is the page's own name (`Urheilusähkeet`, the all-caps title row with only the case changed), and under it up to 3 briefs, each its topic as Yle prints it (`label` style, ink colour) over its text clamped to one line, with hairlines between. With more than 3 briefs a last row in link colour says "Lue kaikki sähkeet ›". The whole card opens the page. While the page loads, the item looks like any other (index headline and grey bars); if it can't be loaded, only the index headline shows. The same card appears on Etusivu (its rows keep their own look: the count sits next to the page number) and in every feed, because brief pages are recognised by their shape, not their number.
- While a first paragraph is loading, grey skeleton bars stand in for it. The headline is there at once.
- Tapping an item opens the article, the same article screen as today.
- At the top: ☰ (all sections and Suosikit), the feed's name, and `_ _ _` where a Yle page has its number (a feed is made by Satanen, not a Yle page). There is no refresh button (D36), and no "Päivitetty" row under the chips (owner, 25.10.2026): the time is only at the end of the list. Pulling the list down refreshes it, on the web as well as in the apps.
- **The list ends** (owner OK, 24.10.2026). Teletext has only a handful of stories per section at a time (on 21.10.2026: Kotimaa 10, Ulkomaat 8, Talous 6, Urheilu 9), so a feed isn't endless the way HS is. It ends with "Päivitetty 14:32", plus "· ei yhteyttä" when offline; refreshing is by pulling down (D36).

### Tabs and feeds (owner's decision, 24.10.2026)

The bottom bar is **Etusivu · Uutiset · Urheilu · Talous · Sää**:

- **Etusivu**: page 100 as today (lead story and section groups). It stays a tab of its own: it is Yle's pick of the top stories, while the feeds hold everything.
- **Uutiset**: two feeds, **Kotimaa** and **Ulkomaat**, switched with chips at the top. Kotimaa is the default (owner decision 2026-10-24: the Kaikki chip was removed). *The architect's call for the owner to correct: Talous has its own tab now, so it isn't repeated in Uutiset.*
- **Urheilu**: page 200, the sports front (owner decision 2026-10-25): results and tables are what sports readers come for, not only the news. The **UUTISET** and **PALLOILU** buttons sit at the top of the page, above the list of leagues. UUTISET opens the feed of page 201's stories (`/urheilu-uutiset`, same layout as Talous); PALLOILU is page 220. The ☰ menu's Urheilu row opens the same page 200.
- **Talous**: a feed of page 160's stories, with the same rules. No chips.
- **Sää**: page 400 as today.
- **Suosikit** moves to the ☰ drawer as its first row (star icon, "Suosikit"), above the sections. The favourites screen itself doesn't change. No tab is highlighted while it's open.

Each chip, and each feed, keeps its own scroll position. The chips scroll sideways if large text makes them too wide. With "Suosikit" gone, the longest tab label is seven letters ("Etusivu", "Uutiset", "Urheilu").

### The ☰ button on every screen

The owner wants ☰ reachable everywhere, so it stays in the same place on every screen: **the top-left corner, as the first button of the header row**.

- Feeds, Etusivu, Sää, Suosikit and Asetukset: ☰ · screen title · (refresh, where there is one).
- Articles: **☰ · ‹ Takaisin**, then space, then the page number and ☆ on the right (mock-up 09). The page number moves from the middle to the right, next to the star, so the row fits at 390 px with large text. At 200 % text, "Takaisin" wraps under the arrow instead of being cut.
- The jump sheet and the drawer itself are sheets over the current screen. They have their own ✕, and ☰ is behind them.

Considered: a slim extra top row with only ☰ on every screen (it costs about 44 px of reading space on every screen, and two rows of controls look busy), and ☰ on the right on articles (then it moves around between screens).

### Where the list comes from

Each feed is built from Yle's section index pages, which list the day's stories with their headlines: **102 Kotimaa, 130 Ulkomaat, 160 Talous, 201 Urheilu**. Opening a feed costs one request per index page (one per feed). The headlines come straight from those pages, so the list appears before any article has loaded. Only the day's news list is used, and the promos at the top of 201 are left out (details in D25). Talous ends with 160's service links after its stories: Korot ja valuuttakurssit (172), Maailman pörssien kursseja (174), Pörssisivut (175) and Pörssisähkön hinta (188), in Yle's wording, each opening the first page of its range. They show as rows without a first paragraph (they are tables, so the feed doesn't load them), and the article's next/previous card walks through them too. On a day without stories (Sundays) they are the whole feed, under the line "Talousuutisia ei ole juuri nyt" (D40).

### How the first paragraphs load

- Every first paragraph needs one request for its article. The app asks only for the items on screen plus the next 6, and at most 4 requests at a time. More are fetched as the reader scrolls, so a reader who looks at the top five stories never loads the other twenty.
- These requests use the same page cache as the rest of the app (D14). An article whose first paragraph is already showing opens straight away, without a second request.
- **Load on Yle and the proxy.** Reading the whole Uutiset feed is about 20 requests to our proxy (Talous about 7, Urheilu about 10). The proxy keeps each page for 45 s (D11), so Yle sees at most about one request per page per minute from each Cloudflare data centre, however many people are reading. Cloudflare's free plan allows 100,000 proxy requests a day, about 3,000 full feed reads, which is plenty for the public launch. If the Cloudflare dashboard ever shows more than half of that being used, D26 lists the next step.
- **Offline.** Index pages and the articles the feed loaded are kept on the device like any page you read, and the limit grows from 30 to 80 pages (under 1 MB). Offline, the feed shows the saved copy with "Päivitetty 14:32 · ei yhteyttä". Items whose article was never loaded show only their headline, and opening one shows the usual offline message.

### No automatic updates

- Once the feed is shown, it doesn't change by itself. New stories arriving at Yle never move the list under the reader's thumb. It changes only when the reader presses refresh or pulls the list down.
- Coming back from an article, switching to another tab and back, or switching chips gives the same stories at the same scroll position.
- Starting the app again (or reloading the web page) builds a fresh feed and starts from the top.
- While the feed is being built, it waits for the network (skeleton) and uses the saved copy only if there's no connection, so it doesn't first show an old list and then swap it.

### "Takaisin"

- The article's back button shows the word: **‹ Takaisin**, on every article screen (owner OK) (today it's an arrow only, with "Takaisin" read out by screen readers).
- Takaisin from an article opened from the feed returns to the feed exactly where the reader left it, with the same content and no reload. The phone's back button and the browser's back button do the same.

### "Next story" shows the next headline

- At the end of an article opened from a feed, the footer has a small **‹** button for the previous story and a card for the **next story**: its section label and page number, then its headline in at most 2 lines ("…" if longer). The words "Seuraava juttu" are replaced by the headline. Screen readers hear "Seuraava juttu: HS-gallup: PS kirii kokoomusta".
- Yle's index headlines are at most about 35 characters, so they nearly always fit whole.
- **Assumption: "next" means the next story in the feed the reader came from**, not Yle's "next page". Yle's next page is just the next page number. At the end of a section that is the next section's index page (Yle gives 130 Ulkomaat's previous page as 113), and it can be a page that's missing right now (104 answered "not found" while 102 still listed it). The feed order is what the reader has just seen, so "next" goes where they expect.
- Moving to the next story replaces the article instead of piling up history, so after reading five stories in a row, one Takaisin still goes straight back to the feed, where it was when the first story was opened (owner confirmed).
- The last story in a feed has no next card.
- Articles opened from Etusivu get the same footer, in Etusivu's order (lead story, then the section groups). Articles opened any other way (a link in another article, a favourite, the jump sheet, a shared link) keep today's footer: "‹ 104" and "Seuraava sivu 106 ›" from Yle's page numbers.

### Owner's answers (24.10.2026)

1. Tabs: neither A nor B. The bar is Etusivu · Uutiset · Urheilu · Talous · Sää, Suosikit goes to the ☰ drawer, and ☰ is always visible.
2. The feed may end: OK, with the end note and the refresh button.
3. After several "next" presses, Takaisin returns to the feed where it was left: confirmed.
4. "Takaisin" visible on every article: OK.
5. Etusivu stays its own tab: OK.

Still open for the owner: Uutiset = Kotimaa + Ulkomaat without Talous (proposal above), and a final look at the updated mock-ups.
