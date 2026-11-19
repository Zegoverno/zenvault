import { describe, expect, it } from 'vitest';
import { DEFAULT_AREAS } from './config.ts';
import { GOAL_STATUSES, PROJECT_STATUSES, WIKI_STATUSES, WIKI_TYPES } from './lint.ts';
import { VALUES, allowed, valuesFor } from './values.ts';

describe('allowed values', () => {
  it('the linter uses them', () => {
    expect(WIKI_TYPES).toEqual(['primitive', 'hub', 'source', 'fact', 'solution', 'decision', 'idea']);
    expect(WIKI_STATUSES).toEqual(['current', 'stale', 'superseded']);
    expect(GOAL_STATUSES).toEqual(['active', 'done', 'dropped']);
    expect(PROJECT_STATUSES).toEqual(['active', 'done', 'dropped']);
    expect(allowed('nothing', 'type')).toEqual([]);
  });
  it('every property has a label and paths, every value a label, and none repeats', () => {
    expect(VALUES.schema).toBe(1);
    const seen = new Set<string>();
    for (const p of VALUES.properties) {
      const id = `${p.scope}/${p.key}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
      expect(p.label && p.paths.length && p.values.length, id).toBeTruthy();
      expect(new Set(p.values.map((v) => v.value)).size).toBe(p.values.length);
      for (const v of p.values) expect(v.value && v.label, `${id} ${v.value}`).toBeTruthy();
    }
  });
  it('valuesFor adds the vault\'s areas, labelled, to the method\'s values', () => {
    const v = valuesFor({ areas: ['health', 'craft'] });
    const areas = v.properties.at(-1)!;
    expect(areas).toMatchObject({ key: 'areas', scope: 'goal', multiple: true, source: 'zenvault.json' });
    expect(areas.values).toEqual([{ value: 'health', label: 'Health' }, { value: 'craft', label: 'Craft' }]);
    expect(v.properties.slice(0, -1)).toEqual(VALUES.properties);
    expect(valuesFor({ areas: DEFAULT_AREAS }).properties.at(-1)!.values).toHaveLength(6);
  });
});
