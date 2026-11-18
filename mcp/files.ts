// The files a tool may touch: everything under one root (ZEN_PLUGIN_FILES).
//
// Every path a tool takes is relative to the root. A path is refused when it is absolute (a leading
// `/` or `\`, a drive letter, `~`), has a NUL or a backslash, climbs with `..`, or has a segment
// starting with a dot (`.git`, `.obsidian`). After that the real path (symlinks followed) must still
// lie inside the real root, so a link pointing out is never read, listed or written through.
// Writes are exclusive: a file that exists (even as a link) is never replaced.
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ENTRIES = 2000;
export const MAX_NOTES = 5000;

export class FileError extends Error {}

export interface Entry { name: string; path: string }
export interface Listing { dir: string; folders: Entry[]; files: (Entry & { size: number })[]; truncated: boolean }

const hidden = (name: string) => name.startsWith('.');
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const isNote = (name: string) => /\.md$/i.test(name);

export class Files {
  readonly root: string;
  private real: Promise<string>;

  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new FileError('ZEN_PLUGIN_FILES must be an absolute path.');
    this.root = root;
    this.real = realpath(root);
    this.real.catch(() => undefined);
  }

  /** The clean relative path (`a/b.md`; '' for the root) or an error saying why not. Pure. */
  static clean(rel: unknown): string {
    if (typeof rel !== 'string') throw new FileError('A path must be text.');
    if (rel.length > 1000) throw new FileError('That path is too long.');
    if (rel.includes('\0')) throw new FileError('That path is not valid.');
    if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel) || rel.startsWith('~')) throw new FileError('Paths are relative to the files folder: no absolute paths.');
    if (rel.includes('\\')) throw new FileError('Use / between folders.');
    const segs = rel.split('/').filter((s) => s !== '' && s !== '.');
    if (segs.includes('..')) throw new FileError('A path may not contain "..".');
    if (segs.some(hidden)) throw new FileError('Hidden files and folders (starting with a dot) are not available.');
    return segs.join('/');
  }

  private async rootReal(): Promise<string> {
    try { return await this.real; } catch { throw new FileError('The files folder does not exist.'); }
  }

  private within(root: string, real: string): void {
    if (real !== root && !real.startsWith(root + path.sep)) throw new FileError('That path leads outside the files folder.');
    if (path.relative(root, real).split(path.sep).some(hidden)) throw new FileError('Hidden files and folders (starting with a dot) are not available.');
  }

  /** The real path of an existing clean relative path, only if it is inside the root. */
  private async inside(rel: string): Promise<string> {
    const root = await this.rootReal();
    let real: string;
    try { real = await realpath(path.join(root, rel)); } catch { throw new FileError(`Not found: ${rel || '(root)'}`); }
    this.within(root, real);
    return real;
  }

  async exists(rel: unknown): Promise<boolean> {
    const p = Files.clean(rel);
    return this.inside(p).then(() => true, () => false);
  }

  async list(dirRel = ''): Promise<Listing> {
    const dir = Files.clean(dirRel);
    const abs = await this.inside(dir);
    if (!(await stat(abs)).isDirectory()) throw new FileError(`Not a folder: ${dir}`);
    const folders: Entry[] = [];
    const files: Listing['files'] = [];
    let truncated = false;
    for (const name of (await readdir(abs)).sort((a, b) => natural.compare(a, b))) {
      if (hidden(name)) continue;
      if (folders.length + files.length >= MAX_ENTRIES) { truncated = true; break; }
      const rel = join(dir, name);
      let real: string;
      try { real = await this.inside(rel); } catch { continue; } // a link out, or broken: not listed
      const s = await stat(real);
      if (s.isDirectory()) folders.push({ name, path: rel });
      else if (s.isFile() && isNote(name)) files.push({ name, path: rel, size: s.size });
    }
    return { dir, folders, files, truncated };
  }

  /** A note's text. */
  async read(rel: unknown): Promise<string> {
    const p = Files.clean(rel);
    if (!p || !isNote(p)) throw new FileError('Only Markdown notes (.md) can be read: give a path to one.');
    return this.readAny(p, MAX_BYTES);
  }

  /** The text of any plain file at a clean path (used for the settings file). */
  async readAny(p: string, limit = MAX_BYTES): Promise<string> {
    const abs = await this.inside(p);
    const s = await stat(abs);
    if (!s.isFile()) throw new FileError(`Not a file: ${p}`);
    if (s.size > limit) throw new FileError(`${p} is too big to read here (${Math.round(s.size / 1024)} KB; the limit is ${limit / 1024} KB).`);
    return (await readFile(abs, 'utf8')).replace(/^﻿/, '');
  }

  /** Every note under the root, breadth first, capped; notes too big to read are left out and counted. */
  async all(): Promise<{ notes: { path: string; text: string }[]; skipped: number; truncated: boolean }> {
    const notes: { path: string; text: string }[] = [];
    let skipped = 0;
    let truncated = false;
    const queue = [''];
    while (queue.length) {
      const l = await this.list(queue.shift()!).catch(() => null);
      if (!l) continue;
      for (const f of l.files) {
        if (notes.length >= MAX_NOTES) { truncated = true; break; }
        try { notes.push({ path: f.path, text: await this.read(f.path) }); } catch { skipped++; }
      }
      queue.push(...l.folders.map((f) => f.path));
    }
    return { notes, skipped, truncated };
  }

  /** Create folders under the root, one segment at a time, each checked to stay inside. Existing folders are kept. */
  private async ensureDir(rel: string): Promise<void> {
    const root = await this.rootReal();
    let cur = '';
    for (const seg of rel.split('/').filter(Boolean)) {
      cur = join(cur, seg);
      const abs = path.join(root, cur);
      const st = await lstat(abs).catch(() => null);
      if (!st) await mkdir(abs);
      this.within(root, await realpath(abs));
      if (!(await stat(abs)).isDirectory()) throw new FileError(`${cur} is a file, not a folder.`);
    }
  }

  /** Create a folder; false when it was already there. */
  async makeDir(rel: unknown): Promise<boolean> {
    const p = Files.clean(rel);
    if (!p) throw new FileError('Give a folder name.');
    const had = await this.exists(p);
    await this.ensureDir(p);
    return !had;
  }

  /** Create a new file with `text`; refuses when anything (a file, a folder, a link) is already there. */
  async create(rel: unknown, text: string): Promise<void> {
    const p = Files.clean(rel);
    if (!p || p.endsWith('/')) throw new FileError('Give a file path.');
    const parent = p.split('/').slice(0, -1).join('/');
    if (parent) await this.ensureDir(parent);
    const root = await this.rootReal();
    this.within(root, path.join(await realpath(path.join(root, parent)), path.basename(p)));
    let fh;
    try {
      // O_EXCL never follows a link at the final name, so an existing link is refused too.
      fh = await open(path.join(root, p), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new FileError(`${p} already exists: nothing was overwritten.`);
      throw e;
    }
    try { await fh.writeFile(text, 'utf8'); } finally { await fh.close(); }
  }
}
