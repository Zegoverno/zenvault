import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileError, Files } from './files.ts';

let dir: string, root: string, outside: string, files: Files;
const put = (rel: string, text = `# ${rel}\n`, base = root) => {
  mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  writeFileSync(path.join(base, rel), text);
};

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'zenvault-files-'));
  root = path.join(dir, 'vault');
  outside = path.join(dir, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  put('index.md');
  put('notes/a.md');
  put('notes/b2.md');
  put('notes/b10.md');
  put('notes/readme.txt', 'plain');
  put('.hidden/secret.md');
  put('.dot.md');
  put('secret.md', 'top secret', outside);
  put('shared/y.md', 'outside note', outside);
  symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'notes/leak.md')); // a file link out
  symlinkSync(path.join(outside, 'shared'), path.join(root, 'linked')); // a folder link out
  symlinkSync(path.join(root, '.hidden'), path.join(root, 'sneaky')); // a link to a dot folder, inside the root
  symlinkSync(path.join(dir, 'nowhere.md'), path.join(root, 'notes/broken.md'));
  files = new Files(root);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const refuses = async (p: unknown, why?: RegExp, op: (p: unknown) => Promise<unknown> = (x) => files.read(x)) => {
  const e = await op(p).then(() => null, (x) => x);
  expect(e, String(p)).toBeInstanceOf(FileError);
  if (why) expect(e.message).toMatch(why);
};

describe('reading', () => {
  it('reads notes and lists a folder: notes and folders only, natural order, no dot entries, no links out', async () => {
    expect(await files.read('index.md')).toBe('# index.md\n');
    const l = await files.list('notes');
    expect(l.files.map((f) => f.path)).toEqual(['notes/a.md', 'notes/b2.md', 'notes/b10.md']);
    expect((await files.list()).folders.map((f) => f.path)).toEqual(['notes']);
    expect((await files.list('./notes/')).dir).toBe('notes');
  });
  it('collects every note for the linter, without links out or hidden notes', async () => {
    const { notes } = await files.all();
    expect(notes.map((n) => n.path).sort()).toEqual(['index.md', 'notes/a.md', 'notes/b10.md', 'notes/b2.md']);
  });
  it('only reads .md notes', async () => {
    await refuses('notes/readme.txt', /Markdown/);
    await refuses('notes', /Markdown/);
    await refuses('', /Markdown/);
  });
});

describe('safety', () => {
  it('refuses traversal', async () => {
    for (const p of ['../outside/secret.md', 'notes/../../outside/secret.md', '..', 'notes/..', '../vault/index.md']) await refuses(p, /\.\./);
  });
  it('refuses absolute paths, drives, home and backslashes', async () => {
    await refuses(path.join(root, 'index.md'), /absolute/);
    for (const p of ['/etc/passwd.md', 'C:/x.md', '~/x.md', '\\windows\\x.md']) await refuses(p, /absolute/);
    await refuses('a\\b.md', /Use \//);
    await refuses('a\0b.md');
    await refuses(42);
  });
  it('refuses hidden files and folders, also through a link', async () => {
    for (const p of ['.dot.md', '.hidden/secret.md', 'notes/.x.md']) await refuses(p, /Hidden/);
    await refuses('sneaky/secret.md', /Hidden/);
  });
  it('refuses links that point out, and never lists them', async () => {
    await refuses('notes/leak.md', /outside/);
    await refuses('linked/y.md', /outside/);
    await refuses('notes/broken.md', /Not found/);
    await refuses('linked', /outside/, (p) => files.list(p as string));
    expect((await files.list()).folders.some((f) => f.name === 'linked')).toBe(false);
    expect((await files.list('notes')).files.some((f) => f.name === 'leak.md')).toBe(false);
  });
  it('needs an absolute root', () => {
    expect(() => new Files('vault')).toThrow(/absolute/);
  });
});

describe('creating', () => {
  it('creates a file and its folders, exclusively', async () => {
    await files.create('new/deep/a.md', 'one');
    expect(readFileSync(path.join(root, 'new/deep/a.md'), 'utf8')).toBe('one');
    await refuses('new/deep/a.md', /already exists/, (p) => files.create(p, 'two'));
    expect(readFileSync(path.join(root, 'new/deep/a.md'), 'utf8')).toBe('one');
    await refuses('index.md', /already exists/, (p) => files.create(p, 'x'));
    expect(readFileSync(path.join(root, 'index.md'), 'utf8')).toBe('# index.md\n');
  });
  it('never writes through a link, to a file or a folder', async () => {
    await refuses('notes/leak.md', undefined, (p) => files.create(p, 'x'));
    await refuses('notes/broken.md', undefined, (p) => files.create(p, 'x'));
    await refuses('linked/z.md', /outside/, (p) => files.create(p, 'x'));
    await refuses('linked/deeper/z.md', /outside/, (p) => files.create(p, 'x'));
    expect(readFileSync(path.join(outside, 'secret.md'), 'utf8')).toBe('top secret');
    expect(() => readFileSync(path.join(outside, 'shared/z.md'))).toThrow();
  });
  it('refuses unsafe paths, a file where a folder is needed', async () => {
    for (const p of ['../x.md', '/tmp/x.md', '.hid/x.md', 'a/../../x.md']) await refuses(p, undefined, (x) => files.create(x, 'x'));
    await refuses('index.md/child.md', undefined, (p) => files.create(p, 'x'));
  });
  it('makeDir reports whether it created the folder', async () => {
    expect(await files.makeDir('Daily')).toBe(true);
    expect(await files.makeDir('Daily')).toBe(false);
    await refuses('linked', /outside/, (p) => files.makeDir(p));
  });
});
