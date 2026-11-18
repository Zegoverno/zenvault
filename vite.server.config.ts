// The MCP server: mcp/server.ts to one self-contained file, mcp/dist/server.js. Every dependency is
// bundled (the installed plugin has no node_modules); only node's own modules stay imports.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  ssr: { noExternal: true },
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'mcp/dist',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: false,
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es', inlineDynamicImports: true } },
  },
});
