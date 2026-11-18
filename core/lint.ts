// The vault linter: pure, no files. Give it every note as {path, text}; it returns findings.
//
// Each rule is a small named function. Per-note rules look at one note; vault rules (duplicate task
// ids, unresolved links, the wiki home) need the whole list, so `lint` builds one index first.
// Templates/ and skills/ hold placeholders and procedures, so they are not linted; nor are the
// vault's own instructions (AGENTS.md, CLAUDE.md).
import { DEFAULT_AREAS, normalizeArea } from './config.ts';
import type { Config } from './config.ts';
import { codeLines, list, splitFront, str, titleOf, wikiLinks } from './text.ts';
import type { Split } from './text.ts';

export interface Note { path: string; text: string }
export type Severity = 'error' | 'warning';
export interface Finding { path: string; line?: number; rule: string; severity: Severity; message: string }

export const WIKI_TYPES = ['primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea'] as const;
export const WIKI_STATUSES = ['current', 'stale', 'superseded'];
export const GOAL_STATUSES = ['active', 'done', 'dropped'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string): boolean => {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** `as_of` is a day (YYYY-MM-DD) or, when the day is unknown, a month (YYYY-MM). */
const validAsOf = (s: string): boolean => /^\d{4}-\d{2}$/.test(s) ? validDate(`${s}-01`) : validDate(s);

type Kind = 'wiki' | 'project-main' | 'project-tasks' | 'project-note' | 'project-stray' | 'goal' | 'daily' | 'other';
interface Info { note: Note; kind: Kind; split: Split; code: boolean[]; project?: string }
interface Ctx { config: Config; infos: Info[]; titles: Map<string, Info[]>; paths: Map<string, Info> }

const SKIPPED = /^(Templates|skills)\//;
const INSTRUCTIONS = /^(AGENTS|CLAUDE)\.md$/;

function classify(path: string): { kind: Kind; project?: string } {
  const p = path.split('/');
  if (p[0] === 'wiki') return { kind: 'wiki' };
  if (p[0] === 'Goals' && p.length === 2) return { kind: 'goal' };
  if (p[0] === 'Daily') return { kind: 'daily' };
  if (p[0] === 'Projects') {
    if (p.length === 2) return { kind: 'project-stray' };
    const project = p[1];
    if (p.length === 3) {
      if (p[2] === `${project}.md`) return { kind: 'project-main', project };
      if (p[2] === 'tasks.md') return { kind: 'project-tasks', project };
      return { kind: 'project-stray', project };
    }
    if (p[2] === 'notes') return { kind: 'project-note', project };
  }
  return { kind: 'other' };
}

const finding = (path: string, rule: string, severity: Severity, message: string, line?: number): Finding => ({ path, ...(line ? { line } : {}), rule, severity, message });

// ---- per-note rules ----------------------------------------------------------------------------

type Rule = (i: Info, ctx: Ctx) => Finding[];

/** `frontmatter-closed`: a `---` block that never ends hides every field below it. */
const frontmatterClosed: Rule = (i) => i.split.broken ? [finding(i.note.path, 'frontmatter-closed', 'error', 'Front matter opens with --- but never closes.', 1)] : [];

/** `type-missing`: wiki pages and project notes say what they are. */
const typeMissing: Rule = (i) => {
  if (i.kind !== 'wiki' && i.kind !== 'project-note') return [];
  if (i.split.broken) return [];
  if (!i.split.front) return [finding(i.note.path, 'type-missing', 'error', 'No front matter: add `type:` between --- lines at the top.', 1)];
  if (!str(i.split.front, 'type')) return [finding(i.note.path, 'type-missing', 'error', 'Front matter has no `type`.', 1)];
  return [];
};

/** `wiki-type-unknown`: a wiki page's type is one of the seven. */
const wikiTypeUnknown: Rule = (i) => {
  const type = str(i.split.front, 'type');
  if (i.kind !== 'wiki' || !type || (WIKI_TYPES as readonly string[]).includes(type)) return [];
  return [finding(i.note.path, 'wiki-type-unknown', 'error', `Unknown wiki type "${type}": use ${WIKI_TYPES.join(', ')}.`, 1)];
};

/** `wiki-flat`: the wiki is one flat folder. */
const wikiFlat: Rule = (i) => i.kind === 'wiki' && i.note.path.split('/').length > 2
  ? [finding(i.note.path, 'wiki-flat', 'warning', 'The wiki is flat: keep pages directly in wiki/, named by title.')] : [];

/** `wiki-status`: `status` is current, stale or superseded. */
const wikiStatus: Rule = (i) => {
  const status = str(i.split.front, 'status');
  if (i.kind !== 'wiki' || !status || WIKI_STATUSES.includes(status)) return [];
  return [finding(i.note.path, 'wiki-status', 'error', `Unknown status "${status}": use ${WIKI_STATUSES.join(', ')}.`, 1)];
};

/** `superseded-needs-link`: a superseded page points at its replacement. */
const supersededNeedsLink: Rule = (i) => {
  if (i.kind !== 'wiki' || str(i.split.front, 'status') !== 'superseded') return [];
  const field = str(i.split.front, 'superseded_by');
  if (/\[\[[^\]]+\]\]|https?:\/\/\S+/.test(field)) return [];
  if (wikiLinks(i.split.body).length) return [];
  return [finding(i.note.path, 'superseded-needs-link', 'error', 'Status is superseded but nothing links to the replacement: set `superseded_by: [[New page]]`.', 1)];
};

