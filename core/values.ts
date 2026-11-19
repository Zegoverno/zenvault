// The values the method allows for note properties, as data: `method/values.json`. The linter takes
// its lists from here, and `zenvault_values` serves the same data (plus the vault's areas) so a
// filter can label and order them. One file, so the method, the linter and the app cannot disagree.
import data from '../method/values.json';
import type { Config } from './config.ts';

export interface ValueEntry { value: string; label: string; description?: string }
export interface Property {
  /** The front matter key. */
  key: string;
  /** What kind of note it applies to: wiki, project-note, goal or project. */
  scope: string;
  label: string;
  /** Vault-relative patterns of the notes it applies to; `*` is one path segment. */
  paths: string[];
  /** The key holds a list (`areas`), not one value. */
  multiple?: boolean;
  /** Where the values come from, when not the method itself. */
  source?: string;
  /** Display order. */
  values: ValueEntry[];
}
export interface Values { schema: number; properties: Property[] }

export const VALUES: Values = { schema: data.schema, properties: data.properties };

/** The allowed values of `key` for notes of `scope`, in order. */
export function allowed(scope: string, key: string): string[] {
  return VALUES.properties.find((p) => p.scope === scope && p.key === key)?.values.map((v) => v.value) ?? [];
}

const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The method's values plus the vault's own life areas (`areas` in zenvault.json) as a multi-valued property of goals. */
export function valuesFor(config: Config): Values {
  const areas: Property = {
    key: 'areas', scope: 'goal', label: 'Areas', paths: ['Goals/*.md'], multiple: true, source: 'zenvault.json',
    values: config.areas.map((a) => ({ value: a, label: title(a) })),
  };
  return { schema: VALUES.schema, properties: [...VALUES.properties, areas] };
}
