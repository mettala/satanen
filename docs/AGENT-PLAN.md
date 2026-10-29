# Agentic development plan

How Satanen gets built: an **orchestrator** agent runs a small team of **sub-agents** in T3 Code on the owner's Mac. The owner works at product level only; agents make all technical decisions, review each other and merge to `main` themselves.

## How a work session goes

1. The owner opens a T3 Code thread in this project and says **"continue"** (or *jatka*).
2. The orchestrator reads `docs/BACKLOG.md`, picks the next task(s) and briefs a sub-agent.
3. A builder makes the change on a branch and opens a PR. CI (automatic tests) runs.
4. A reviewer agent checks it. The orchestrator merges to `main` only if CI is green and the latest verdict is `VERDICT: APPROVE @<full head sha>` with that sha equal to the PR's current head (D42); the merge goes through the GitHub API with the head sha pinned, so GitHub refuses it if the head moved. If not, the builder fixes it and the reviewer re-reviews the new commits only. After 2 fix rounds the problem is escalated, never merged on the orchestrator's say-so.
5. The orchestrator updates the backlog and moves on. It stops when a milestone is done, when it needs the owner, or after about 5 merged PRs, so one session never uses up the plan's limits.

The owner never needs to read code, diffs or PRs.

## Who decides what

| Owner decides (*what* and *why*) | Agents decide (*how*) |
|---|---|
| Scope and priorities, what's in the MVP | Code, architecture, libraries, tests |
| Look and wording beyond the design system | Hosting and build details, CI |
| Money, accounts, legal (Yle, store, trademark) | When something is good enough to merge |
| Store releases (Play Store / App Store) | Web releases to satanen.io |

Agents can disagree with the owner. On **technical** topics the agent decides and writes down why in `docs/DECISIONS.md`. On **product** topics the agent makes its case once, in plain language, then follows the owner's call.

## The team

Each role uses the cheapest model that does the job well. The owner's Claude Pro plan has usage limits that run out quickly, so Claude is the scarce resource. This table is the one place that says which role runs on which model; `agents/ORCHESTRATOR.md` links here instead of repeating it. The agent files in `.claude/agents/` hold the same model names in their frontmatter. DeepSeek trials are history (see below).

| Agent | Model | Used for |
|---|---|---|
| **Orchestrator** (the thread you talk to) | Opus 5.5, medium effort | Picks tasks, writes briefs, merges, reports to the owner. Writes little code itself. |
| **Architect** | Opus 5.5, high | Once per milestone: splits it into small tasks with clear "done when" checks; records big technical decisions. |
| **Builder** | Sonnet 5.5, medium (`.claude/agents/builder.md`) | Most work: screens, components, proxy, storage, config. |
| **Builder-heavy** | Opus 5.5, high (`.claude/agents/builder-heavy.md`) | The parser and other tricky logic (the riskiest part of the app). |
| **Chore** | Haiku 5.5, medium (`.claude/agents/chore.md`) | Mechanical work: generating theme tokens, renames, text strings, config. |
| **Reviewer** | Opus 5.5, medium (native agent since D21); delta re-reviews at low effort | Checks every non-chore PR, and any chore PR that touches security-relevant code or rules, against its brief and the project rules. Only the native `reviewer` agent or the `escalation` agent can give a verdict that allows a merge, and only from a run that the orchestrator itself started in the current session. The escalation agent's verdict counts only on a PR where it pushed no commits; if it pushed a fix, the native `reviewer` does a delta review of the new commits first and that verdict is the one that counts. A DeepSeek one-off review (D21) is advice only: it never writes a `VERDICT:` line. |
| **QA** | Sonnet 5.5, medium | Runs the app, screenshots screens in light and dark, compares with the mock-ups, checks touch sizes and contrast. UI tasks only. |
| *Escalation* | Fable 5.1, high | Only when a problem has beaten two rounds of normal work. Expensive, used rarely. |

The agent definitions are in `.claude/agents/`; the orchestrator's own rules are in `docs/agents/ORCHESTRATOR.md`.

**What "independent review" means here.** The reviewer is a separate agent with its own prompt, no Edit or Write tools, and its prompt forbids editing code (it keeps Bash for `gh` and running checks) and a fresh context: it sees only the PR and the brief, not the builder's reasoning. That is the separation we claim. We do **not** claim that the reviewer is a different model family from the builder: the reviewer and `builder-heavy` (the parser) are both Opus, and `builder` is Sonnet, so blind spots can be shared. CI, the machine checks (D47) and the strict merge rule (D42) carry the rest of the weight. D3 originally said "a different model from the builder"; it is amended to this wording.