/** `source-link-url`: a source's `link:` is a real URL, or absent. */
const sourceLinkUrl: Rule = (i) => {
  const link = str(i.split.front, 'link');
  if (i.kind !== 'wiki' || str(i.split.front, 'type') !== 'source' || !link || /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/.test(link)) return [];
  return [finding(i.note.path, 'source-link-url', 'error', `link: "${link}" is not a URL (http or https). Use the real URL, or delete the line.`, 1)];
};

/** `fact-as-of`: a fact carries the date it was true. */
const factAsOf: Rule = (i) => {
  if (i.kind !== 'wiki' || str(i.split.front, 'type') !== 'fact') return [];
  const asOf = str(i.split.front, 'as_of');
  if (!asOf) return [finding(i.note.path, 'fact-as-of', 'warning', 'A fact needs `as_of: YYYY-MM-DD` (or YYYY-MM).', 1)];
  return validAsOf(asOf) ? [] : [finding(i.note.path, 'fact-as-of', 'warning', `as_of "${asOf}" is not a date (YYYY-MM-DD or YYYY-MM).`, 1)];
};

/** `idea-author`: an idea keeps its author. */
const ideaAuthor: Rule = (i) => i.kind === 'wiki' && str(i.split.front, 'type') === 'idea' && !str(i.split.front, 'author')
  ? [finding(i.note.path, 'idea-author', 'warning', 'An idea needs `author:` so its words stay attributed.', 1)] : [];

/** `project-stray-file`: a project folder's top level holds only `<name>.md` and `tasks.md`. */
const projectStrayFile: Rule = (i) => i.kind === 'project-stray'
  ? [finding(i.note.path, 'project-stray-file', 'error', i.project
    ? `Only ${i.project}.md and tasks.md belong at the top of Projects/${i.project}/: move this into notes/.`
    : 'Projects/ holds only project folders: move this into Projects/<name>/ (as <name>.md or in notes/).')] : [];

/** `project-note-type`: a note in `notes/` is `type: project-note`. */
const projectNoteType: Rule = (i) => {
  const type = str(i.split.front, 'type');
  if (i.kind !== 'project-note' || !type || type === 'project-note') return [];
  return [finding(i.note.path, 'project-note-type', 'error', `Notes in a project's notes/ are \`type: project-note\`, not "${type}".`, 1)];
};

/** `project-note-fields`: a project note names its project and says when it was true. */
const projectNoteFields: Rule = (i) => {
  if (i.kind !== 'project-note') return [];
  const out: Finding[] = [];
  if (!str(i.split.front, 'project')) out.push(finding(i.note.path, 'project-note-fields', 'error', 'Missing `project:` (a link to the project page).', 1));
  const asOf = str(i.split.front, 'as_of');
  if (!asOf) out.push(finding(i.note.path, 'project-note-fields', 'error', 'Missing `as_of: YYYY-MM-DD` (or YYYY-MM).', 1));
  else if (!validAsOf(asOf)) out.push(finding(i.note.path, 'project-note-fields', 'error', `as_of "${asOf}" is not a date (YYYY-MM-DD or YYYY-MM).`, 1));
  return out;
};

