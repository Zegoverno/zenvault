import { describe, expect, it } from 'vitest';
import { checkName, fill, plan, render, today } from './templates.ts';
import { DEFAULT_AREAS, defaultConfigText, normalizeArea, parseConfig } from './config.ts';
import { codeLines, splitFront, wikiLinks } from './text.ts';

const now = new Date(2031, 2, 9);

describe('render', () => {
  it('fills title, project and dates', () => {
    expect(render('# {{title}} {{date:YYYY-MM-DD}} {{date}} {{date:DD/MM/YY}} {{project}}', { title: 'T', project: 'p', now })).toBe('# T 2031-03-09 2031-03-09 09/03/31 p');
    expect(today(now)).toBe('2031-03-09');
  });
  it('does not expand placeholders inside a title', () => {
    expect(render('{{title}}', { title: '{{project}}', project: 'p', now })).toBe('{{project}}');
  });
  it('leaves no project link on a goal without a project', () => {
    expect(fill('project: "[[Projects/{{project}}/{{project}}]]"\n', { title: 'G' }, now)).toBe('project: \n');
    expect(fill('project: "[[Projects/{{project}}/{{project}}]]"\n', { title: 'G', project: 'demo' }, now)).toBe('project: "[[Projects/demo/demo]]"\n');
  });
});

describe('plan', () => {
  it('puts each kind where the method says', () => {
    expect(plan('daily', undefined, undefined, now).files[0].path).toBe('Daily/2031-03-09.md');
    expect(plan('goal', 'Run', undefined).files[0].path).toBe('Goals/Run.md');
    expect(plan('project', 'demo', undefined).files.map((f) => f.path)).toEqual(['Projects/demo/demo.md', 'Projects/demo/tasks.md']);
    expect(plan('project-note', 'Plan', 'demo').files[0].path).toBe('Projects/demo/notes/Plan.md');
    expect(plan('tasks', undefined, 'demo').files[0].path).toBe('Projects/demo/tasks.md');
    expect(plan('primitive', "Bayes' theorem", undefined).files[0]).toEqual({ path: "wiki/Bayes' theorem.md", template: 'primitive' });
    expect(plan('wiki-home', undefined, undefined).files[0].path).toBe('wiki/Wiki.md');
  });
  it('needs what it needs', () => {
    expect(() => plan('project-note', 'x', undefined)).toThrow(/project/);
    expect(() => plan('fact', undefined, undefined)).toThrow(/title/);
    expect(() => plan('daily', 'monday', undefined)).toThrow(/YYYY-MM-DD/);
  });
  it('refuses titles that are not file names', () => {
    for (const bad of ['', '  ', '../x', 'a/b', '.hidden', 'a\\b', 'x'.repeat(121), 'a:b', 'a[b]', 'a#b']) expect(() => checkName(bad), bad).toThrow();
    expect(() => plan('fact', '../../etc/x', undefined)).toThrow();
    expect(() => plan('project-note', 'x', '../other')).toThrow();
  });
});

describe('config', () => {
  it('defaults to six areas', () => {
    expect(parseConfig(null).config.areas).toEqual(DEFAULT_AREAS);
    expect(DEFAULT_AREAS).toHaveLength(6);
    expect(parseConfig(defaultConfigText()).config.areas).toEqual(DEFAULT_AREAS);
  });
  it('reads a custom list and normalizes names', () => {
    expect(parseConfig('{"areas":["#area/Craft","family","family"]}').config.areas).toEqual(['craft', 'family']);
    expect(normalizeArea(' #area/Health ')).toBe('health');
  });
  it('falls back, with a message, on bad input', () => {
    for (const bad of ['nope', '{"areas":[]}', '{"areas":"health"}', '{"areas":[1]}']) {
      const r = parseConfig(bad);
      expect(r.config.areas).toEqual(DEFAULT_AREAS);
      expect(r.error).toBeTruthy();
    }
    expect(parseConfig('{}').error).toBeUndefined();
  });
});

describe('text helpers', () => {
  it('parses a flat front matter', () => {
    const s = splitFront('---\n# note\ntitle: "A: b"\ntags: [x, "y z"]\nareas:\n  - love\n  - wealth\nempty:\nlink: https://e.com/a\n---\nBody\n');
    expect(s.front?.data).toEqual({ title: 'A: b', tags: ['x', 'y z'], areas: ['love', 'wealth'], empty: '', link: 'https://e.com/a' });
    expect(s.body).toBe('Body\n');
    expect(s.bodyLine).toBe(11);
    expect(splitFront('# no front\n').front).toBeNull();
    expect(splitFront('---\nopen\n').broken).toBe(true);
  });
  it('finds fenced code and links outside it', () => {
    expect(codeLines('a\n```\nb\n```\nc')).toEqual([false, true, true, true, false]);
    expect(wikiLinks('[[A|x]] and `[[B]]`\n```\n[[C]]\n```\n[[D#h]]').map((l) => [l.target, l.line])).toEqual([['A', 1], ['D', 5]]);
  });
});
