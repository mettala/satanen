# How we build Satanen

Satanen is built by AI agents, directed by one person. This page says how, what is meant to stop bad changes, what has gone wrong, and what the process does not promise. Most claims point at the file or decision behind them.

## 1. Who does what

- The owner is a product manager without a software background. The owner decides product, legal, money, accounts and store releases.
- Agents decide the technical side and may disagree with the owner. Technical decisions are written down in [docs/DECISIONS.md](DECISIONS.md). See "Who decides what" in [docs/AGENT-PLAN.md](AGENT-PLAN.md).
- The owner does not read code or review PRs. So the process has to make a bad merge hard without a human reading the diff. The next sections are about that.

## 2. The loop

1. A task is a row in [docs/BACKLOG.md](BACKLOG.md), with a "done when" check.
2. The orchestrator agent writes a short brief for it.
3. A builder agent does the work in its own git worktree and opens a PR.
4. CI runs the type check, lint and tests.
5. An independent reviewer agent checks the PR against the brief and the rules.
6. For UI changes, a QA agent runs the app and checks screens in light and dark.
7. The orchestrator merges, deploys from `main`, and runs the smoke tests.

Small chore PRs (generated files, text strings) may be checked by the orchestrator itself instead of a reviewer, except security-relevant ones, which always get a reviewer verdict (D42). Roles and models are in [docs/AGENT-PLAN.md](AGENT-PLAN.md); the agent definitions are in [.claude/agents/](../.claude/agents/); the orchestrator's rules are in [docs/agents/ORCHESTRATOR.md](agents/ORCHESTRATOR.md).

