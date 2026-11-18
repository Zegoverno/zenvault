import { describe, expect, it } from 'vitest';
import { RULES, count, lint } from './lint.ts';
import type { Finding, Note } from './lint.ts';

const n = (path: string, text: string): Note => ({ path, text });
const rules = (notes: Note[], config = {}) => lint(notes, config).map((f) => f.rule);
const only = (notes: Note[], rule: string, config = {}): Finding[] => lint(notes, config).filter((f) => f.rule === rule);

const goal = (extra = '') => n('Goals/Run a race.md', `---\nproject: "[[Projects/demo/demo]]"\nareas: [health]\nstatus: active\ndue: 2030-05-01\nmetric: minutes\ntarget: 50\n${extra}---\n# Run a race\n`);
const demo = [n('Projects/demo/demo.md', '# demo\n'), n('Projects/demo/tasks.md', '# tasks\n')];

describe('a clean vault', () => {
  it('has no findings', () => {
    const notes = [
      ...demo, goal(),
      n('Projects/demo/notes/plan.md', '---\ntype: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: 2030-01-02\n---\nA plan.\n'),
      n('Daily/2030-01-02.md', '# 2030-01-02\n\n- [ ] Write the plan 🆔 d1\n'),
      n('wiki/Wiki.md', '---\ntype: hub\n---\nSee [[Maths]].\n'),
      n('wiki/Maths.md', '---\ntype: hub\n---\n# Maths\n\n## Changelog\n- 2030-01-02 — Created.\n'),
      n('wiki/Bayes.md', '---\ntype: primitive\naliases: [Bayes rule]\n---\nUses [[Maths]] and [[Bayes rule]] and [[Goals/Run a race]] and [[Projects/demo/demo]].\n'),
    ];
    expect(lint(notes)).toEqual([]);
  });
  it('skips Templates, skills and the instruction files', () => {
    expect(lint([n('Templates/goal.md', '- [ ] no id [[Nowhere]]'), n('skills/x/SKILL.md', '- [ ] x'), n('AGENTS.md', '[[Nowhere]] - [ ] x')])).toEqual([]);
  });
  it('lists every rule it can report', () => {
    expect(new Set(RULES).size).toBe(RULES.length);
  });
});

describe('wiki pages', () => {
  it('type-missing: no front matter, or no type', () => {
    expect(only([n('wiki/A.md', '# A\n')], 'type-missing')).toHaveLength(1);
    expect(only([n('wiki/A.md', '---\naliases: [x]\n---\n# A\n')], 'type-missing')).toHaveLength(1);
    expect(only([n('wiki/A.md', '---\ntype: fact\nas_of: 2030-01-01\n---\n')], 'type-missing')).toHaveLength(0);
  });
  it('wiki-type-unknown', () => {
    const f = only([n('wiki/A.md', '---\ntype: essay\n---\n')], 'wiki-type-unknown');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', path: 'wiki/A.md' });
    for (const t of ['primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea']) expect(only([n('wiki/A.md', `---\ntype: ${t}\n---\n`)], 'wiki-type-unknown')).toHaveLength(0);
  });
  it('frontmatter-closed', () => {
    expect(rules([n('wiki/A.md', '---\ntype: hub\n# A\n')])).toContain('frontmatter-closed');
  });
  it('wiki-flat: pages sit directly in wiki/', () => {
    expect(rules([n('wiki/sub/A.md', '---\ntype: hub\n---\n')])).toContain('wiki-flat');
  });
  it('wiki-status and superseded-needs-link', () => {
    expect(rules([n('wiki/A.md', '---\ntype: decision\nstatus: old\n---\n')])).toContain('wiki-status');
    expect(rules([n('wiki/A.md', '---\ntype: decision\nstatus: superseded\n---\nNothing here.\n')])).toContain('superseded-needs-link');
    const ok = [n('wiki/B.md', '---\ntype: decision\n---\n'), n('wiki/A.md', '---\ntype: decision\nstatus: superseded\nsuperseded_by: "[[B]]"\n---\n')];
    expect(rules(ok)).toEqual([]);
    const inBody = [n('wiki/B.md', '---\ntype: decision\n---\n'), n('wiki/A.md', '---\ntype: decision\nstatus: superseded\n---\nReplaced by [[B]].\n')];
    expect(rules(inBody)).toEqual([]);
  });
  it('source-link-url: a URL or nothing', () => {
    expect(only([n('wiki/S.md', '---\ntype: source\nlink: some-file.pdf\n---\n')], 'source-link-url')).toHaveLength(1);
    expect(only([n('wiki/S.md', '---\ntype: source\nlink: https://example.com/a?b=1\n---\n')], 'source-link-url')).toHaveLength(0);
    expect(only([n('wiki/S.md', '---\ntype: source\nlink: \n---\n')], 'source-link-url')).toHaveLength(0);
    expect(only([n('wiki/S.md', '---\ntype: source\n---\n')], 'source-link-url')).toHaveLength(0);
  });
  it('fact-as-of and idea-author warn', () => {
    expect(only([n('wiki/F.md', '---\ntype: fact\n---\n')], 'fact-as-of')[0].severity).toBe('warning');
    expect(only([n('wiki/F.md', '---\ntype: fact\nas_of: 2030-02-31\n---\n')], 'fact-as-of')).toHaveLength(1);
    expect(only([n('wiki/F.md', '---\ntype: fact\nas_of: 2030-02\n---\n')], 'fact-as-of')).toHaveLength(0);
    expect(only([n('wiki/F.md', '---\ntype: fact\nas_of: 2030-13\n---\n')], 'fact-as-of')).toHaveLength(1);
    expect(only([n('wiki/I.md', '---\ntype: idea\n---\n')], 'idea-author')[0].severity).toBe('warning');
  });
});

