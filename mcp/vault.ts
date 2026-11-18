// What the tools do, on a `Files` root: status, initialize, new, lint. No MCP in here, so it is tested directly.
import { CONFIG_FILE, defaultConfigText, parseConfig } from '../core/config.ts';
import type { Config } from '../core/config.ts';
import { count, lint } from '../core/lint.ts';
import type { Finding } from '../core/lint.ts';
import { fill, isKind, KINDS, plan } from '../core/templates.ts';
import { FileError, Files } from './files.ts';
import { METHOD, TEMPLATES } from './templates.ts';

export const FOLDERS = ['Daily', 'Goals', 'Projects', 'wiki', 'Templates', 'skills'];
export const MAX_FINDINGS = 500;

/** The vault's settings: `zenvault.json`, or the defaults (with a note when the file is unusable). */
export async function loadConfig(files: Files): Promise<{ config: Config; source: 'file' | 'default'; error?: string }> {
  const text = await files.readAny(CONFIG_FILE, 64 * 1024).catch(() => null);
  const { config, error } = parseConfig(text);
  return { config, source: text === null ? 'default' : 'file', ...(error ? { error } : {}) };
}

export async function status(files: Files) {
  const root = await files.list('');
  const folders = await Promise.all(FOLDERS.map(async (name) => ({ name, exists: await files.exists(name) })));
  const templates = Object.keys(TEMPLATES).sort();
  const haveTemplates = new Set((await files.list('Templates').catch(() => null))?.files.map((f) => f.name.replace(/\.md$/, '')));
  const { config, source, error } = await loadConfig(files);
  const { notes } = await files.all();
  const byFolder: Record<string, number> = {};
  for (const n of notes) { const top = n.path.includes('/') ? n.path.split('/')[0] : '(root)'; byFolder[top] = (byFolder[top] ?? 0) + 1; }
  return {
    folders,
    missingFolders: folders.filter((f) => !f.exists).map((f) => f.name),
    missingTemplates: templates.filter((t) => !haveTemplates.has(t)),
    hasAgents: await files.exists('AGENTS.md'),
    hasConfig: await files.exists(CONFIG_FILE),
    areas: config.areas, areasSource: source, ...(error ? { configWarning: error } : {}),
    notes: notes.length, byFolder, rootFolders: root.folders.map((f) => f.name),
  };
}

/** Create what is missing: folders, `Templates/*.md`, `AGENTS.md`, `zenvault.json`. Never overwrites. */
export async function initialize(files: Files) {
  const created: string[] = [];
  const existing: string[] = [];
  for (const dir of FOLDERS) (await files.makeDir(dir)) ? created.push(`${dir}/`) : existing.push(`${dir}/`);
  const put = async (rel: string, text: string) => {
    try { await files.create(rel, text); created.push(rel); } catch (e) { if (e instanceof FileError && /already exists/.test(e.message)) existing.push(rel); else throw e; }
  };
  for (const [name, text] of Object.entries(TEMPLATES).sort()) await put(`Templates/${name}.md`, text);
  await put('AGENTS.md', METHOD);
  await put(CONFIG_FILE, defaultConfigText());
  return { created, existing };
}

/** Create a note (or, for a project, its two files) from a template. Exclusive: nothing is overwritten. */
export async function newNote(files: Files, input: { kind: unknown; title?: string; project?: string }, now = new Date()) {
  if (!isKind(input.kind)) throw new FileError(`Unknown kind "${String(input.kind)}": use ${KINDS.join(', ')}.`);
  let planned;
  try { planned = plan(input.kind, input.title, input.project, now); } catch (e) { throw new FileError((e as Error).message); }
  if (planned.project && !(await files.exists(`Projects/${planned.project}/${planned.project}.md`))) {
    throw new FileError(`Project "${planned.project}" does not exist: create it first (kind "project").`);
  }
  for (const f of planned.files) if (await files.exists(f.path)) throw new FileError(`${f.path} already exists: nothing was overwritten.`);
  // A custom template in the vault's Templates/ folder wins over the bundled one.
  const text = async (name: string) => files.readAny(`Templates/${name}.md`, 64 * 1024).catch(() => TEMPLATES[name]);
  const paths: string[] = [];
  for (const f of planned.files) {
    await files.create(f.path, fill(await text(f.template), planned, now));
    paths.push(f.path);
  }
  return { path: paths[0], paths };
}

/** Lint the whole vault; `scope` (a note or folder) filters what is reported, not what is checked. */
export async function runLint(files: Files, scope?: string) {
  const from = scope === undefined || scope === '' ? '' : Files.clean(scope);
  if (from && !(await files.exists(from))) throw new FileError(`Not found: ${from}`);
  const { config, error } = await loadConfig(files);
  const { notes, skipped, truncated } = await files.all();
  const all = lint(notes, config);
  const findings: Finding[] = from ? all.filter((f) => f.path === from || f.path.startsWith(`${from}/`)) : all;
  return {
    scope: from || '(vault)', checked: notes.length, skipped, indexTruncated: truncated,
    counts: count(findings), notesWithFindings: new Set(findings.map((f) => f.path)).size, findings: findings.slice(0, MAX_FINDINGS), findingsTruncated: findings.length > MAX_FINDINGS,
    ...(error ? { configWarning: error } : {}),
  };
}
