# Contributing to Satanen

Satanen is an independent reader app for Yle Teksti-TV. It is not made by or affiliated with Yle. Thank you for taking the time to look at it.

## Language

- The app's UI is **Finnish only**. All UI strings live in `src/i18n/fi.ts`.
- Code, comments, docs, commit messages and PRs are in **English**.

## Running the checks

```
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm --prefix proxy ci
npm --prefix proxy run typecheck
npm --prefix proxy test
npm run build:web
```

These are the same steps CI runs, and all of them should pass before you open a PR. (`npm run build:web` is the slowest; run it at least if you touched app config or dependencies.)

## Pull requests

- One task per PR. Keep it small and focused.
- Describe the change in plain language: what is different for the reader, and how you tested it. The PR template will guide you.
- Follow the rules in [AGENTS.md](AGENTS.md) (rules 1-8 and 10): secrets, the Yle licence, design tokens, UI strings, accessibility, themes and dependencies.
- If you add a larger dependency, explain why in `docs/DECISIONS.md`.

## AI-assisted contributions

They are welcome. If you used an AI tool, you must have run the checks yourself, understand the change well enough to explain and defend it, and say in the PR which tool you used. You are responsible for what you submit.

## How this project is built

Satanen is itself built largely by AI agents, directed by the maintainer. See [docs/AGENT-PLAN.md](docs/AGENT-PLAN.md); how it works, what protects the code and what has gone wrong is in [docs/HOW-WE-BUILD.md](docs/HOW-WE-BUILD.md).

The maintainers' own agents do **not** act on outside PRs or issues. Outside contributions are reviewed by the maintainer by hand, so replies may take a while.

## Never include

- Secrets, API keys, tokens or personal data, in code, logs, fixtures or screenshots.
- Yle content (saved fixtures, screenshots of teletext pages) without asking first. It belongs to Yle.

## Licence

Contributions are accepted under the [MIT licence](LICENSE). Yle content is not covered by it; see [NOTICE.md](NOTICE.md).

## Security

Please do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
