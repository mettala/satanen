// Pure helpers for the release guard and the deploy scripts (PUB.9).
// No I/O here, so every rule can be unit tested.

const IGNORED_UNTRACKED = '.claude/worktrees/';

/** Reasons the working tree is not clean, from `git status --porcelain` output. */
export function treeProblems(porcelain) {
  const problems = [];
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const path = line.slice(3);
    if (status === '??' && path.startsWith(IGNORED_UNTRACKED)) continue;
    problems.push(
      status === '??'
        ? `untracked file ${path} (commit it or remove it)`
        : `uncommitted change in ${path}`,
    );
  }
  return problems;
}

export function branchProblem(branch) {
  return branch === 'main' ? null : `you are on branch "${branch}", releases come only from main`;
}

export function sameCommitProblem(head, originMain) {
  if (head === originMain) return null;
  return `local HEAD (${head.slice(0, 7)}) is not the same commit as origin/main (${originMain.slice(0, 7)}); pull or push first`;
}

/** `runs` is the parsed JSON of `gh run list --json status,conclusion`. */
export function ciProblem(runs, sha) {
  const short = sha.slice(0, 7);
  if (!Array.isArray(runs) || runs.length === 0) {
    return `no CI run found for commit ${short}; wait for CI to start or check the Actions tab`;
  }
  if (runs.some((r) => r.status === 'completed' && r.conclusion === 'success')) return null;
  if (runs.some((r) => r.status !== 'completed')) {
    return `CI for commit ${short} is still running; wait until it has finished`;
  }
  return `CI for commit ${short} did not succeed (${runs.map((r) => r.conclusion).join(', ')})`;
}

export function isFullSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

/** Text for wrangler's --message: "<short sha> <subject>", one line, bounded. */
export function deployMessage(sha, subject) {
  // eslint-disable-next-line no-control-regex
  const clean = subject.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return `${sha.slice(0, 7)} ${clean}`.slice(0, 100);
}

export function versionJson(sha, now = new Date()) {
  return { sha, builtAt: now.toISOString() };
}

/** Problem with a parsed version.json, or null. */
export function versionProblem(value) {
  return isFullSha(value?.sha) ? null : 'version.json has no valid 40-character sha';
}

/**
 * All release checks. `run(cmd, args)` returns stdout and throws when the command fails
 * (injected so tests need no git, network or gh login). Fails closed: any command that
 * cannot be run or read is a failure. Returns { ok, failures, head }.
 */
export function checkRelease(run) {
  const failures = [];
  const attempt = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      const why = String(error?.stderr || error?.message || error)
        .trim()
        .split('\n')[0];
      failures.push(`${label}: ${why}`);
      return null;
    }
  };

  const status = attempt('Could not read git status', () => run('git', ['status', '--porcelain']));
  if (status !== null) failures.push(...treeProblems(status));

  const branch = attempt('Could not read the branch', () =>
    run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
  );
  if (branch !== null) {
    const p = branchProblem(branch);
    if (p) failures.push(p);
  }

  const head = attempt('Could not read HEAD', () => run('git', ['rev-parse', 'HEAD']).trim());
  const fetched = attempt('Could not fetch origin main', () =>
    run('git', ['fetch', 'origin', 'main']),
  );
  // FETCH_HEAD is what the fetch just returned, so a stale origin/main ref cannot pass.
  const origin =
    fetched === null
      ? null
      : attempt('Could not read the fetched origin main', () =>
          run('git', ['rev-parse', 'FETCH_HEAD']).trim(),
        );
  if (head && origin) {
    const p = sameCommitProblem(head, origin);
    if (p) failures.push(p);
  }

  if (head) {
    const out = attempt('Could not ask GitHub about CI (is gh installed and logged in?)', () =>
      run('gh', [
        'run',
        'list',
        '--commit',
        head,
        '--workflow',
        'CI',
        '--branch',
        'main',
        '--event',
        'push',
        '--json',
        'status,conclusion',
      ]),
    );
    if (out !== null) {
      let runs = null;
      try {
        runs = JSON.parse(out);
      } catch {
        failures.push('Could not read the answer from gh');
      }
      if (runs) {
        const p = ciProblem(runs, head);
        if (p) failures.push(p);
      }
    }
  }

  return { ok: failures.length === 0, failures, head };
}