/** `goal-fields`: a goal has its project, areas and status; unless `smart: false`, also due, metric and target. */
const goalFields: Rule = (i) => {
  if (i.kind !== 'goal') return [];
  const f = i.split.front;
  const lite = str(f, 'smart') === 'false';
  const out: Finding[] = [];
  const need = lite ? ['project', 'areas', 'status'] : ['project', 'areas', 'status', 'due', 'metric', 'target'];
  for (const key of need) if (!(key === 'areas' ? list(f, key).length : str(f, key))) out.push(finding(i.note.path, 'goal-fields', 'error', `Goal is missing \`${key}\`${lite ? '' : ' (or mark it `smart: false` and say what is missing)'}.`, 1));
  return out;
};

/** `goal-status`: active, done or dropped. */
const goalStatus: Rule = (i) => {
  const status = str(i.split.front, 'status');
  if (i.kind !== 'goal' || !status || GOAL_STATUSES.includes(status)) return [];
  return [finding(i.note.path, 'goal-status', 'error', `Goal status "${status}" is not one of ${GOAL_STATUSES.join(', ')}.`, 1)];
};

/** `goal-due-format`: `due` is a real YYYY-MM-DD date. */
const goalDueFormat: Rule = (i) => {
  const due = str(i.split.front, 'due');
  if (i.kind !== 'goal' || !due || validDate(due)) return [];
  return [finding(i.note.path, 'goal-due-format', 'error', `due "${due}" is not a date (YYYY-MM-DD).`, 1)];
};

/** `goal-area-unknown`: every area is in the vault's list. */
const goalAreaUnknown: Rule = (i, ctx) => {
  if (i.kind !== 'goal') return [];
  return list(i.split.front, 'areas').filter((a) => !ctx.config.areas.includes(normalizeArea(a)))
    .map((a) => finding(i.note.path, 'goal-area-unknown', 'error', `Area "${a}" is not in the vault's areas (${ctx.config.areas.join(', ')}).`, 1));
};

/** `goal-project-link`: a goal's project is a link. */
const goalProjectLink: Rule = (i) => {
  const project = str(i.split.front, 'project');
  if (i.kind !== 'goal' || !project || /\[\[[^\]]+\]\]/.test(project)) return [];
  return [finding(i.note.path, 'goal-project-link', 'warning', `project "${project}" should be a link: [[Projects/name/name]].`, 1)];
};

/** `daily-name`: a daily note is `YYYY-MM-DD.md`. */
const dailyName: Rule = (i) => {
  if (i.kind !== 'daily') return [];
  const name = i.note.path.split('/').pop()!;
  return i.note.path.split('/').length === 2 && validDate(name.replace(/\.md$/, '')) && name.endsWith('.md') ? []
    : [finding(i.note.path, 'daily-name', 'error', 'Files in Daily/ are named YYYY-MM-DD.md.')];
};

const TASK = /^\s*[-*+]\s+\[.\]\s+(.*)$/;
const ID = /🆔\s*([^\s]+)/u;

/** `task-id-missing`: every task has a 🆔, except in Daily/, where a task is a link back to a project task (which holds the id). */
const taskIdMissing: Rule = (i) => {
  const out: Finding[] = [];
  if (i.kind === 'daily') return out;
  i.note.text.split('\n').forEach((line, n) => {
    if (i.code[n]) return;
    const m = TASK.exec(line);
    if (m && !ID.test(m[1])) out.push(finding(i.note.path, 'task-id-missing', 'error', 'Task has no 🆔 id.', n + 1));
  });
  return out;
};

