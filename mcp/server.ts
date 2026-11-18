// stdio entry: `node mcp/dist/server.js`. The host starts it with cwd = the plugin folder, and sets
// ZEN_PLUGIN_FILES (the vault it may read and write) and ZEN_PLUGIN_DATA (a folder for its own data).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './app.ts';

await createServer().connect(new StdioServerTransport());
