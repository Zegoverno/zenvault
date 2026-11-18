// Small Markdown helpers: front matter (a flat YAML subset), code regions, headings, links.

export type Value = string | string[];
export interface Front { /** the parsed keys */ data: Record<string, Value>; /** lines the block takes, delimiters included */ lines: number }
export interface Split { front: Front | null; /** `---` was opened and never closed */ broken: boolean; body: string; /** 1-based line where the body starts */ bodyLine: number }

const unquote = (s: string): string => {
  const t = s.trim();
  return t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'")) ? t.slice(1, -1) : t;
};

function inlineList(s: string): string[] {
  const out: string[] = [];
  let cur = '', quote = '', depth = 0;
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth <= 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

/** Front matter: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. `#` lines are comments. */
export function splitFront(text: string): Split {
  const src = text.replace(/^﻿/, '');
  const lines = src.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { front: null, broken: false, body: src, bodyLine: 1 };
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end < 0) return { front: null, broken: true, body: src, bodyLine: 1 };
  const data: Record<string, Value> = {};
  let open: string | null = null; // a `key:` with no value yet: `- item` lines make it a list
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && open) {
      const cur = data[open];
      if (Array.isArray(cur)) cur.push(unquote(item[1]));
      else data[open] = [unquote(item[1])];
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) { open = null; continue; }
    const value = kv[2].trim();
    open = value === '' ? kv[1] : null;
    data[kv[1]] = value.startsWith('[') && value.endsWith(']') ? inlineList(value.slice(1, -1)) : unquote(value);
  }
  return { front: { data, lines: end + 1 }, broken: false, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2 };
}

/** A key's text value ('' when absent or a list). */
export const str = (front: Front | null, key: string): string => { const v = front?.data[key]; return typeof v === 'string' ? v.trim() : ''; };
/** A key's values as a list ([] when absent). */
export const list = (front: Front | null, key: string): string[] => { const v = front?.data[key]; return Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v.trim()] : []; };

/** For each line of `text`, whether it sits in a fenced code block (fence lines included). */
export function codeLines(text: string): boolean[] {
  const out: boolean[] = [];
  let fence = '';
  for (const line of text.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(true);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = '';
    } else if (m) { fence = m[1]; out.push(true); } else out.push(false);
  }
  return out;
}

/** `line` with inline code spans blanked out. */
export const withoutSpans = (line: string): string => line.replace(/(`+)[^`]*?\1/g, (s) => ' '.repeat(s.length));

export interface Link { target: string; line: number; raw: string }
/** Every `[[wiki link]]` and `![[embed]]` outside code, with its target stripped of alias, heading and block. */
export function wikiLinks(text: string): Link[] {
  const code = codeLines(text);
  const out: Link[] = [];
  text.split('\n').forEach((line, i) => {
    if (code[i]) return;
    for (const m of withoutSpans(line).matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
      const target = m[1].split('|')[0].split('#')[0].split('^')[0].trim();
      if (target) out.push({ target, line: i + 1, raw: m[0] });
    }
  });
  return out;
}

/** The note's name without folders and `.md`. */
export const titleOf = (path: string): string => path.split('/').pop()!.replace(/\.md$/i, '');
