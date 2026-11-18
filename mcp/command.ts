// The `/vault …` slash command: zenbot passes the first word as `action` and the rest as one string.
// The answer is Markdown for a person reading a chat, not JSON. Logic lives in vault.ts; this file is
// the grammar (parsing) and the wording (formatting).
//
//   /vault lint [folder]                      findings by rule, `path:line — message`
//   /vault new <kind> [title...]              title: quoted or not, up to the end of the line
//   /vault new project-note|tasks <project> [title...]   these two need an existing project, named first
//   /vault new <kind> project=<name> [title...]          `project=` works anywhere (the only way for a goal)
//   /vault status                             which method folders are present or missing
//   /vault setup                              create only what is missing
//
// A name or title with spaces may be quoted ("…" or '…'); unquoted words are joined with one space.
import { KINDS, isKind } from '../core/templates.ts';
import { FileError } from './files.ts';
import type { Files } from './files.ts';
import { initialize, newNote, runLint, status } from './vault.ts';

export const MAX_LINES = 40;
const NEEDS_PROJECT: readonly string[] = ['project-note', 'tasks'];

export const USAGE = [
  '**/vault** — your notes, by the method',
  '- `/vault lint [folder]` — check the vault; give a folder or note to narrow the report',
  '- `/vault new <kind> [title]` — create a note from a template. Kinds: ' + KINDS.join(', '),
  '  - `project-note` and `tasks` name an existing project first: `/vault new project-note alpha "Kick-off"`',
  '  - any kind takes `project=<name>`: `/vault new goal "Run a 10k" project=alpha`',
  '  - quote names with spaces; `daily` with no title is today',
  '- `/vault status` — which method folders exist',
  '- `/vault setup` — create only what is missing',
  'Browse and search the notes in the Files tab.',
].join('\n');

interface Token { raw: string; value: string }