describe('projects', () => {
  it('project-stray-file: only <name>.md and tasks.md at the top', () => {
    const f = only([...demo, n('Projects/demo/design.md', '# d\n'), n('Projects/loose.md', '# l\n')], 'project-stray-file');
    expect(f.map((x) => x.path)).toEqual(['Projects/demo/design.md', 'Projects/loose.md']);
  });
  it('project-note: type, project and as_of', () => {
    const base = (front: string) => [...demo, n('Projects/demo/notes/a.md', `---\n${front}---\nx\n`)];
    expect(rules(base(''))).toContain('type-missing');
    expect(rules(base('type: note\nproject: "[[Projects/demo/demo]]"\nas_of: 2030-01-01\n'))).toContain('project-note-type');
    const missing = only(base('type: project-note\n'), 'project-note-fields');
    expect(missing.map((x) => x.message).join(' ')).toMatch(/project[\s\S]*as_of/);
    expect(only(base('type: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: soon\n'), 'project-note-fields')).toHaveLength(1);
    expect(only(base('type: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: 2030-01-01\n'), 'project-note-fields')).toHaveLength(0);
    expect(only(base('type: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: 2026-08\n'), 'project-note-fields')).toHaveLength(0);
    expect(only(base('type: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: 2026-13\n'), 'project-note-fields')).toHaveLength(1);
    expect(only(base('type: project-note\nproject: "[[Projects/demo/demo]]"\nas_of: Aug\n'), 'project-note-fields')).toHaveLength(1);
  });
});

