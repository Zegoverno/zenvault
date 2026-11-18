// The plugin's version: package.json's, put in at build time (vite `define`), so the server and the
// release cannot disagree. Unbuilt (tests, dev) it is a placeholder.
declare const __VERSION__: string | undefined;
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
