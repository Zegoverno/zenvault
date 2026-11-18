import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LINES, USAGE, parseNew, runCommand, tokenize } from './command.ts';
import { FileError, Files } from './files.ts';

const temps: string[] = [];
const vault = () => { const p = mkdtempSync(path.join(tmpdir(), 'zenvault-cmd-')); temps.push(p); return { p, f: new Files(p) }; };
afterEach(() => { for (const p of temps.splice(0)) rmSync(p, { recursive: true, force: true }); });
const now = new Date(2031, 2, 9);
const run = (f: Files, action: string, rest = '') => runCommand(f, action, rest, now);

describe('tokenize', () => {
  it('splits words and keeps quoted spaces together', () => {
    expect(tokenize('goal "Run a 10k" project=alpha').map((t) => t.value)).toEqual(['goal', 'Run a 10k', 'project=alpha']);
    expect(tokenize(`a 'b c'  d`).map((t) => t.value)).toEqual(['a', 'b c', 'd']);
    expect(tokenize('project="my proj" x').map((t) => [t.raw, t.value])).toEqual([['project="my proj"', 'project=my proj'], ['x', 'x']]);
    expect(tokenize('“curly quotes” don\'t').map((t) => t.value)).toEqual(['curly quotes', "don't"]);
    expect(tokenize('   ')).toEqual([]);
  });
  it('refuses an unclosed quote', () => {
    expect(() => tokenize('goal "Run')).toThrow(FileError);
  });
});

describe('parseNew', () => {
  it('takes the rest of the line as an unquoted title', () => {
    expect(parseNew('fact Water boils at 100 C')).toEqual({ kind: 'fact', title: 'Water boils at 100 C' });
    expect(parseNew('Fact "Quoted title"')).toEqual({ kind: 'fact', title: 'Quoted title' });
    expect(parseNew('daily')).toEqual({ kind: 'daily' });
    expect(parseNew('daily 2031-03-10')).toEqual({ kind: 'daily', title: '2031-03-10' });
  });
  it('names the project first for project-note and tasks, or with project= anywhere', () => {
    expect(parseNew('project-note alpha Kick off meeting')).toEqual({ kind: 'project-note', project: 'alpha', title: 'Kick off meeting' });
    expect(parseNew('project-note "big plan" "Kick off"')).toEqual({ kind: 'project-note', project: 'big plan', title: 'Kick off' });
    expect(parseNew('project-note Kick-off project=alpha')).toEqual({ kind: 'project-note', project: 'alpha', title: 'Kick-off' });
    expect(parseNew('tasks alpha')).toEqual({ kind: 'tasks', project: 'alpha' });
    expect(parseNew('goal "Run a 10k" project=alpha')).toEqual({ kind: 'goal', title: 'Run a 10k', project: 'alpha' });
    expect(parseNew('goal project=alpha Run a 10k')).toEqual({ kind: 'goal', title: 'Run a 10k', project: 'alpha' });
    expect(parseNew('goal Run a 10k')).toEqual({ kind: 'goal', title: 'Run a 10k' });
    expect(parseNew('fact "project=x is a title"')).toEqual({ kind: 'fact', title: 'project=x is a title' });
  });
  it('refuses what has no meaning', () => {
    expect(() => parseNew('')).toThrow(/Say what to create/);
    expect(() => parseNew('essay Hello')).toThrow(/Unknown kind "essay": use daily, goal/);
    expect(() => parseNew('project-note')).toThrow(/needs a project/);
    expect(() => parseNew('tasks')).toThrow(/needs a project/);
    expect(() => parseNew('tasks alpha extra')).toThrow(/only the project/);
    expect(() => parseNew('goal x project=')).toThrow(/needs a name/);
    expect(() => parseNew('goal x project=a project=b')).toThrow(/once/);
  });
});

