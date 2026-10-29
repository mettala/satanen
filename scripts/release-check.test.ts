import { describe, expect, it } from 'vitest';
import { checkRelease } from './release-lib.mjs';

const sha = 'a'.repeat(40);
const good = [{ status: 'completed', conclusion: 'success' }];

type Overrides = Partial<
  Record<'status' | 'branch' | 'head' | 'fetch' | 'fetched' | 'gh', unknown>
>;

// A fake command runner: a value is returned, an Error is thrown.
function fake(o: Overrides = {}) {
  const answers: Record<string, unknown> = {
    status: '',
    branch: 'main\n',
    head: `${sha}\n`,
    fetch: '',
    fetched: `${sha}\n`,
    gh: JSON.stringify(good),
    ...o,
  };
  return (cmd: string, args: string[]) => {
    const key =
      cmd === 'gh'
        ? 'gh'
        : args[0] === 'status'
          ? 'status'
          : args[0] === 'fetch'
            ? 'fetch'
            : args.includes('--abbrev-ref')
              ? 'branch'
              : args[1] === 'FETCH_HEAD'
                ? 'fetched'
                : 'head';
    const a = answers[key];
    if (a instanceof Error) throw a;
    return a as string;
  };
}

const fails = (o: Overrides, pattern: RegExp) => {
  const r = checkRelease(fake(o));
  expect(r.ok).toBe(false);
  expect(r.failures.join('\n')).toMatch(pattern);
};

describe('checkRelease (fails closed)', () => {
  it('passes when everything is fine', () => {
    expect(checkRelease(fake())).toEqual({ ok: true, failures: [], head: sha });
  });
  it('fails on a dirty tree', () => fails({ status: ' M a.ts\n' }, /uncommitted/));
  it('fails on the wrong branch', () => fails({ branch: 'feature\n' }, /releases come only/));
  it('fails when HEAD is not origin/main', () =>
    fails({ fetched: `${'b'.repeat(40)}\n` }, /not the same commit/));
  it('fails when the fetch fails, even if the old ref would match', () =>
    fails({ fetch: new Error('network down') }, /Could not fetch origin main: network down/));
  it('fails when HEAD cannot be read', () =>
    fails({ head: new Error('boom') }, /Could not read HEAD/));
  it('fails when gh is missing or logged out', () => {
    fails({ gh: new Error('spawn gh ENOENT') }, /Could not ask GitHub/);
    fails({ gh: Object.assign(new Error('x'), { stderr: 'not logged in' }) }, /not logged in/);
  });
  it('fails when gh returns no runs', () => fails({ gh: '[]' }, /no CI run/));
  it('fails on a pending run', () =>
    fails({ gh: JSON.stringify([{ status: 'in_progress', conclusion: '' }]) }, /still running/));
  it('fails on a failed run', () =>
    fails(
      { gh: JSON.stringify([{ status: 'completed', conclusion: 'failure' }]) },
      /did not succeed/,
    ));
  it('fails on output that is not JSON', () => fails({ gh: 'oops' }, /Could not read the answer/));
  it('only asks for push runs on main', () => {
    const seen: string[][] = [];
    const run = fake();
    checkRelease((cmd: string, args: string[]) => {
      if (cmd === 'gh') seen.push(args);
      return run(cmd, args);
    });
    expect(seen[0]).toEqual(expect.arrayContaining(['--branch', 'main', '--event', 'push']));
  });
});