/** `changelog-format`: `## Changelog` is the last section and has `- YYYY-MM-DD — text` lines, newest first. A page without one is fine. */
const changelogFormat: Rule = (i) => {
  if (i.kind !== 'wiki') return [];
  const lines = i.note.text.split('\n');
  const heading = lines.findIndex((l, n) => !i.code[n] && /^#{1,6}\s+changelog\s*$/i.test(l));
  if (heading < 0) return [];
  const out: Finding[] = [];
  const path = i.note.path;
  if (lines[heading].trim() !== '## Changelog') out.push(finding(path, 'changelog-format', 'warning', 'The heading is exactly `## Changelog`.', heading + 1));
  let last = '';
  for (let n = heading + 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line.trim()) continue;
    if (/^#{1,6}\s/.test(line)) { out.push(finding(path, 'changelog-format', 'warning', 'Nothing comes after the changelog: move this section above it.', n + 1)); break; }
    const m = /^- (\d{4}-\d{2}-\d{2}) — \S.*$/.exec(line);
    if (!m || !validDate(m[1])) { out.push(finding(path, 'changelog-format', 'warning', 'Changelog entries look like `- YYYY-MM-DD — what changed and why`.', n + 1)); continue; }
    if (last && m[1] > last) out.push(finding(path, 'changelog-format', 'warning', 'Changelog entries go newest first.', n + 1));
    last = m[1];
  }
  return out;
};

/** `hard-wrap`: prose lines are not broken by hand; one line per paragraph. A heuristic. */
const hardWrap: Rule = (i) => {
  const lines = i.note.text.split('\n');
  const start = i.split.front ? i.split.bodyLine - 1 : 0;
  const prose = (n: number): boolean => {
    const l = lines[n];
    return n >= start && !i.code[n] && !!l?.trim() && !/^\s*(#|>|\||[-*+]\s|\d+[.)]\s|<|!\[\[|---|===|\$\$|\[[^\]]*\]:)/.test(l);
  };
  const out: Finding[] = [];
  let reported = -2;
  for (let n = 0; n < lines.length - 1; n++) {
    if (!prose(n) || !prose(n + 1)) continue;
    const a = lines[n].trimEnd();
    const wrapped = a.length >= 45 && !/[.!?:;)\]"”'`*_]$/.test(a) && /^\s*[a-z(]/.test(lines[n + 1]);
    if (wrapped && n !== reported + 1) out.push(finding(i.note.path, 'hard-wrap', 'warning', 'Prose seems hard-wrapped: write each paragraph on one line.', n + 1));
    if (wrapped) reported = n;
  }
  return out;
};

const NOTE_RULES: Rule[] = [
  frontmatterClosed, typeMissing, wikiTypeUnknown, wikiFlat, wikiStatus, supersededNeedsLink, sourceLinkUrl, factAsOf, ideaAuthor,
  projectStrayFile, projectNoteType, projectNoteFields, goalFields, goalStatus, goalDueFormat, goalAreaUnknown, goalProjectLink,
  dailyName, taskIdMissing, changelogFormat, hardWrap,
];

// ---- vault rules -------------------------------------------------------------------------------

const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|bmp|pdf|mp3|mp4|m4a|wav|webm|mov|ogg|canvas|base|csv|zip)$/i;

/** The page a link names: by path (with or without `.md`), by title, or by alias; undefined when none. */
function resolve(target: string, ctx: Ctx): boolean {
  const t = target.replace(/^\/+/, '');
  if (ASSET.test(t)) return true;
  const key = t.replace(/\.md$/i, '');
  if (key.includes('/')) return ctx.paths.has(`${key}.md`.toLowerCase());
  return ctx.titles.has(key.toLowerCase());
}

/** `link-unresolved`: every `[[link]]` names an existing page; a concept with no page is plain text. */
const linkUnresolved = (ctx: Ctx): Finding[] => {
  const out: Finding[] = [];
  for (const i of ctx.infos) {
    for (const l of wikiLinks(i.note.text)) {
      if (!resolve(l.target, ctx)) out.push(finding(i.note.path, 'link-unresolved', 'error', `${l.raw} does not resolve to a page: write the page, or leave it as plain text.`, l.line));
    }
  }
  return out;
};

