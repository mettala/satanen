# PageLink

How teletext page references become links: inline in article text, and as the Aiheesta list at the end of an article.

- **Inline**: words + number in brackets, `link` colour, underlined (offset 3px). Tap target extends with padding to `touch` height.
- **Aiheesta list**: `label` heading in `ink-muted`, then rows with the page name in `body-sm` / `ink` and `160 ›` in `link`, hairline above each row.
- The Aiheesta list is built from teletext's bottom navigation rows; inline links from numbers inside the body text.