describe('the actions', () => {
  it('shows the usage for nothing or something else', async () => {
    const { f } = vault();
    expect(await run(f, '')).toBe(USAGE);
    expect(await runCommand(f, undefined)).toBe(USAGE);
    expect(await run(f, 'dance')).toBe(USAGE);
    expect(USAGE).toContain('Files tab');
  });

  it('status says what is missing, then what is set up', async () => {
    const { f } = vault();
    const before = await run(f, 'status');
    expect(before).toContain('**Vault:** 0 notes');
    expect(before).toContain('Present: none');
    expect(before).toMatch(/Missing: Daily\/, Goals\/, Projects\/, wiki\/, Templates\/, skills\/, 13 templates in Templates\/, AGENTS\.md, zenvault\.json\. Run `\/vault setup`/);
    await run(f, 'setup');
    const after = await run(f, 'status');
    expect(after).toContain('Present: Daily/, Goals/, Projects/, wiki/, Templates/, skills/');
    expect(after).toContain('Nothing missing');
  });

  it('setup creates only what is missing and lists it', async () => {
    const { p, f } = vault();
    mkdirSync(path.join(p, 'Goals'));
    writeFileSync(path.join(p, 'AGENTS.md'), 'mine');
    const out = await run(f, 'setup');
    expect(out).toMatch(/^Created \d+:/);
    expect(out).toContain('- Daily/');
    expect(out).toContain('- zenvault.json');
    expect(out).not.toContain('- Goals/');
    expect(out).not.toContain('- AGENTS.md');
    expect(out).toMatch(/Kept 2 that already existed\.$/);
    expect(readFileSync(path.join(p, 'AGENTS.md'), 'utf8')).toBe('mine');
    expect(await run(f, 'setup')).toBe('Nothing to create: the vault is already set up.');
  });

  it('new creates the note and links its path', async () => {
    const { p, f } = vault();
    expect(await run(f, 'new', 'project alpha')).toBe('Created:\n- [Projects/alpha/alpha.md](<Projects/alpha/alpha.md>)\n- [Projects/alpha/tasks.md](<Projects/alpha/tasks.md>)');
    expect(await run(f, 'new', 'goal "Run a 10k" project=alpha')).toBe('Created [Goals/Run a 10k.md](<Goals/Run a 10k.md>)');
    expect(readFileSync(path.join(p, 'Goals/Run a 10k.md'), 'utf8')).toContain('[[Projects/alpha/alpha]]');
    expect(await run(f, 'new', 'project-note alpha Kick off')).toBe('Created [Projects/alpha/notes/Kick off.md](<Projects/alpha/notes/Kick off.md>)');
    expect(await run(f, 'new', 'daily')).toBe('Created [Daily/2031-03-09.md](<Daily/2031-03-09.md>)');
    expect(await run(f, 'new', 'fact Water boils at 100 C')).toContain('wiki/Water boils at 100 C.md');
  });

  it('new refuses an unknown kind, a missing project, a file that exists and a path out', async () => {
    const { p, f } = vault();
    await expect(run(f, 'new', 'essay x')).rejects.toThrow(/Unknown kind/);
    await expect(run(f, 'new', 'project-note ghost Plan')).rejects.toThrow(/Project "ghost" does not exist/);
    await expect(run(f, 'new', 'goal x project=ghost')).rejects.toThrow(/does not exist/);
    await run(f, 'new', 'fact Same');
    writeFileSync(path.join(p, 'wiki/Same.md'), 'edited');
    await expect(run(f, 'new', 'fact Same')).rejects.toThrow(/already exists: nothing was overwritten/);
    expect(readFileSync(path.join(p, 'wiki/Same.md'), 'utf8')).toBe('edited');
    for (const bad of ['fact ../escape', 'fact a/b', 'fact .hidden', 'fact "..\\x"', 'goal x project=../../y']) {
      await expect(run(f, 'new', bad), bad).rejects.toBeInstanceOf(FileError);
    }
    await expect(run(f, 'new', 'daily tomorrow')).rejects.toThrow(/YYYY-MM-DD/);
  });

  it('lint reports a clean vault in one line', async () => {
    const { f } = vault();
    await run(f, 'setup');
    await run(f, 'new', 'project demo');
    expect(await run(f, 'lint')).toMatch(/^\*\*No findings\*\* in the vault: \d+ notes checked\.$/);
  });

  it('lint groups findings by rule, with path:line, and scopes to a folder', async () => {
    const { p, f } = vault();
    await run(f, 'setup');
    writeFileSync(path.join(p, 'wiki/Broken.md'), '# no front matter\n\nSee [[Nowhere]].\n\n- [ ] a task without an id\n');
    writeFileSync(path.join(p, 'wiki/Other.md'), '# also none\n');
    const out = await run(f, 'lint');
    expect(out.split('\n')[0]).toMatch(/^\*\*4 errors, 0 warnings in 2 notes\*\* \(the vault, \d+ checked\)$/);
    expect(out).toContain('**type-missing** (error, 2)');
    expect(out).toMatch(/^- wiki\/Broken\.md:\d+ — .+$/m);
    expect(out).toMatch(/^- wiki\/Other\.md:1 — .+$/m);
    expect(out).toContain('**link-unresolved** (error, 1)');
    expect(out).not.toContain('more;');
    const scoped = await run(f, 'lint', 'wiki/Other.md');
    expect(scoped.split('\n')[0]).toMatch(/^\*\*1 error, 0 warnings in 1 note\*\* \(`wiki\/Other\.md`/);
    expect(await run(f, 'lint', 'Goals')).toMatch(/^\*\*No findings\*\* in `Goals`/);
    await expect(run(f, 'lint', 'nope')).rejects.toThrow(/Not found: nope/);
    await expect(run(f, 'lint', '../x')).rejects.toThrow(/\.\./);
    await expect(run(f, 'lint', '/etc')).rejects.toThrow(/absolute/);
  });

  it('lint caps the lines and says how many are left', async () => {
    const { p, f } = vault();
    await run(f, 'setup');
    for (let i = 0; i < 60; i++) writeFileSync(path.join(p, `wiki/n${String(i).padStart(2, '0')}.md`), '# none\n');
    const out = await run(f, 'lint');
    expect(out.split('\n')[0]).toContain('**60 errors, 0 warnings in 60 notes**');
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MAX_LINES);
    expect(out).toContain(`…and ${60 - MAX_LINES} more; run \`/vault lint <folder>\` to narrow.`);
  });
});
