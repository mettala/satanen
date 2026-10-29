import { describe, expect, it } from 'vitest';
import * as lib from './release-lib.mjs';

const sha = 'a'.repeat(40);

describe('treeProblems', () => {
  it('accepts a clean tree', () => expect(lib.treeProblems('')).toEqual([]));
  it('ignores untracked agent worktrees only', () => {
    expect(lib.treeProblems('?? .claude/worktrees/agent-x/\n')).toEqual([]);
    expect(lib.treeProblems('?? notes.txt\n')).toHaveLength(1);
  });
  it('fails on tracked changes', () => {
    expect(lib.treeProblems(' M src/a.ts\nM  b.ts\n')).toHaveLength(2);
  });
});

describe('branch and commit checks', () => {
  it('requires main', () => {
    expect(lib.branchProblem('main')).toBeNull();
    expect(lib.branchProblem('PUB.9-x')).toMatch(/PUB\.9-x/);
  });
  it('requires HEAD to equal origin/main', () => {
    expect(lib.sameCommitProblem(sha, sha)).toBeNull();
    expect(lib.sameCommitProblem(sha, 'b'.repeat(40))).toMatch(/not the same/);
  });
});

describe('ciProblem', () => {
  it('passes with a completed success', () => {
    expect(lib.ciProblem([{ status: 'completed', conclusion: 'success' }], sha)).toBeNull();
  });
  it('fails when missing, pending or failed', () => {
    expect(lib.ciProblem([], sha)).toMatch(/no CI run/);
    expect(lib.ciProblem([{ status: 'in_progress', conclusion: '' }], sha)).toMatch(
      /still running/,
    );
    expect(lib.ciProblem([{ status: 'completed', conclusion: 'failure' }], sha)).toMatch(
      /did not succeed/,
    );
    expect(lib.ciProblem(null, sha)).toMatch(/no CI run/);
  });
});

describe('deployMessage and version', () => {
  it('is one short line', () => {
    const msg = lib.deployMessage(sha, 'fix: "quote" $(rm -rf)\nsecond line\u0000');
    expect(msg.startsWith('aaaaaaa fix:')).toBe(true);
    expect(msg).not.toMatch(/[\n\u0000]/);
    expect(lib.deployMessage(sha, 'x'.repeat(500))).toHaveLength(100);
  });
  it('validates shas', () => {
    expect(lib.isFullSha(sha)).toBe(true);
    expect(lib.isFullSha('abc123')).toBe(false);
    expect(lib.isFullSha('A'.repeat(40))).toBe(false);
    expect(lib.versionProblem({ sha })).toBeNull();
    expect(lib.versionProblem({})).not.toBeNull();
    expect(lib.versionProblem(null)).not.toBeNull();
  });
  it('writes sha and ISO time', () => {
    expect(lib.versionJson(sha, new Date('2026-10-25T10:00:00Z'))).toEqual({
      sha,
      builtAt: '2026-10-25T10:00:00.000Z',
    });
  });
});
