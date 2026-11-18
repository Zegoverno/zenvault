// The templates and the method, bundled into the server at build time (the installed plugin is one file).
const found = import.meta.glob('../templates/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Template text by name (`daily`, `goal`, `wiki-home`...). */
export const TEMPLATES: Record<string, string> = Object.fromEntries(
  Object.entries(found).map(([p, text]) => [p.replace(/^.*\//, '').replace(/\.md$/, ''), text]),
);

export { default as METHOD } from '../method/AGENTS.md?raw';
