# JumpField

The "Siirry sivulle…" field and its type-ahead suggestions.

- Resting: `field` background, `radius-md`, search icon and placeholder in `ink-muted`, height `touch`.
- Tapping opens the jump sheet (section tiles + number field).
- Typing digits shows suggestions immediately, as rows: page number in `meta`, page name in `body-sm`, matched digits in `ink`, the rest `ink-muted`. `2` → meaningful 2xx pages; `23` → 23x. The third digit jumps straight to the page.
- Suggestions come from page names the API provides; favourites and recent pages rank first.