**History: DeepSeek trials.** DeepSeek (via OpenCode in T3, billed per token) was tried for the builder (D7, ended in D8 after three PRs needed second rounds) and for reviews (D9, stopped in D21 after the reviewer called a real bug a "preview artifact"). `chore` was moved from DeepSeek Flash to Haiku (D3, D21). No role runs on DeepSeek now. If a DeepSeek one-off review is ever used (D21), it is advice only and never allows a merge; its tasks never involve the Yle key or other secrets, and only paid models are used, never the free ones. The old delegation targets are kept in `agents/ORCHESTRATOR.md`, under History.

## Saving tokens

- **State lives in files, not in chat**: backlog, decisions and briefs are in the repo, so a new session reads three short files instead of re-exploring everything.
- **Small briefs**: each sub-agent gets one task, the files it needs and its "done when" checks. Nothing else.
- **Machines check the boring things for free**: CI runs type checks, linting and tests on every PR, so reviewer agents look only at what CI can't judge.
- **Small PRs**: one task per PR keeps reviews short.
- **Review rounds are capped** at 2 fix rounds, then escalate (escalation agent once, or the owner) instead of looping or merging anyway (D42).
- **Chore PRs** (fixtures, generated files, text strings) skip the separate reviewer: CI plus an orchestrator check of the diff is enough, but anything touching security-relevant code (escaping, auth, CORS, secrets, workflows, dependency and lockfile changes, web security headers) is read in full and, like rule changes, always gets a reviewer verdict (D42).
- **Parallel work only when it pays off**: at most 2 builders at once, and only on tasks that touch different files.

## Milestones and demos

At the end of each milestone the owner gets a short plain-language summary and something to try (screenshots first, then a live link). The architect breaks each milestone into tasks when it starts, so the plan doesn't go stale.

| # | Milestone | Demo | Needs from owner |
|---|---|---|---|
| M0 | **Foundations**: app skeleton, theme from the design tokens, Finnish text file, automatic tests (CI) | Empty app shell in light and dark | Nothing |
| M1 | **Parser spike**: ~50 real pages saved, parser turns them into reader blocks, preview screen for flipping through pages | Gallery of real pages in reader mode, plus a list of the pages that still look bad | Send the Yle email (agent drafted it; sent 2026-10-23) |
| M2 | **Proxy**: Cloudflare Worker that holds the key and caches pages | App showing live pages | Cloudflare account, add satanen.io |
| M3 | **Web MVP**: all screens, favourites, recent pages, offline, installable to the home screen | Live at satanen.io | Nothing (design items answered) |
| M4 | **Android**: cloud builds, internal test, closed test (≥ 12 testers, 14 days), store listing | Test link for the phone, then Play Store | Expo + Google Play accounts, testers, **OK to publish** |
| M5 | **After launch**: iOS, classic view, widget, alerts | – | Priorities, Apple account |

Status: M0 to M3 are done and the web app is live; M4 is next (live task list: `docs/BACKLOG.md`).

Start recruiting the ~12 Android testers during M1–M2. Google's 14-day closed test is the longest wait in the whole plan.

## What only the owner can do

Agents add these to the **Waiting on owner** list in `docs/BACKLOG.md` when they come up (not before), with step-by-step instructions:

- Create accounts and pay (Cloudflare, Expo, Google Play, later Apple)
- Send the Yle email and handle any reply
- Give secrets through T3 Code's private secret prompt, never in chat
- Recruit testers
- Approve store releases
- Trademark search (PRH) before the public release

## Safety rails

- A merge needs green CI and a `VERDICT: APPROVE @<full head sha>` that matches the PR's current head. Verdicts and `OVERRIDE:` comments count only when posted from the owner's account `mettala` by an agent of the current session. The only exception is an `OVERRIDE: <reason>` comment on the PR plus a note in the backlog row: only for docs or chore PRs, or an urgent fix (production is down, the fix is a revert of the last merged change, and waiting for a review would make it worse; log it), and never for parser, proxy, security-relevant code (escaping, auth, CORS, secrets, workflows, dependency and lockfile changes, web security headers), CI or workflow changes, nor for rule changes (`AGENTS.md`, `.claude/`, `docs/agents/`, `.github/`, decisions about process). An urgent fix qualifies only if the revert touches none of those areas; a revert in any of them gets a normal reviewer verdict first, like any other change (D42). Direct pushes to `main` are limited to `docs/BACKLOG.md` status edits until the repo ruleset exists, then none.
- A verdict's commit id is copied from `gh pr view <n> --json headRefOid --jq .headRefOid`, never retyped or taken from another agent's text. The merge step compares mechanically and merges through the API with the head sha pinned (D42).
- CI is never switched to `pull_request_target` or to `workflow_run` with secrets.
- The rules in `AGENTS.md` apply to every agent: no secrets in code, Yle attribution, design tokens only, Finnish UI strings through `src/i18n/fi.ts`, accessibility.
- A web release that goes wrong is rolled back by redeploying the previous version.
