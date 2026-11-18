import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KINDS } from '../core/templates.ts';
import { FileError, Files } from './files.ts';
import { TEMPLATES, METHOD } from './templates.ts';
import { initialize, newNote, runLint, status } from './vault.ts';

const temps: string[] = [];
const vault = () => { const p = mkdtempSync(path.join(tmpdir(), 'zenvault-vault-')); temps.push(p); return { p, f: new Files(p) }; };
afterEach(() => { for (const p of temps.splice(0)) rmSync(p, { recursive: true, force: true }); });
const now = new Date(2031, 2, 9);

describe('bundled method', () => {
  it('has a template per kind, and the method', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...KINDS].sort());
    expect(METHOD).toContain('# Vault conventions');
  });
});

describe('initialize', () => {
  it('creates the missing structure, then nothing; never overwrites', async () => {
    const { p, f } = vault();
    mkdirSync(path.join(p, 'Templates'));
    writeFileSync(path.join(p, 'Templates/daily.md'), 'keep this');
    writeFileSync(path.join(p, 'AGENTS.md'), 'my own rules');
    const r = await initialize(f);
    expect(r.created).toContain('Goals/');
    expect(r.created).toContain('zenvault.json');
    expect(r.created).not.toContain('AGENTS.md');
    expect(r.existing).toContain('Templates/daily.md');
    expect(readFileSync(path.join(p, 'Templates/daily.md'), 'utf8')).toBe('keep this');
    expect(readFileSync(path.join(p, 'AGENTS.md'), 'utf8')).toBe('my own rules');
    expect((await initialize(f)).created).toEqual([]);
    expect(readdirSync(path.join(p, 'Templates'))).toHaveLength(KINDS.length);
  });
  it('installs AGENTS.md when absent and reports status', async () => {
    const { p, f } = vault();
    expect((await status(f)).missingFolders).toHaveLength(6);
    await initialize(f);
    expect(readFileSync(path.join(p, 'AGENTS.md'), 'utf8')).toBe(METHOD);
    const s = await status(f);
    expect(s).toMatchObject({ missingFolders: [], missingTemplates: [], hasAgents: true, hasConfig: true, areasSource: 'file' });
    expect(s.areas).toHaveLength(6);
  });
  it('refuses to create through a link out', async () => {
    const { p, f } = vault();
    const out = mkdtempSync(path.join(tmpdir(), 'zenvault-out-')); temps.push(out);
    symlinkSync(out, path.join(p, 'Templates'));
    await expect(initialize(f)).rejects.toBeInstanceOf(FileError);
    expect(readdirSync(out)).toEqual([]);
  });
});

describe('new', () => {
  it('creates every kind from its template, and the vault lints clean except what a blank goal and idea ask for', async () => {
    const { f } = vault();
    await newNote(f, { kind: 'project', title: 'demo' }, now);
    await newNote(f, { kind: 'daily' }, now);
    await newNote(f, { kind: 'goal', title: 'Run a race', project: 'demo' }, now);
    await newNote(f, { kind: 'project-note', title: 'Plan', project: 'demo' }, now);
    await newNote(f, { kind: 'wiki-home' }, now);
    for (const kind of ['primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea'] as const) await newNote(f, { kind, title: `A ${kind}` }, now);
    const r = await runLint(f);
    // the blank goal asks for what only its owner can say
    expect(r.findings.filter((x) => x.severity === 'error').map((x) => `${x.rule}`)).toEqual(['goal-fields', 'goal-fields', 'goal-fields']);
    // and a blank idea asks for its author
    expect(r.findings.filter((x) => x.severity === 'warning').map((x) => x.rule)).toEqual(['idea-author']);
    expect(r.findings.every((x) => x.path === 'Goals/Run a race.md' || x.severity !== 'error')).toBe(true);
  });
  it('returns the path and fills placeholders', async () => {
    const { p, f } = vault();
    const r = await newNote(f, { kind: 'fact', title: 'Water boils at 100 C' }, now);
    expect(r.path).toBe('wiki/Water boils at 100 C.md');
    const text = readFileSync(path.join(p, r.path), 'utf8');
    expect(text).toContain('as_of: 2031-03-09');
    expect(text).toContain('# Water boils at 100 C');
    expect(text).not.toContain('{{');
  });
  it('never overwrites, and checks the project exists', async () => {
    const { p, f } = vault();
    await newNote(f, { kind: 'fact', title: 'A' }, now);
    writeFileSync(path.join(p, 'wiki/A.md'), 'edited');
    await expect(newNote(f, { kind: 'fact', title: 'A' }, now)).rejects.toThrow(/already exists/);
    expect(readFileSync(path.join(p, 'wiki/A.md'), 'utf8')).toBe('edited');
    await expect(newNote(f, { kind: 'project-note', title: 'N', project: 'ghost' }, now)).rejects.toThrow(/does not exist/);
    await newNote(f, { kind: 'project', title: 'demo' }, now);
    await expect(newNote(f, { kind: 'project', title: 'demo' }, now)).rejects.toThrow(/already exists/);
  });
  it('refuses a bad kind or title', async () => {
    const { f } = vault();
    await expect(newNote(f, { kind: 'essay', title: 'x' })).rejects.toThrow(/Unknown kind/);
    await expect(newNote(f, { kind: 'fact', title: '../x' })).rejects.toBeInstanceOf(FileError);
  });
  it('prefers the vault\'s own template', async () => {
    const { p, f } = vault();
    mkdirSync(path.join(p, 'Templates'));
    writeFileSync(path.join(p, 'Templates/fact.md'), '---\ntype: fact\nas_of: {{date}}\n---\nMine: {{title}}\n');
    const r = await newNote(f, { kind: 'fact', title: 'B' }, now);
    expect(readFileSync(path.join(p, r.path), 'utf8')).toContain('Mine: B');
  });
});

describe('lint', () => {
  it('uses zenvault.json areas, scopes the report, and warns about a bad config', async () => {
    const { p, f } = vault();
    await initialize(f);
    await newNote(f, { kind: 'project', title: 'demo' }, now);
    writeFileSync(path.join(p, 'Goals/G.md'), '---\nproject: "[[Projects/demo/demo]]"\nareas: [craft]\nstatus: active\ndue: 2031-01-01\nmetric: m\ntarget: 1\n---\n');
    expect((await runLint(f)).findings.map((x) => x.rule)).toEqual(['goal-area-unknown']);
    writeFileSync(path.join(p, 'zenvault.json'), '{"areas":["craft"]}');
    expect((await runLint(f)).counts).toEqual({ errors: 0, warnings: 0 });
    writeFileSync(path.join(p, 'wiki/Bad.md'), '# no type\n');
    expect((await runLint(f, 'Goals')).counts.errors).toBe(0);
    expect((await runLint(f, 'wiki/Bad.md')).counts.errors).toBe(1);
    await expect(runLint(f, 'nope')).rejects.toThrow(/Not found/);
    await expect(runLint(f, '../x')).rejects.toThrow(/\.\./);
    writeFileSync(path.join(p, 'zenvault.json'), 'nope');
    expect((await runLint(f)).configWarning).toMatch(/JSON/);
  });
});
