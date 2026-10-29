# States

Loading and error states for any page.

- **Loading**: `skeleton` bars shaped like the content (label, two headline lines, text lines), `radius-sm`. No spinner. After 10 s show the error state.
- **Error**: 24px outline icon and `title` in `danger`, one `body-sm` sentence in `ink-muted`, one action in `link`. Messages: *Sivua ei löytynyt* (404, page doesn't exist right now), *Ei yhteyttä* (offline, no cached copy).
- **Offline with a cached copy**: show the copy normally; the meta line says *Päivitetty 14:32 · ei yhteyttä*.
