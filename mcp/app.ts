// The vault's MCP server: tools for an agent, and the one the `/vault` slash command calls.
//
//   zenvault_status      folders, templates, areas and note counts: what is set up and what is missing
//   zenvault_list        the Markdown notes and folders in a folder
//   zenvault_read        a note's Markdown
//   zenvault_lint        check the vault against the method (read-only); optional path to scope the report
//   zenvault_new         create a note from a template (never overwrites)
//   zenvault_initialize  create only the missing folders, templates, AGENTS.md and zenvault.json
//   zenvault_command     the `/vault lint|new|status|setup` slash command: the same actions, answered in Markdown for a chat
//
// Files are confined to ZEN_PLUGIN_FILES (see files.ts). Without it, every tool says so and refuses.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KINDS } from '../core/templates.ts';
import { VERSION } from '../core/version.ts';
import { FileError, Files } from './files.ts';
import { runCommand } from './command.ts';
import { initialize, newNote, runLint, status } from './vault.ts';

const reply = (message: string, structured: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: message }], structuredContent: structured });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });
const NO_FILES = 'No files folder is set: this server works on the vault in ZEN_PLUGIN_FILES, which the host (zenbot) sets. Nothing was read or written.';

export interface Options {
  /** The vault folder; default ZEN_PLUGIN_FILES. */
  filesRoot?: string | null;
  /** The clock, for tests. */
  now?: () => Date;
}

export function createServer(opts: Options = {}): McpServer {
  const root = opts.filesRoot === undefined ? process.env.ZEN_PLUGIN_FILES || null : opts.filesRoot;
  const now = opts.now ?? (() => new Date());
  let files: Files | null = null;
  let rootError = '';
  if (root) try { files = new Files(root); } catch (e) { rootError = (e as Error).message; }

  const server = new McpServer({ name: 'zenvault', version: VERSION });

  const guard = async <T>(fn: (f: Files) => Promise<T>) => {
    if (!files) return fail(rootError || NO_FILES) as never;
    try { return await fn(files); } catch (e) {
      if (e instanceof FileError) return fail(e.message) as never;
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') return fail('Permission denied.') as never;
      return fail('That could not be done.') as never;
    }
  };

  server.registerTool('zenvault_command', {
    title: 'Vault command',
    description: 'The /vault slash command, for people in a chat. action: lint [folder] | new <kind> [project] <title> | status | setup; `rest` is the rest of the line. Answers in Markdown. Agents: prefer zenvault_lint, zenvault_new, zenvault_status and zenvault_initialize, which return data.',
    inputSchema: {
      action: z.string().max(40).optional().describe('lint, new, status or setup; anything else shows the usage.'),
      rest: z.string().max(2000).optional().describe('The rest of the line, e.g. a folder for lint or `goal "Run a 10k" project=alpha` for new.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ action, rest }) => guard(async (f) => {
    const text = await runCommand(f, action, rest ?? '', now());
    return { content: [{ type: 'text' as const, text }] };
  }));

  server.registerTool('zenvault_status', {
    title: 'Vault status',
    description: 'What is set up in the vault (method folders, templates, AGENTS.md, zenvault.json), the configured life areas, and how many notes each folder holds. Read-only.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => guard(async (f) => {
    const s = await status(f);
    return reply(s.missingFolders.length || s.missingTemplates.length || !s.hasAgents ? `${s.notes} notes. Not fully set up: run zenvault_initialize.` : `${s.notes} notes. Set up.`, s);
  }));

  server.registerTool('zenvault_list', {
    title: 'List notes',
    description: 'The Markdown notes and folders in a folder of the vault. `dir` is relative to the vault; omit it for the root.',
    inputSchema: { dir: z.string().max(1000).optional().describe('Folder, relative to the vault, e.g. "wiki". Omit for the root.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ dir }) => guard(async (f) => {
    const l = await f.list(dir ?? '');
    return reply(`${l.folders.length} folders, ${l.files.length} notes in ${l.dir || '(root)'}.`, { ...l });
  }));

  server.registerTool('zenvault_read', {
    title: 'Read a note',
    description: 'A note\'s Markdown text. `path` is relative to the vault, e.g. "wiki/Some page.md".',
    inputSchema: { path: z.string().max(1000).describe('Path of the note, relative to the vault.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ path: p }) => guard(async (f) => {
    const text = await f.read(p);
    return reply(text, { path: Files.clean(p), text });
  }));

  server.registerTool('zenvault_lint', {
    title: 'Lint the vault',
    description: 'Check the vault against its method and report findings {path, line, rule, severity, message}. Read-only. `path` (a note or folder) limits what is reported; the whole vault is still checked, so links and task ids resolve.',
    inputSchema: { path: z.string().max(1000).optional().describe('A note or folder to report on, relative to the vault. Omit for the whole vault.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ path: p }) => guard(async (f) => {
    const r = await runLint(f, p);
    const lines = r.findings.map((x) => `${x.severity} ${x.path}${x.line ? `:${x.line}` : ''} [${x.rule}] ${x.message}`);
    return reply(`${r.counts.errors} errors, ${r.counts.warnings} warnings in ${r.scope} (${r.checked} notes checked).${lines.length ? '\n' + lines.join('\n') : ''}`, { ...r });
  }));

  server.registerTool('zenvault_new', {
    title: 'New note from a template',
    description: `Create a note from a template and return its path. Never overwrites: it fails if the file exists. kind: ${KINDS.join(', ')}. A "project-note" and "tasks" need \`project\` (an existing project); a "goal" may have one. A "project" also creates its tasks.md. Paths: Daily/<date>.md, Goals/<title>.md, Projects/<name>/<name>.md, Projects/<project>/notes/<title>.md, wiki/<title>.md.`,
    inputSchema: {
      kind: z.enum(KINDS).describe('The kind of note.'),
      title: z.string().max(200).optional().describe('The title (the file name). Optional for daily (today) and wiki-home; for tasks it is the project name.'),
      project: z.string().max(200).optional().describe('The project name, for project-note, tasks and goal.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => guard(async (f) => {
    const r = await newNote(f, input, now());
    return reply(`Created ${r.paths.join(', ')}.`, { ...r });
  }));

  server.registerTool('zenvault_initialize', {
    title: 'Set up the vault',
    description: 'Create only what is missing: the method folders (Daily, Goals, Projects, wiki, Templates, skills), the templates, AGENTS.md (the method) and zenvault.json (the settings). Existing files are never overwritten.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => guard(async (f) => {
    const r = await initialize(f);
    return reply(r.created.length ? `Created ${r.created.length}: ${r.created.join(', ')}. Kept ${r.existing.length} that already existed.` : 'Nothing to create: the vault is already set up.', { ...r });
  }));

  return server;
}
