# Privacy policy

> **Draft.** Not yet published. Date: [DD.MM.YYYY – to be filled in before release]. Contact: [owner's email – to be filled in before release].

Satanen is a reader app for Yle Teksti-TV (Finnish teletext). This policy explains what the app does and does not do with data.

## In short

- No user accounts.
- No cookies, ads or purchases. Page reads and the number of readers are counted with a daily identifier (see below).
- No tracking: the identifier changes every day, so a reader cannot be followed from one day to the next.
- No user database.
- Favourites, recent pages and settings stay on your device.

## What is saved on your device

The app saves your favourites, recent pages and settings, such as the theme, in the device's own storage. It also keeps the pages you have read most recently so they can open without a network connection. This data does not leave your device.

You can clear saved pages and the recent list in the app's settings. Everything is removed when you uninstall the app. If you use the web app, the data is removed when you clear your browser data.

## Fetching pages

When you open a page, the app fetches it through a proxy running on Cloudflare (api.satanen.io). The proxy forwards the request to Yle's public Teksti-TV API and keeps the page in its cache for a short time so that Yle does not receive unnecessary requests. How long depends on the kind of page: live sports results 1 minute, headline lists 2 minutes, news articles 5 minutes, and TV programmes, weather and other pages 30 minutes. A missing page (404) is remembered for 30 seconds and errors are never cached. When Yle's request limit starts to fill up, these times are doubled. The browser or app may also keep a page itself for up to a quarter of these times, at most 2 minutes. If Yle is unavailable, the proxy may show a copy of the page that is at most a day old. The cache holds only public teletext pages, not information about you.

Cloudflare processes ordinary technical request data needed to deliver and protect the service, such as the IP address, the time of the request and the page requested. We do not use this data to identify you. Cloudflare processes data under its own terms.

The app does not send any information about you to Yle. Yle sees requests coming from the proxy, not from your device.

## Counts and the daily identifier

We want to know which pages are read most and roughly how many readers there are each day. When you open a page, the app tells the proxy only the page number. The proxy records the page number, the country (provided by Cloudflare), whether it was the web app or the Android app, and a daily identifier.

The daily identifier is a short code that the proxy calculates, with a secret key, from the date, the IP address and the browser or device type. So it is pseudonymous, not fully anonymous: during one day the same reader gets the same identifier, which is how we count how many different readers there are. The identifier changes every day and cannot be linked across days. We use it only to count readers per day.

The IP address and the device type themselves are not written to the statistics, to a log or to any response. The proxy's request logs are switched off. The proxy also counts the requests it sends to Yle, so that Yle's request limit can be watched. Those records contain nothing about readers.

Counting uses no cookies and saves nothing on your phone or in your browser. There are no user accounts and there will not be any. The statistics are kept in Cloudflare's Analytics Engine for about three months.

## Ads and purchases

The app has no ads or in-app purchases. It does not ask for your name, email address or any other personal information.

## Content and attribution

Content: Yle Teksti-TV (Sisältö: Yle Teksti-TV). Satanen is an independent app and is not made or endorsed by Yle. The content is not reworded; it is only laid out again in a more readable form.

## Changes

If this policy changes, the new version will be published on this page with a new date.

## Contact

Privacy questions: [owner's email – to be filled in before release].
