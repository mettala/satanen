# Publishing the repository (PUB.5)

Plain-English guide for the owner. The plan is D41: the current repository becomes the private `satanen-archive`, and a **new repository with one commit** becomes the public `satanen`. Nothing in the old history is published. D50 says the real Yle content stays in the new repository.

These steps rename, create, publish or delete repositories. An agent runs none of them without your explicit "go" in that session; the commands are meant for your own Terminal. Lines starting with `#` are comments.

Why a private repository first: you can check that everything works before anyone can see it. Deleting a private repository that went wrong costs nothing. Deleting something from a public repository does not remove it (copies and history survive), so the step that makes it public (step 5) is the one to be careful with.

## 0. Before you start

- [ ] The proxy and web smoke scripts pass (`docs/maintainer/DEPLOY.md`). The Yle key is **not** rotated before publishing (owner decision, D54); `docs/maintainer/EMERGENCY.md` Part 5 says how if it is ever needed.
- [ ] `main` is clean, CI is green, and every branch or worktree with work you want to keep is merged or pushed. The old folder is archived in step 6 and nothing in it is copied over except the three secret files.
- [ ] In the old folder, `git status --ignored` shows which git-ignored files exist. Besides `.env`, `.env.fixtures` and `proxy/.dev.vars` (copied in step 7), anything you still need must be copied by hand.
- [ ] `gitleaks version` works (`brew install gitleaks` if not) and `gh auth status` shows your login.
- [ ] You have decided that nothing from the old repository's open pull requests or issues needs to move (they stay in the archive and are not copied).

## 1. Archive the old repository

```
gh repo rename satanen-archive -R mettala/satanen --yes
gh repo edit mettala/satanen-archive --description "Private archive of the Satanen development history"
# Stop the weekly section-map job in the archive (CI stays on: fixes to the archive still need it):
gh workflow disable section-map.yml -R mettala/satanen-archive
```

It stays **private**. In your old folder, point the remote at the new name (GitHub forwards the old name only until step 3 creates a new repository with it):

```
cd ~/dev/satanen
git remote set-url origin https://github.com/mettala/satanen-archive.git
```

Between step 1 and step 7 do not deploy: the release guard looks at the old folder's `origin`, and the new repository does not exist yet.

## 2. Export a clean copy

A fresh shallow clone contains only tracked files: no `.env` files, no local settings, no history.

```
rm -rf /tmp/satanen-export
git clone --depth 1 https://github.com/mettala/satanen-archive.git /tmp/satanen-export
cd /tmp/satanen-export
rm -rf .git
git init -b main
# The public commit must not carry your Mac's name or your own email:
git config user.name "mettala"
git config user.email "47830974+mettala@users.noreply.github.com"
```

Check before committing:

```
gitleaks dir . --config .gitleaks.toml
grep -rIn "Ossis-MacBoo[k]\|mettala[.]ossi\|/Users/oss[i]" . ; echo "grep done (no lines above = clean)"
# The Yle key from your own file, searched for without printing it (skip this line if `.env.fixtures` does not exist or the value is empty or in quotes; with an empty value the search would match every file):
grep -rIlF "$(grep '^YLE_APP_KEY=' ~/dev/satanen/.env.fixtures | cut -d= -f2)" . ; echo "key search done (no lines above = clean)"
```

Any hit: stop, fix it in the archive through a normal PR, and export again.

Then make the one commit:

```
git add -A
git commit -m "Initial public version"
gitleaks git . --config .gitleaks.toml
git log --format='%an <%ae>'     # must show only the noreply identity
```

## 3. Create the new repository, private, and push only `main`

```
gh repo create mettala/satanen --private --description "A modern reader for Yle Teksti-TV. Independent, not affiliated with Yle." --homepage "https://satanen.io"
git remote add origin https://github.com/mettala/satanen.git
git push -u origin main
```

Never use `--mirror` or `--all`, and do not push tags or other branches. Open the Actions tab: the CI run on `main` must be green. If it is red, fix it by deleting the repository (`gh repo delete mettala/satanen --yes`), repairing the archive and starting again from step 2.

## 4. Repository settings that work while private

