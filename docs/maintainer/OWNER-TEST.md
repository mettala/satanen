# Testing Satanen yourself

This is a plain-language guide for testing Satanen at **https://satanen.io**, on your Mac and
on your phone. You do not need to know how to code. You do not need Terminal, Yle keys or a
`.env` or `.env.fixtures` file: you only need a browser.

**Why not run it on your own Mac?** The live proxy (`https://api.satanen.io`) answers only
requests that come from `https://satanen.io`. A copy of the app running on `localhost` is
refused with an error 403, on purpose, so that other websites cannot use Satanen's connection to
Yle. That is not a bug. If you ever need to run the app locally, see "Developers only" at the
end of this guide; it is meant for the agents, not for you.

## Before you start

You need:

- the Mac you normally use, with Chrome (Safari and Firefox work too);
- an Android phone with Chrome, for the phone checks;
- an internet connection.

If anything below looks very different from what is described, stop and send a note to the
agent (see "How to report a problem" at the end). Do not try to fix it yourself.

## Part 1: Open the app on the Mac

Open Chrome and go to **https://satanen.io**.

You should see the Satanen front page (the tab is called **Etusivu**): the ☰ button and logo at
the top, the time such as **klo 14:32**, a box saying **Siirry sivulle…**, a main story,
section headings such as **Kotimaa** and **Ulkomaat** with a short preview under each headline,
and five tabs at the bottom: **Etusivu**, **Uutiset**, **Urheilu**, **Talous** and **Sää**.

If you see a blank page or an error instead, reload once. If it is still wrong, report it (see
the last section) and say that it was the live site.

## Part 2: Open the app on the phone

Open Chrome on the Android phone and go to **https://satanen.io**. The same front page should
appear, laid out for a narrow screen. The install and offline checks for the phone are at the
end of the checklist.

You can also drag the Mac's browser window narrow to see roughly what the phone layout looks
like.

## What to check

Work through this list with the app open on https://satanen.io. Tick a box when the item behaves
as described. If an item fails, note down which page you were on and what happened (see the last
section).

### Bottom tabs

The bottom bar has five tabs: **Etusivu · Uutiset · Urheilu · Talous · Sää**. The tab you are
on is highlighted in its colour.

- [ ] All five tabs are there, with the labels above, and each one can be tapped.
- [ ] **Uutiset**, **Urheilu** and **Talous** open a scrolling news list (see "News feeds"
      below). **Sää** opens the weather page.
- [ ] **Suosikit** is not in the bottom bar any more. Favourites are in the ☰ menu (see
      "Drawer menu").

### Front page (Etusivu)

- [ ] The front page shows the current front-page news: a main story at the top, then
      headlines grouped under section headings (Kotimaa, Ulkomaat, Talous, Urheilu and so on).
- [ ] Under each headline there is a short preview: the first sentence or two of the story,
      up to three lines. While it loads you see grey bars instead.
- [ ] The top shows the ☰ menu button and the time as **klo 14:32** (your current time, Finnish
      style with a dot).
- [ ] Pulling down (or reloading the page) updates the front page.

### News feeds (Uutiset, Urheilu, Talous)

A feed is one long list you scroll, like a news site. It does not change while you read it.

- [ ] **Uutiset** shows two chips at the top: **Kotimaa** and **Ulkomaat**.
      **Kotimaa** is selected at first. Tapping **Ulkomaat** shows the foreign stories.
- [ ] **Urheilu** and **Talous** have no chips. Each shows only its own stories.
- [ ] Each story shows a coloured label with its page number (for example **KOTIMAA · 105**),
      the headline, and a short first paragraph of up to three lines.
- [ ] Some stories have only a headline, for example result tables. That is expected.
- [ ] Tap a story. The article opens.
- [ ] Scroll down in a feed, tap a story near the bottom, then press **‹ Takaisin**. You are
      back at the same place in the list, with the same stories, and the list has not reloaded.
- [ ] Scroll down in a feed, switch to another chip, then back. The list is still in the same
      place.
- [ ] Press the refresh button at the top of the feed, or pull the list down. The list updates.
      It changes only when you do this, never by itself while you are reading.
- [ ] The feed does not scroll on forever. It ends after its stories, with a line saying
      **Päivitetty 14:32** (your time).
- [ ] With Wi-Fi off, the feed shows the saved copy with **Päivitetty 14:32 · ei yhteyttä**.

### Next story in an article (footer)

This checks the card at the bottom of an article opened from a feed or from Etusivu.

- [ ] Open a story from **Uutiset**. At the bottom of the article there is a small **‹** button
      and a card with the **next story**: its section label, its page number and its headline
      (at most two lines).
- [ ] Tap the card. The next story opens in place of the first one.
- [ ] On that story, tap **‹**. The previous story opens again.
- [ ] Tap the next card three or four times, then press **‹ Takaisin** once. You go straight
      back to the feed, where you started.