/** Words split on spaces, with "double" or 'single' (or curly) quotes keeping spaces inside one word. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let raw = '', value = '', quote = '', open = false;
  const close: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’' };
  for (const ch of text) {
    if (quote) {
      raw += ch;
      if (ch === quote) quote = ''; else value += ch;
    } else if (ch in close && (!open || value.endsWith('='))) {
      quote = close[ch]; raw += ch; open = true;
    } else if (/\s/.test(ch)) {
      if (open) { out.push({ raw, value }); raw = value = ''; open = false; }
    } else {
      raw += ch; value += ch; open = true;
    }
  }
  if (quote) throw new FileError(`A quote is not closed: ${text.trim()}`);
  if (open) out.push({ raw, value });
  return out;
}

export interface NewInput { kind: string; title?: string; project?: string }

/** `new` arguments: `<kind>`, then (for project-note and tasks) the project, then the title; `project=` anywhere. */
export function parseNew(rest: string): NewInput {
  const [kindToken, ...tokens] = tokenize(rest);
  if (!kindToken) throw new FileError('Say what to create: /vault new <kind> [title]. Kinds: ' + KINDS.join(', ') + '.');
  const kind = kindToken.value.toLowerCase();
  if (!isKind(kind)) throw new FileError(`Unknown kind "${kindToken.value}": use ${KINDS.join(', ')}.`);
  let project: string | undefined;
  const words: string[] = [];
  for (const t of tokens) {
    if (t.raw.startsWith('project=')) {
      if (project !== undefined) throw new FileError('Give project= once.');
      project = t.value.slice('project='.length);
      if (!project) throw new FileError('project= needs a name.');
    } else words.push(t.value);
  }
  if (project === undefined && NEEDS_PROJECT.includes(kind)) {
    if (!words.length) throw new FileError(`A ${kind} needs a project: /vault new ${kind} <project>${kind === 'tasks' ? '' : ' <title>'}.`);
    project = words.shift();
  }
  if (kind === 'tasks' && words.length) throw new FileError('tasks takes only the project: /vault new tasks <project>.');
  const title = words.join(' ');
  return { kind, ...(title ? { title } : {}), ...(project !== undefined ? { project } : {}) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const link = (p: string) => `[${p}](<${p}>)`;

export async function lintText(files: Files, rest: string): Promise<string> {
  const folder = tokenize(rest).map((t) => t.value).join(' ');
  const r = await runLint(files, folder);
  const { errors, warnings } = r.counts;
  const total = errors + warnings;
  const where = r.scope === '(vault)' ? 'the vault' : `\`${r.scope}\``;
  const tail = [
    r.skipped ? `${plural(r.skipped, 'note')} could not be read.` : '',
    r.indexTruncated ? 'The vault has more notes than the linter reads.' : '',
    r.configWarning ? `zenvault.json: ${r.configWarning}` : '',
  ].filter(Boolean);
  if (!total) return [`**No findings** in ${where}: ${plural(r.checked, 'note')} checked.`, ...tail].join('\n');
  const head = `**${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(r.notesWithFindings, 'note')}** (${where}, ${r.checked} checked)`;
  const rules = new Map<string, typeof r.findings>();
  for (const f of [...r.findings].sort((a, b) => (a.severity === b.severity ? a.rule.localeCompare(b.rule) : a.severity === 'error' ? -1 : 1))) {
    rules.set(f.rule, [...(rules.get(f.rule) ?? []), f]);
  }
  const lines: string[] = [];
  let shown = 0;
  for (const [rule, list] of rules) {
    if (shown >= MAX_LINES) break;
    const take = list.slice(0, MAX_LINES - shown);
    lines.push('', `**${rule}** (${list[0].severity}, ${list.length}${r.findingsTruncated ? '+' : ''})`);
    for (const f of take) lines.push(`- ${f.path}${f.line ? `:${f.line}` : ''} — ${f.message}`);
    shown += take.length;
  }
  if (total > shown) lines.push('', `…and ${total - shown} more; run \`/vault lint <folder>\` to narrow.`);
  return [head, ...lines, ...(tail.length ? ['', ...tail] : [])].join('\n');
}

export async function newText(files: Files, rest: string, now = new Date()): Promise<string> {
  const r = await newNote(files, parseNew(rest), now);
  return r.paths.length === 1 ? `Created ${link(r.paths[0])}` : `Created:\n${r.paths.map((p) => `- ${link(p)}`).join('\n')}`;
}

export async function statusText(files: Files): Promise<string> {
  const s = await status(files);
  const have = s.folders.filter((f) => f.exists).map((f) => `${f.name}/`);
  const missing = [
    ...s.folders.filter((f) => !f.exists).map((f) => `${f.name}/`),
    ...(s.missingTemplates.length ? [`${plural(s.missingTemplates.length, 'template')} in Templates/`] : []),
    ...(s.hasAgents ? [] : ['AGENTS.md']),
    ...(s.hasConfig ? [] : ['zenvault.json']),
  ];
  return [
    `**Vault:** ${plural(s.notes, 'note')}`,
    `Present: ${have.length ? have.join(', ') : 'none'}`,
    missing.length ? `Missing: ${missing.join(', ')}. Run \`/vault setup\` to create them.` : 'Nothing missing: the method is set up.',
    ...(s.configWarning ? [`zenvault.json: ${s.configWarning}`] : []),
  ].join('\n');
}

export async function setupText(files: Files): Promise<string> {
  const r = await initialize(files);
  if (!r.created.length) return 'Nothing to create: the vault is already set up.';
  return `Created ${r.created.length}:\n${r.created.map((c) => `- ${c}`).join('\n')}\nKept ${r.existing.length} that already existed.`;
}

/** The text a `/vault` command shows. A refusal is a FileError. */
export async function runCommand(files: Files, action: string | undefined, rest = '', now = new Date()): Promise<string> {
  switch ((action ?? '').trim().toLowerCase()) {
    case 'lint': return lintText(files, rest);
    case 'new': return newText(files, rest, now);
    case 'status': return statusText(files);
    case 'setup': return setupText(files);
    default: return USAGE;
  }
}