```
R=mettala/satanen
# Squash merges only, delete the branch after merge
gh repo edit $R --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --enable-wiki=false --enable-projects=false
# The section-map workflow needs to open its pull request
gh api -X PUT repos/$R/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
# Pull requests from first-time and outside contributors never run CI without your approval
gh api -X PUT repos/$R/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors
# Dependabot alerts and security fixes
gh api -X PUT repos/$R/vulnerability-alerts
gh api -X PUT repos/$R/automated-security-fixes
gh repo edit $R --add-topic teksti-tv --add-topic yle --add-topic react-native --add-topic expo --add-topic typescript
```

If the fork-approval command is refused, set it in the web page: Settings, Actions, General, "Fork pull request workflows from outside collaborators", "Require approval for all outside collaborators".

## 5. Make it public (needs your explicit OK)

Look at the repository once as a stranger would: README, NOTICE, the file list. Then:

```
gh repo edit mettala/satanen --visibility public --accept-visibility-change-consequences
```

## 6. Right after it is public: protection that needs a public repository

If your GitHub plan is free, branch rulesets and secret scanning work only on public repositories, so do these immediately, in the same sitting. (With a paid plan they also work while private, and this step can move before step 5.)

```
R=mettala/satanen
# The ruleset for main (pull request required, squash only, the "ci" check, no force-push, no delete)
gh api -X POST repos/$R/rulesets --input docs/maintainer/ruleset-main.json
# Secret scanning with push protection
gh api -X PATCH repos/$R -F 'security_and_analysis[secret_scanning][status]=enabled' -F 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
# Private vulnerability reporting (SECURITY.md points to it)
gh api -X PUT repos/$R/private-vulnerability-reporting
```

Run the last block from a checkout that contains `docs/maintainer/ruleset-main.json` (the export folder works). In the web page (Settings, Rules, Rulesets) the ruleset must show as Active. Also turn on CodeQL in Settings, Code security, if you want it.

Check that it holds: from the export folder, `git commit --allow-empty -m test && git push origin HEAD:main` must be refused; then `git reset --hard HEAD~1`. If the push goes through, the ruleset is not active: stop and fix it in Settings, Rules before doing anything else.

## 7. Move your working folder to the new repository

Use the same folder name, so Claude Code's memory and settings for this project keep working.

```
mv ~/dev/satanen ~/dev/satanen-archive
git clone https://github.com/mettala/satanen.git ~/dev/satanen
# The three git-ignored secret files do not come with a clone. Copy them:
cp ~/dev/satanen-archive/.env ~/dev/satanen/.env
cp ~/dev/satanen-archive/.env.fixtures ~/dev/satanen/.env.fixtures
cp ~/dev/satanen-archive/proxy/.dev.vars ~/dev/satanen/proxy/.dev.vars
cd ~/dev/satanen && npm ci && npm --prefix proxy ci
```

Then ask an agent for: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, the smoke scripts, and one trial run of the section-map workflow (`gh workflow run section-map.yml`) to check that it can open its pull request. The first bot pull request also shows whether the required `ci` check turns green for it (its CI is started by hand, see the workflow); if the required check stays pending, tell the orchestrator.

## 8. Afterwards

- Freeze the archive so nothing runs or changes there: `gh repo archive mettala/satanen-archive --yes` (undo with `gh repo unarchive`).
- Update the README badge and links if they still point to anything but `mettala/satanen` (they should not, the name is reused).
- Update the backlog: PUB.3 and PUB.5 done, and move the "Waiting on owner" items.
- Open `satanen.io` and check Asetukset: Tietoja (attribution, independence from Yle) and the privacy text one more time.
- Run `stats` after about a week of readers and decide FR.5 (are the cache limits right).

## If something is wrong

- **Before step 5:** delete the new repository and start again at step 2. Nothing was published. (`gh repo delete` needs one extra permission: run `gh auth refresh -s delete_repo` first, or delete it in Settings, Danger Zone.) To give up entirely, delete the new repository and rename the archive back (`gh repo rename satanen -R mettala/satanen-archive --yes`), then turn the section-map workflow back on.
- **After step 5, a secret or private file is in the repository:** make it private again at once (`gh repo edit mettala/satanen --visibility private --accept-visibility-change-consequences`), rotate the secret (it is burnt even if the repository is private again), then delete the repository, fix the archive and export again. Do not try to scrub the history.
- **Yle asks for content to be removed:** see D50. Remove it in the archive, export again as a new repository, and replace the public one the same way (a new repository, not a history edit).