- [ ] The last story in a feed has no next card.
- [ ] An article opened from **Etusivu** shows the same kind of card, with the next story in
      Etusivu's order (main story first, then the sections).
- [ ] An article opened another way (a link inside another article, a favourite, or the jump
      sheet) shows the older footer instead: **‹ 104** and **Seuraava sivu 106 ›**, with
      page numbers, not headlines.

### Opening articles

- [ ] Tap the main story on Etusivu. The article shows a section label, a date and time, a
      title, and readable paragraphs.
- [ ] The top row shows **☰**, then **‹ Takaisin**, then the page number, then the **star**.
- [ ] **‹ Takaisin** returns to where you came from.
- [ ] Page links inside an article (blue text) open the right page.
- [ ] Open page **101** (it lists Yle's contact details). Its links come in number order, and
      the **Yhteystiedot** block is at the end of the page.
- [ ] Open page **202** (sports bulletins). The sentence about NHL and AHL games is one
      paragraph, not split across lines.
- [ ] Open a page that does not exist right now, for example **109**. You see **Sivua ei
      löytynyt** and **Sivulla 109 ei juuri nyt ole sisältöä**. You should not see any note
      saying the reading view is "not certain".

### Jump sheet (Siirry)

Open it by tapping **Siirry sivulle…** on the front page, or by tapping the page number at the
top of an article.

- [ ] The sheet slides up from the bottom. Its title is **Siirry sivulle**, and the number
      field is ready to type in.
- [ ] With the field empty you see a row **Viimeksi luetut** (recent pages), then the list
      **Osastot** (the sections, with their page numbers), then **Suosikit** if you have any.
- [ ] Tap **Viimeksi luetut**. The list of recently read pages opens.
- [ ] Open the sheet again and type `105`. The sheet closes and page 105 opens.
- [ ] Open the sheet again and type `2`. You see suggestions such as **Urheilu · 2XX**.
- [ ] Type `999`. You see the short hint **Anna sivunumero väliltä 100–899.** and the app does
      not jump.
- [ ] Tapping the page number at the top of an article opens the sheet. Tapping the
      **Siirry sivulle…** box on Etusivu also opens it.
- [ ] The ✕ closes the sheet. On the keyboard, the **Esc** key also closes it.

### Drawer menu (☰)

☰ is the first button on every screen: the feeds, Etusivu, Sää, articles and Asetukset.

- [ ] Tapping ☰ slides a menu in from the left and dims the page behind it.
- [ ] The first row is **Suosikit** (with a star), then **Viimeksi luetut**.
- [ ] Under them are the sections, each with a coloured dot and its page number, in page-number
      order: **Etusivu 100**, **Kotimaa 102**, **Ulkomaat 130**, **Talous 160**, **Urheilu
      201**, **Sää 400** and so on, down to the Swedish page. **Asetukset** is at the bottom.
- [ ] The text "Sisältö: Yle Teksti-TV" is not in the drawer (it is only in Asetukset).
- [ ] Tapping a section opens its page; the drawer closes.
- [ ] Tapping **Suosikit** or **Viimeksi luetut** opens that list; the drawer closes.
- [ ] Tapping the dimmed area outside the drawer, the ✕, or pressing **Esc** closes it.

### Favourites (Suosikit)

- [ ] Open a few different pages (for example 105, 201 and 400) and tap the **star** at the top
      right on each one. The star changes to show the page is saved.
- [ ] Open **☰ → Suosikit**. Each favourite appears as a card with its page number and a
      live preview of the content.
- [ ] Tap **Muokkaa**. Use the up and down buttons to reorder the cards, and the remove button
      to delete one. Tap **Valmis** to finish.
- [ ] Reload the page or restart the app. Your favourites are still there, in the same order.
- [ ] With no favourites left, the screen says **Ei suosikkeja** and explains how to add one
      with the star.

### Settings (Asetukset)

Open **☰ → Asetukset**.

- [ ] Under **Teema** there are three choices: **Järjestelmän mukaan**, **Vaalea** and
      **Tumma**. Picking **Vaalea** or **Tumma** changes the colours at once.
- [ ] **Järjestelmän mukaan** follows the Mac's appearance: change it in System Settings →
      Appearance and the app follows.
- [ ] Reload the page. Your theme choice is remembered.
- [ ] After reading a few pages, tap **Poista tallennetut sivut**. You are asked to confirm;
      choose **Poista**. The saved offline copies and the **Viimeksi luetut** list are cleared.
      Your favourites stay.
- [ ] Under **Tietoja** you see **Sisältö: Yle Teksti-TV** in bold and the sentence saying
      Satanen is an independent app, not made by Yle. This is the only place the attribution
      appears.

### Light and dark

- [ ] With **Vaalea**, check the front page, a news feed, an article, the jump sheet, the
      drawer, Suosikit and Asetukset. All text is clearly readable.
- [ ] Repeat with **Tumma**. Nothing turns invisible, and the background is dark rather than
      white.
- [ ] Nothing flickers or flashes between light and dark when you move between screens.

### Text size at 200 %

Do this in Chrome on the Mac.

- [ ] Open Chrome → **Settings** → **Appearance** → **Customize fonts**. Set the **Font size**
      slider to **32** (the normal size is 16, so 32 is 200 %).
- [ ] Reload the app. Text should be about twice as large: headlines, article text, buttons,
      tab labels and the drawer.
- [ ] Check the front page, a news feed, an article, Suosikit, Asetukset and the drawer: no
      text is cut off, nothing overlaps, and every button is still easy to tap. The tab labels
      may wrap, but must not be cut off.
- [ ] Put the font size back to **16** when you are finished.

If your browser offers a text-size percentage instead of a slider, set it to 200 %.

### Offline flow

Do this on https://satanen.io in Chrome. Visit the site once with a connection first, so the
app's files are saved for offline use.

- [ ] Open three different pages, for example `105`, `201` and `400`, and let each one finish
      loading. Open the **Uutiset** feed too and let it load.
- [ ] Turn the Mac's Wi-Fi off (menu bar → Wi-Fi → Turn Wi-Fi Off). If you use a cable, unplug
      it too.
- [ ] Reload the app with **Cmd-R**. The app itself should still open.
- [ ] Open the same three pages again. Each shows its saved copy, with a line such as
      **Päivitetty 14:32 · ei yhteyttä**.
- [ ] Open the **Uutiset** feed. It shows the saved list with **Päivitetty 14:32 · ei yhteyttä**.
      Stories whose article you never opened show only the headline. Opening one shows the
      offline message.
- [ ] Open a page you did not read before, for example `230`. It shows **Ei yhteyttä** and
      **Tarkista verkkoyhteys ja yritä uudelleen.**, instead of pretending to have content.
- [ ] Turn Wi-Fi back on and reload. Pages load normally again.

### Installing on an Android phone

Installing to the home screen needs a secure (`https://`) address, which https://satanen.io is.

- [ ] On the Android phone, open `https://satanen.io` in Chrome.
- [ ] Chrome menu (⋮) → **Install app** (or **Add to Home screen**). The Satanen icon appears
      on the home screen.
- [ ] Open it from the icon: it opens full screen without browser buttons.
- [ ] Read a couple of pages, turn the phone's Wi-Fi and mobile data off, and reopen them. They
      show **ei yhteyttä** with the saved copy.

## What "broken" looks like

These are the kinds of things worth reporting:

- a blank or white screen, or the app never gets past **Ladataan**;
- text that is cut off, overlaps something else, or is too pale to read;
- the wrong page or wrong story opening;
- a button or link that does nothing, or is too small to tap;
- an error message while the Wi-Fi is on;
- the theme not changing, or a theme that makes text invisible;
- favourites disappearing or coming back in a different order;
- a news feed that changes order or grows by itself while you are reading it (it should change
  only when you refresh);
- **‹ Takaisin** from a feed article that reloads the list or puts you at the top of it;
- offline pages that do not open from the saved copy.

Some things are **not** bugs: a teletext page that Yle is not currently broadcasting (the app
says **Sivua ei löytynyt**, which is correct), a story with only a headline and no preview
(for example a result table), and Chrome not offering **Install app** on some desktop setups.
A copy of the app on `localhost` that shows an error 403 is also not a bug (see the top of this
guide).

## How to report a problem

Send a short note to the agent in the chat where you asked for this test. Include:

1. **The page number** shown at the top of the screen (for example 105 or 400).
2. **What you did**, step by step ("opened Suosikit, tapped Muokkaa, tapped the up arrow").
3. **What happened**, and **what you expected** instead.
4. **A screenshot.** On the Mac press **Cmd-Shift-4** and drag over the problem area; on
   Android press **Power** and **Volume down** together.
5. **Where you were testing:** Mac or Android phone, the browser (Chrome, Safari, Firefox),
   the browser version (Chrome → ⋮ or **Chrome** menu → **About Chrome**), light or dark
   theme, and whether the text size was changed.
6. **Roughly when** it happened, so the right version can be checked.

One problem per note is easiest to act on. You do not need to know the cause.

## Developers only: running the app locally

Owner: you can skip this section. It is for agents and developers.

The production proxy refuses requests from any origin other than `https://satanen.io` with a
403. This is on purpose and is not a bug, so `npm run web` (`http://localhost:8081`) pointed at
`https://api.satanen.io` does not work. To run the app locally, use a local proxy:

1. Copy `proxy/.dev.vars.example` to `proxy/.dev.vars` and fill in the Yle keys. Never commit
   that file.
2. In one terminal start the proxy: `npm --prefix proxy run dev`. It serves on
   `http://localhost:8787` and allows `http://localhost:8081` as an origin for local use only.
   See `proxy/README.md`.
3. In a second terminal start the app against it:

   ```sh
   EXPO_PUBLIC_PROXY_URL=http://localhost:8787 npm run web
   ```

The same applies to QA checks on `localhost:8081`: they use the local proxy, never the live one.