/** `task-id-duplicate`: a 🆔 is unique in the whole vault; Daily/ is skipped, its tasks are references to project tasks. */
const taskIdDuplicate = (ctx: Ctx): Finding[] => {
  const seen = new Map<string, string>();
  const out: Finding[] = [];
  for (const i of ctx.infos) {
    if (i.kind === 'daily') continue;
    i.note.text.split('\n').forEach((line, n) => {
      if (i.code[n]) return;
      const m = TASK.exec(line);
      const id = m && ID.exec(m[1])?.[1];
      if (!id) return;
      const first = seen.get(id);
      if (first) out.push(finding(i.note.path, 'task-id-duplicate', 'error', `🆔 ${id} is already used at ${first}.`, n + 1));
      else seen.set(id, `${i.note.path}:${n + 1}`);
    });
  }
  return out;
};

/** `wiki-home-hubs`: the `Wiki` home page links only to hubs. */
const wikiHomeHubs = (ctx: Ctx): Finding[] => {
  const home = ctx.paths.get('wiki/wiki.md');
  if (!home) return [];
  const out: Finding[] = [];
  for (const l of wikiLinks(home.note.text)) {
    const key = l.target.replace(/\.md$/i, '').toLowerCase();
    const to = key.includes('/') ? ctx.paths.get(`${key}.md`) : ctx.titles.get(key)?.[0];
    if (to && str(to.split.front, 'type') !== 'hub') out.push(finding(home.note.path, 'wiki-home-hubs', 'warning', `${l.raw} is not a hub: the home page links only to hubs.`, l.line));
  }
  return out;
};

// ---- entry point -------------------------------------------------------------------------------

/** Lint a whole vault. `config.areas` defaults to the six life areas. Findings are sorted by path and line. */
export function lint(notes: Note[], config: Partial<Config> = {}): Finding[] {
  const cfg: Config = { areas: (config.areas ?? DEFAULT_AREAS).map(normalizeArea) };
  const infos: Info[] = notes
    .filter((n) => /\.md$/i.test(n.path) && !SKIPPED.test(n.path) && !INSTRUCTIONS.test(n.path))
    .map((note) => {
      const text = note.text.replace(/\r\n?/g, '\n');
      const n = { ...note, text };
      return { note: n, ...classify(n.path), split: splitFront(text), code: codeLines(text) };
    });
  const titles = new Map<string, Info[]>();
  const paths = new Map<string, Info>();
  const add = (key: string, i: Info) => titles.set(key.toLowerCase(), [...(titles.get(key.toLowerCase()) ?? []), i]);
  for (const i of infos) {
    paths.set(i.note.path.toLowerCase(), i);
    add(titleOf(i.note.path), i);
    for (const alias of list(i.split.front, 'aliases')) add(alias, i);
  }
  // notes the linter skips still count as link targets
  for (const n of notes) if (/\.md$/i.test(n.path) && (SKIPPED.test(n.path) || INSTRUCTIONS.test(n.path))) {
    const stub = { note: n, kind: 'other' as Kind, split: splitFront(n.text), code: [] };
    paths.set(n.path.toLowerCase(), stub);
    add(titleOf(n.path), stub);
  }
  const ctx: Ctx = { config: cfg, infos, titles, paths };
  const findings = [
    ...infos.flatMap((i) => NOTE_RULES.flatMap((rule) => rule(i, ctx))),
    ...linkUnresolved(ctx), ...taskIdDuplicate(ctx), ...wikiHomeHubs(ctx),
  ];
  return findings.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
}

/** Every rule name the linter can report. */
export const RULES = [
  'frontmatter-closed', 'type-missing', 'wiki-type-unknown', 'wiki-flat', 'wiki-status', 'superseded-needs-link', 'source-link-url',
  'fact-as-of', 'idea-author', 'project-stray-file', 'project-note-type', 'project-note-fields', 'goal-fields', 'goal-status',
  'goal-due-format', 'goal-area-unknown', 'goal-project-link', 'daily-name', 'task-id-missing', 'task-id-duplicate',
  'link-unresolved', 'changelog-format', 'hard-wrap', 'wiki-home-hubs',
] as const;

/** Counts for a findings list. */
export const count = (findings: Finding[]) => ({
  errors: findings.filter((f) => f.severity === 'error').length,
  warnings: findings.filter((f) => f.severity === 'warning').length,
});