describe('goals', () => {
  it('goal-fields: required fields, and smart: false relaxes due, metric and target', () => {
    expect(only([...demo, n('Goals/G.md', '---\nstatus: active\n---\n')], 'goal-fields').map((f) => f.message).join('|')).toMatch(/project.*areas.*due.*metric.*target/);
    expect(rules([...demo, n('Goals/G.md', '---\nproject: "[[Projects/demo/demo]]"\nareas: [love]\nstatus: active\nsmart: false\n---\nMissing: a metric.\n')])).toEqual([]);
    expect(only([...demo, n('Goals/G.md', '---\nstatus: active\nsmart: false\n---\n')], 'goal-fields')).toHaveLength(2);
  });
  it('goal-status and goal-due-format', () => {
    expect(rules([...demo, n('Goals/G.md', goal().text.replace('status: active', 'status: maybe'))])).toContain('goal-status');
    expect(rules([...demo, n('Goals/G.md', goal().text.replace('2030-05-01', '1 May 2030'))])).toContain('goal-due-format');
    expect(rules([...demo, n('Goals/G.md', goal().text.replace('2030-05-01', '2030-13-01'))])).toContain('goal-due-format');
    expect(rules([...demo, n('Goals/G.md', '---\nproject: "[[Projects/demo/demo]]"\nareas: [love]\nstatus: soon\nsmart: false\n---\n')])).toContain('goal-status');
  });
  it('goal-area-unknown follows the configured list; #area/ and block lists are understood', () => {
    const g = (areas: string) => [...demo, n('Goals/G.md', goal().text.replace('areas: [health]', areas))];
    expect(rules(g('areas: [fitness]'))).toContain('goal-area-unknown');
    expect(rules(g('areas: [#area/health, wealth]'))).toEqual([]);
    expect(rules(g('areas:\n  - love\n  - "#area/meaning"'))).toEqual([]);
    expect(rules(g('areas: [fitness]'), { areas: ['fitness'] })).toEqual([]);
    expect(rules(g('areas: [health]'), { areas: ['fitness'] })).toContain('goal-area-unknown');
  });
  it('goal-project-link asks for a link', () => {
    expect(rules([...demo, n('Goals/G.md', goal().text.replace('"[[Projects/demo/demo]]"', 'demo'))])).toContain('goal-project-link');
  });
});

describe('daily and tasks', () => {
  it('daily-name', () => {
    expect(rules([n('Daily/monday.md', '# x\n')])).toContain('daily-name');
    expect(rules([n('Daily/2030-02-30.md', '# x\n')])).toContain('daily-name');
    expect(rules([n('Daily/2030-02-03.md', '# x\n')])).toEqual([]);
  });
  it('task-id-missing, with a line number; code blocks and non-tasks are ignored', () => {
    const f = only([n('Projects/demo/tasks.md', '# t\n\n- [ ] one 🆔 a1\n- [ ] two\n  - [x] three ✅ 2030-01-01\n```\n- [ ] sample\n```\n- not a task\n')], 'task-id-missing');
    expect(f.map((x) => x.line)).toEqual([4, 5]);
  });
  it('task-id-duplicate across the vault', () => {
    const f = only([n('Projects/demo/tasks.md', '- [ ] a 🆔 x1\n'), n('Projects/other/tasks.md', '- [ ] b 🆔 x1\n- [ ] c 🆔 x2\n')], 'task-id-duplicate');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ path: 'Projects/other/tasks.md', line: 1 });
    expect(f[0].message).toContain('Projects/demo/tasks.md:1');
  });
  it('Daily tasks are references: no id needed, and a shared project id is not a duplicate', () => {
    const daily = n('Daily/2030-01-01.md', '- [ ] Book the physio — [[Projects/demo/tasks|demo]]\n- [ ] Call 🆔 x1\n');
    const project = n('Projects/demo/tasks.md', '- [ ] Book the physio 🆔 x1\n- [ ] Call 🆔 x2\n');
    expect(only([daily], 'task-id-missing')).toHaveLength(0);
    expect(only([project, daily], 'task-id-duplicate')).toHaveLength(0);
    expect(only([n('Projects/demo/tasks.md', '- [ ] no id\n')], 'task-id-missing')).toHaveLength(1);
    expect(only([n('Projects/demo/tasks.md', '- [ ] a 🆔 x1\n- [ ] b 🆔 x1\n')], 'task-id-duplicate')).toHaveLength(1);
  });
});

