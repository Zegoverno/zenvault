// Templates: the kinds of note `zenvault_new` can create, where each goes, and the placeholders.
//
// Placeholders are Obsidian's: `{{title}}`, `{{date:YYYY-MM-DD}}` (the tokens YYYY, YY, MM, DD) and
// `{{project}}`, which Obsidian leaves as written and `zenvault_new` fills in.

export const KINDS = ['daily', 'goal', 'project', 'project-note', 'tasks', 'primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea', 'wiki-home'] as const;
export type Kind = (typeof KINDS)[number];

const WIKI_KINDS: readonly string[] = ['primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea'];
export const isKind = (k: unknown): k is Kind => typeof k === 'string' && (KINDS as readonly string[]).includes(k);

/** A title or project name that is safe as a file name: no folders, no dot start, no reserved characters. */
export function checkName(name: unknown, what = 'title'): string {
  if (typeof name !== 'string') throw new Error(`The ${what} must be text.`);
  const t = name.trim();
  if (!t) throw new Error(`The ${what} is empty.`);
  if (t.length > 120) throw new Error(`The ${what} is too long (120 characters at most).`);
  if (/[\\/:*?"<>|\0#^[\]]/.test(t) || /[\u0000-\u001f]/.test(t)) throw new Error(`The ${what} may not contain \\ / : * ? " < > | # ^ [ ] or control characters.`);
  if (t.startsWith('.') || t === '..') throw new Error(`The ${what} may not start with a dot.`);
  return t;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const today = (now = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const formatDate = (fmt: string, now: Date): string => fmt
  .replace(/YYYY/g, String(now.getFullYear())).replace(/YY/g, pad(now.getFullYear() % 100))
  .replace(/MM/g, pad(now.getMonth() + 1)).replace(/DD/g, pad(now.getDate()));

/** Fill `{{title}}`, `{{project}}` and `{{date}}` / `{{date:FORMAT}}`. */
export function render(template: string, vars: { title: string; project?: string; now?: Date }): string {
  const now = vars.now ?? new Date();
  return template.replace(/\{\{\s*(title|project|date)(?::([^}]*))?\s*\}\}/g, (_, key: string, fmt?: string) =>
    key === 'title' ? vars.title : key === 'project' ? (vars.project ?? '') : formatDate(fmt?.trim() || 'YYYY-MM-DD', now));
}

export interface Planned { path: string; template: string }

/** Which files `kind` creates for `title` (and `project`): paths relative to the vault, and their template names. */
export function plan(kind: Kind, title: string | undefined, project: string | undefined, now = new Date()): { title: string; project?: string; files: Planned[] } {
  const needsProject = kind === 'project-note' || kind === 'tasks';
  if (needsProject && !project) throw new Error(`A ${kind} needs a project name.`);
  const proj = project === undefined || project === '' ? undefined : checkName(project, 'project name');
  switch (kind) {
    case 'daily': {
      const name = title === undefined || title === '' ? today(now) : checkName(title);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) throw new Error('A daily note is named YYYY-MM-DD.');
      return { title: name, files: [{ path: `Daily/${name}.md`, template: 'daily' }] };
    }
    case 'tasks':
      return { title: proj!, project: proj, files: [{ path: `Projects/${proj}/tasks.md`, template: 'tasks' }] };
    case 'wiki-home':
      return { title: 'Wiki', files: [{ path: 'wiki/Wiki.md', template: 'wiki-home' }] };
    default: {
      if (title === undefined || title === '') throw new Error(`A ${kind} needs a title.`);
      const name = checkName(title);
      if (kind === 'goal') return { title: name, project: proj, files: [{ path: `Goals/${name}.md`, template: 'goal' }] };
      if (kind === 'project') return { title: name, files: [{ path: `Projects/${name}/${name}.md`, template: 'project' }, { path: `Projects/${name}/tasks.md`, template: 'tasks' }] };
      if (kind === 'project-note') return { title: name, project: proj, files: [{ path: `Projects/${proj}/notes/${name}.md`, template: 'project-note' }] };
      if (WIKI_KINDS.includes(kind)) return { title: name, files: [{ path: `wiki/${name}.md`, template: kind }] };
      throw new Error(`Unknown kind "${kind}".`);
    }
  }
}

/** The text for one planned file. A goal without a project gets an empty `project:` (the linter asks for it). */
export function fill(template: string, p: { title: string; project?: string }, now = new Date()): string {
  const base = p.project ? template : template.replace(/"\[\[Projects\/\{\{project\}\}\/\{\{project\}\}\]\]"/g, '');
  return render(base, { ...p, now });
}