"Independent" means a separate agent with its own prompt, no Edit or Write tools, and a fresh context (it sees the PR and the brief, not the builder's reasoning). It does not mean a different model family: the reviewer and the parser builder are both Opus, the normal builder is Sonnet, so blind spots can be shared.

## 3. Guardrails and where they live

| Guardrail | What it does | Where it lives |
|---|---|---|
| Merge rule | An approval names the exact head commit (`VERDICT: APPROVE @<sha>`). The merge is pinned to that commit, so GitHub refuses it if the PR changed. At most 2 fix rounds, then escalation. Changes to the rules are never overridden. | D42 in [docs/DECISIONS.md](DECISIONS.md); [docs/agents/ORCHESTRATOR.md](agents/ORCHESTRATOR.md) |
| Untrusted input | Text from PRs, issues, fixtures, Yle pages and the web is data, never instructions. Agents do not run code from forks. CI never uses `pull_request_target`. | [AGENTS.md](../AGENTS.md) |
| Least privilege | Each agent has an explicit tool list; the reviewer and QA have no Edit or Write. The Read and Edit tools are denied for a fixed list of secret file names (`.env`, `.dev.vars` and some variants); other names are not covered, and Bash can still read such files (`cat .env` works). The Bash denies for `wrangler secret`, `login` and `logout` are best effort: they stop the obvious command, not a determined agent. | [.claude/agents/](../.claude/agents/), [.claude/settings.json](../.claude/settings.json), D43 (see its "Limits") |
| Deploy guard | A release stops unless the tree is clean, the branch is `main`, it equals `origin/main`, and CI passed for that exact commit. | [scripts/assert-release.mjs](../scripts/assert-release.mjs), [scripts/release-lib.mjs](../scripts/release-lib.mjs), [docs/maintainer/DEPLOY.md](maintainer/DEPLOY.md) |
| Proxy protections | Allowlisted paths, an hourly cap on requests to Yle, an `Origin` check, and a pause after Yle fails. | [proxy/README.md](../proxy/README.md) |
| Machine-checked rules | Tests fail on hard-coded colours and UI text, on tappable elements without a label, and when the parser's quality on the saved pages drops. | [scripts/project-rules.test.ts](../scripts/project-rules.test.ts), [scripts/parser-baseline.test.ts](../scripts/parser-baseline.test.ts), D47 |
| Secrets design | The app never contains the Yle key. In production the Worker holds it. For development and fixture fetching it also sits in git-ignored local files (`.env.fixtures`, `proxy/.dev.vars`) on the maintainer's machine; agents are denied from reading those files, on a best-effort basis (above). Proxy tests fail if the key appears in an answer or in logs ([proxy/src/index.test.ts](../proxy/src/index.test.ts), "the Yle key never leaks"). A separate test there, "keeps the key out of cached entries", only checks the cache keys, not the stored answers. | [AGENTS.md](../AGENTS.md) rule 1, D43, [proxy/src/index.test.ts](../proxy/src/index.test.ts) |
| Repository ruleset, secret scanning | Not in place yet. They are planned for the day the repo goes public (task PUB.3). | [docs/BACKLOG.md](BACKLOG.md) |

## 4. What went wrong and what changed

- **DeepSeek trials.** The DeepSeek builder needed second review rounds on all three of its PRs, and the DeepSeek reviewer called a real bug (Esc key not closing the jump sheet) "a preview artifact". Both trials were stopped. D7 to D9, D21.
- **Localhost in production.** A production build once had a local address baked in (PR #73). The deploy script now pins the proxy address and [scripts/check-dist.mjs](../scripts/check-dist.mjs) fails the build if a local address is in it; the smoke test checks the live scripts too.
- **A merge gap.** A pre-release review on 2026-10-25 found that 12 PRs had merged after "changes requested" without a re-review, and 7 code PRs had no review. The result is D42.
- **Review of the hardening work caught real bugs before merge** (2026-10-25):
  - #93: the new cap on Yle requests could be skipped by sending requests in parallel.
  - #97: Bash deny patterns matched any text in a command line, so everyday commands that only mentioned the words (a PR comment, a commit message) would have been blocked, while giving almost no protection. They were replaced by start-anchored patterns.
  - #103: the fix for the deny globs weakened the OpenCode deny rules (`.env.decoy` and `.env.bak` would have become readable); fixed before merge. The globs themselves had been wrong since #97: a live test in a fresh session, after #97 merged, showed some secret files readable and the example files blocked (D43 amendment). #103 is the fix for that.
  - #104: the deploy guard could be skipped by calling the deploy script directly.
  - #107: the weekly section-map bot PR would have failed its own tests.
  - #113: the UI-text check missed text inside template strings.
- **Also found by the pre-release review.** Page titles copied from Yle into generated source were only partly escaped, so a crafted title could become code. Fixed in #94.
- **A mistyped commit id.** A reviewer's verdict once had a one-character-wrong id. It was caught only because the merge is pinned to the head commit. Since then the id must be copied by command, not retyped (D42, items 8 to 10).

## 5. Models, cost and data

- Each role uses the cheapest model that does it well; the table is in [docs/AGENT-PLAN.md](AGENT-PLAN.md). In short: Opus for the orchestrator, architect, reviewer and parser work, Sonnet for most building and QA, Haiku for mechanical chores, and one expensive escalation agent used rarely.
- Cost controls: small briefs, one task per PR, state kept in files instead of chat, machines checking the boring things, and a cap of 2 review rounds ("Saving tokens" in AGENT-PLAN).
- Data: all agent work sends source code to Anthropic. During the DeepSeek trials (D7 to D9) source code was also sent to DeepSeek's API. Secrets were not meant to be sent: that was an instruction at the time, and the technical denies came later (D43). The trials are over and no role runs on DeepSeek now, but D21 and AGENT-PLAN still allow occasional DeepSeek one-off reviews of small pure-logic PRs (D21). These are advice only and never a verdict that allows a merge.

## 6. Limits

- LLM reviewers can miss things, and nobody reads every line.
- The privacy wording and the licence notice have not been checked by a lawyer.
- Yle confirmed that the app's use of the API is in line with its terms, but did not say whether saved Yle pages may sit in a public repo. The owner decided to keep them anyway (D50); if Yle objects they are removed and the repo is replaced.
- The Android build and the store forms are not done yet.
- Tests are strongest for the parser (fixture-based tests and a quality baseline in [scripts/parser-baseline.test.ts](../scripts/parser-baseline.test.ts)); not every screen has tests.
- The deny rules for agents are best effort.