describe('links', () => {
  const page = (title: string, extra = '') => n(`wiki/${title}.md`, `---\ntype: hub\n${extra}---\n`);
  it('link-unresolved reports a dead link with its line', () => {
    const f = only([page('A'), n('wiki/B.md', '---\ntype: hub\n---\nText\nSee [[Ghost]] now.\n')], 'link-unresolved');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ path: 'wiki/B.md', line: 5, severity: 'error' });
  });
  it('resolves by title, alias, path, heading, alias text and case', () => {
    const ok = n('wiki/C.md', '---\ntype: hub\n---\n[[A]] [[a#Heading]] [[A|shown]] [[Other name]] [[wiki/A]] [[wiki/A.md]] [[Goals/Run a race]] ![[photo.png]]\n');
    expect(only([page('A'), page('D', 'aliases: [Other name]\n'), goal(), ...demo, ok], 'link-unresolved')).toEqual([]);
  });
  it('ignores links in code blocks and code spans', () => {
    expect(only([n('wiki/E.md', '---\ntype: hub\n---\n```\n[[Nope]]\n```\nand `[[Nope]]` too\n')], 'link-unresolved')).toEqual([]);
  });
  it('checks links in the front matter too', () => {
    expect(only([n('Goals/G.md', goal().text.replace('[[Projects/demo/demo]]', '[[Projects/gone/gone]]'))], 'link-unresolved')).toHaveLength(1);
  });
  it('wiki-home-hubs: the home page links only to hubs', () => {
    const notes = [n('wiki/Wiki.md', '---\ntype: hub\n---\n[[Maths]] and [[Bayes]]\n'), page('Maths'), n('wiki/Bayes.md', '---\ntype: primitive\n---\n')];
    const f = only(notes, 'wiki-home-hubs');
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('[[Bayes]]');
  });
});

describe('changelog and wrapping', () => {
  const wiki = (body: string) => n('wiki/A.md', `---\ntype: hub\n---\n${body}`);
  it('a page with no changelog is fine; a good one passes', () => {
    expect(only([wiki('Text.\n')], 'changelog-format')).toEqual([]);
    expect(only([wiki('Text.\n\n## Changelog\n- 2030-02-01 — Second, why.\n- 2030-01-01 — Created.\n')], 'changelog-format')).toEqual([]);
  });
  it('flags a bad heading, a later section, malformed and unordered entries (warnings)', () => {
    expect(only([wiki('# T\n### Changelog\n- 2030-01-01 — x\n')], 'changelog-format')).toHaveLength(1);
    expect(only([wiki('## Changelog\n- 2030-01-01 — x\n\n## After\n')], 'changelog-format')).toHaveLength(1);
    expect(only([wiki('## Changelog\n- yesterday — x\n- 2030-01-01 - hyphen\n')], 'changelog-format')).toHaveLength(2);
    const order = only([wiki('## Changelog\n- 2030-01-01 — old\n- 2030-02-01 — new\n')], 'changelog-format');
    expect(order).toHaveLength(1);
    expect(order[0].severity).toBe('warning');
  });
  it('hard-wrap: a paragraph broken mid-sentence is reported once', () => {
    const wrapped = 'This is a long line of prose that has been broken by hand in the middle of\nthe sentence and continues here on the next line without any end mark in\nbetween the lines.\n';
    const f = only([wiki(wrapped)], 'hard-wrap');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', line: 4 });
  });
  it('hard-wrap leaves normal prose, lists, tables, code and quotes alone', () => {
    const body = 'One sentence ends here.\nAnother paragraph line, still a whole line of text that ends with a full stop.\n\n- a list item that is long enough to be a line of prose without an end mark here\n- the next item\n\n| a | b |\n|---|---|\n\n```\nthis long line in a code block is not prose and has no end mark at all here\nanother such line in the code block with lowercase start\n```\n\n> a quote line that is long enough to be a line of prose without an end mark here\n> continues\n';
    expect(only([wiki(body)], 'hard-wrap')).toEqual([]);
  });
});

describe('output', () => {
  it('is sorted by path then line, and counted', () => {
    const f = lint([n('wiki/B.md', '# B\n'), n('wiki/A.md', '---\ntype: fact\n---\n')]);
    expect(f.map((x) => x.path)).toEqual(['wiki/A.md', 'wiki/B.md']);
    expect(count(f)).toEqual({ errors: 1, warnings: 1 });
  });
  it('handles Windows line endings', () => {
    expect(lint([n('wiki/A.md', '---\r\ntype: hub\r\n---\r\n# A\r\n')])).toEqual([]);
  });
});
