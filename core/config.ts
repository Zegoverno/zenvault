// The vault's settings: `zenvault.json` at the vault root. For now only the list of life areas.
export const DEFAULT_AREAS = ['health', 'love', 'meaning', 'leadership', 'business', 'wealth'];
export const CONFIG_FILE = 'zenvault.json';

export interface Config { areas: string[] }

/** `#area/health`, `area/health` and `Health` all mean `health`. */
export const normalizeArea = (value: string): string => value.trim().replace(/^#/, '').replace(/^area\//i, '').toLowerCase();

/** The settings in `text`, defaults where a key is missing or invalid; `error` says what was ignored. */
export function parseConfig(text: string | null): { config: Config; error?: string } {
  const config: Config = { areas: [...DEFAULT_AREAS] };
  if (text === null) return { config };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { config, error: `${CONFIG_FILE} is not valid JSON: using the default areas.` }; }
  const areas = (raw as { areas?: unknown } | null)?.areas;
  if (areas === undefined) return { config };
  if (!Array.isArray(areas) || areas.length === 0 || !areas.every((a) => typeof a === 'string' && normalizeArea(a))) {
    return { config, error: `"areas" in ${CONFIG_FILE} must be a non-empty list of names: using the default areas.` };
  }
  config.areas = [...new Set(areas.map((a: string) => normalizeArea(a)))];
  return { config };
}

/** The text of a fresh `zenvault.json`. */
export const defaultConfigText = (): string => JSON.stringify({ areas: DEFAULT_AREAS }, null, 2) + '\n';
