# Google Play launch: what the owner needs to do

This is a draft checklist, not a set of instructions that has been carried out. Nothing has been submitted to Google Play or published. Items marked **verify** need to be checked in Play Console or with the current Google rules before they are relied on.

The agents can prepare the build, texts and forms, but anything that happens inside the Google Play account needs the owner.

## 1. Accounts and fees

- [ ] **Google Play developer account.** A personal developer account is needed for the app. There is a one-time fee of about $25 (see `docs/PLAN.md`). **Verify** the current fee and whether a personal or organisation account is the right choice.
- [ ] **Identity verification.** Google may ask for identity documents for a new developer account. **Verify** what is required and how long it takes, because it can delay the launch.
- [ ] **Expo account (free).** The Android build is made with EAS, which runs under an Expo account. The owner needs the account and to log in once when the agents ask. Keep the login safe: it controls future app updates.
- [ ] **Owner email.** Needed as the Play Console contact and in the privacy policy. It is a placeholder `[owner's email]` in the drafts.
- [x] Cloudflare account and the satanen.io domain: already done in phase 0 of `docs/PLAN.md`. No action needed.

## 2. Android signing key

- EAS creates and keeps the Android signing key for the app. The owner does not need to create or store one.
- **Verify** in the EAS/Play setup that the app uses the EAS-managed keystore, and do not delete the Expo account: losing access to the key can make future updates impossible.

## 3. Closed test (the longest wait)

- [ ] **Recruit at least 12 testers now.** Each needs an Android phone and a Google account (usually a Gmail address). Friends, family and colleagues are fine. The owner collects the names and email addresses.
- [ ] Each tester must accept the closed-test invitation, install the app and keep it installed for 14 days.
- **Verify** the current rule in Play Console: for new personal developer accounts, Google requires a closed test with at least 12 testers who have opted in for 14 continuous days. The console shows when the requirement is met.
- [ ] The tester list is ready before the first closed-test build is uploaded, so the 14-day clock can start immediately.

## 4. Forms in Play Console

- [ ] **Privacy policy at a public URL.** The drafts are `docs/store/privacy-policy.fi.md` and `docs/store/privacy-policy.en.md`. A later task will host the Finnish version (and the English one) on satanen.io; the owner only needs to check the final text and address before it is used in Play Console.
- [ ] **Data safety form.** Draft answers from the facts in the privacy policy:
  - No accounts, no cookies, no ads and no in-app purchases.
  - Page counts (D32, D45): the proxy records page number, country, web/app and a daily visitor identifier (a shortened keyed hash of date, IP and browser type; it changes every day and cannot be linked across days; IP and browser type are never stored; request logs are off). This is a pseudonymous identifier, not "anonymous", so describe it that way. Under the GDPR pseudonymous data can still be personal data: **declare it on the Data safety form** (an identifier collected for analytics, not shared, not used for ads) and do not answer "no data collected". Nothing is stored on the device and there is no advertising or user ID. **Verify** how Play's Data safety definitions ("collected", "shared", "ephemeral processing", "data is anonymised") apply, and answer exactly as the form asks; do not just tick "no data collected".
  - **Have the final privacy wording checked by someone qualified before submitting** (D32: this is not legal advice).
  - Favourites, recent pages and settings are stored only on the device.
  - There is no developer backend database.
  - Page requests go through a Cloudflare Worker proxy at api.satanen.io, which forwards them to Yle's public Teksti-TV API and caches pages for 1 minute (live sports), 2 minutes (headline lists), 5 minutes (news), 30 minutes (everything else) or 30 seconds (missing pages); the times double when Yle's hourly count runs high, and the browser or app may keep a page up to a quarter of that time, at most 2 minutes (D39, `proxy/src/ttl.ts`).
  - Cloudflare processes ordinary request data such as IP address. Say so honestly in the form.
  - **Verify** how Play's definition of "collect" applies to the Cloudflare proxy, and answer exactly as the form asks.
- [ ] **Content rating questionnaire (IARC).** Draft hints are in `docs/store/play-listing.fi.md`: no ads, no user content, no purchases, news content. **Verify** the resulting rating.
- [ ] **Ads declaration:** the app has no ads.
- [ ] **App access:** all functionality is available without a login, so no test account is needed.
- [ ] **News app declaration** if Play Console asks whether this is a news app. **Verify** the answer and any extra requirements.
- [ ] **Target audience and content:** general audience. **Verify** the exact selection.

## 5. Store listing material

- [ ] **Finnish listing text.** Draft in `docs/store/play-listing.fi.md`: name, short description, long description, category. The owner reviews and approves the wording.
- [ ] **Screenshots** of the phone app. Not made yet; a later task will prepare them.
- [ ] **App icon 512×512** and **feature graphic 1024×500.** Not made yet; **verify** the current sizes in Play Console.
- [ ] **App name "Satanen".** A trademark search (PRH) is planned before release (see `docs/PLAN.md` risks).
- [ ] **Package name** (the app's permanent identifier on Play). The agents decide it before the first upload. **Verify** that it cannot be changed after the first release.

## 6. Before the production release

- [ ] **Yle contacted.** The owner sent the email to api.apua@yle.fi on 2026-10-23 (see `docs/BACKLOG.md`); **verify** that a reply has arrived. `docs/PLAN.md` says the licence fit should be confirmed with Yle before the public release.
- [ ] **Trademark search** done (PRH), per `docs/PLAN.md`.
- [ ] **Owner's written OK** for the store release. Store releases need it (decision D6).
- [ ] **Closed test passed** and Play Console allows a production release.

## 7. Do not do yet

- Do not submit the app for review or publish it before the owner's written OK.
- Do not put the Yle API keys anywhere in Expo, EAS or Play Console settings. They belong only in `.env.fixtures` locally and as Cloudflare Worker secrets.
