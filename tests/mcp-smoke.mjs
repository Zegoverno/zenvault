// MCP smoke test: start the built server (mcp/dist/server.js) over stdio with the SDK client against a
// temporary, synthetic vault: list tools, initialize, create notes, lint a seeded
// error, and check that reads and writes refuse traversal, absolute paths, hidden paths and links out.
// `node tests/mcp-smoke.mjs [plugin folder]`: by default this repository; tests/pack-smoke.mjs runs it
// against the unpacked release.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(process.argv[2] ?? new URL('..', import.meta.url).pathname) + path.sep;
const manifest = JSON.parse(readFileSync(root + 'plugin.json', 'utf8'));
const tmp = mkdtempSync(path.join(tmpdir(), 'zenvault-smoke-'));
const vault = path.join(tmp, 'vault'), outside = path.join(tmp, 'outside');
for (const d of [vault, outside, path.join(vault, '.private')]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(vault, '.private/x.md'), 'nope');
writeFileSync(path.join(outside, 'secret.md'), 'secret');
mkdirSync(path.join(outside, 'folder'));
symlinkSync(path.join(outside, 'secret.md'), path.join(vault, 'leak.md')); // a file link out
symlinkSync(path.join(outside, 'folder'), path.join(vault, 'linked')); // a folder link out

const text = (r) => r.content.map((c) => c.text).join('\n');
const start = (env) => {
  const client = new Client({ name: 'smoke', version: '0' });
  return client.connect(new StdioClientTransport({ command: manifest.server.command, args: manifest.server.args, cwd: root, env: { PATH: process.env.PATH ?? '', ...env } })).then(() => client);
};
const call = (c, name, args = {}) => c.callTool({ name, arguments: args });

const client = await start({ ZEN_PLUGIN_FILES: vault });
try {
  // ---- tools, resource and manifest ----
  assert.equal(client.getServerVersion().name, manifest.name);
  assert.equal(client.getServerVersion().version, manifest.version, 'the server reports the plugin version');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['zenvault_command', 'zenvault_initialize', 'zenvault_lint', 'zenvault_list', 'zenvault_new', 'zenvault_read', 'zenvault_status']);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.deepEqual(manifest.contributes, { commands: [{ name: 'vault', tool: 'zenvault_command', args: '<action> [rest]', description: manifest.contributes.commands[0].description }] }, 'one slash command and no view');
  assert.ok(!manifest.contributes.views && !client.getServerCapabilities().resources, 'no view and no UI resource');
  for (const name of ['zenvault_status', 'zenvault_list', 'zenvault_read', 'zenvault_lint']) assert.equal(byName[name].annotations.readOnlyHint, true, `${name} is read-only`);
  assert.deepEqual(manifest.kernel, ['files:read', 'files:write']);

  // ---- status, then initialize: only what is missing, never an overwrite ----
  assert.equal((await call(client, 'zenvault_status')).structuredContent.missingFolders.length, 6);
  writeFileSync(path.join(vault, 'AGENTS.md'), 'my own rules');
  const init = await call(client, 'zenvault_initialize');
  assert.ok(!init.isError);
  assert.ok(init.structuredContent.created.includes('wiki/') && init.structuredContent.created.includes('Templates/goal.md'));
  assert.ok(!init.structuredContent.created.includes('AGENTS.md'));
  assert.equal(readFileSync(path.join(vault, 'AGENTS.md'), 'utf8'), 'my own rules');
  assert.deepEqual((await call(client, 'zenvault_initialize')).structuredContent.created, [], 'a second run creates nothing');
  assert.equal((await call(client, 'zenvault_status')).structuredContent.missingTemplates.length, 0);

  // ---- new: from a template, exclusive ----
  const made = await call(client, 'zenvault_new', { kind: 'project', title: 'garden' });
  assert.deepEqual(made.structuredContent.paths, ['Projects/garden/garden.md', 'Projects/garden/tasks.md']);
  const fact = await call(client, 'zenvault_new', { kind: 'fact', title: 'Water boils at 100 C at sea level' });
  assert.equal(fact.structuredContent.path, 'wiki/Water boils at 100 C at sea level.md');
  assert.match(readFileSync(path.join(vault, fact.structuredContent.path), 'utf8'), /^---\ntype: fact\nas_of: \d{4}-\d{2}-\d{2}\n---/);
  writeFileSync(path.join(vault, fact.structuredContent.path), 'edited');
  const again = await call(client, 'zenvault_new', { kind: 'fact', title: 'Water boils at 100 C at sea level' });
  assert.equal(again.isError, true);
  assert.match(text(again), /already exists/);
  assert.equal(readFileSync(path.join(vault, fact.structuredContent.path), 'utf8'), 'edited', 'nothing was overwritten');
  assert.equal((await call(client, 'zenvault_new', { kind: 'project-note', title: 'Plan', project: 'ghost' })).isError, true);
  for (const title of ['../escape', 'a/b', '.hidden']) assert.equal((await call(client, 'zenvault_new', { kind: 'fact', title })).isError, true, title);

  // ---- lint: finds a seeded error, scoped and whole ----
  assert.equal((await call(client, 'zenvault_lint', { path: 'Projects' })).structuredContent.counts.errors, 0);
  writeFileSync(path.join(vault, 'wiki/Broken.md'), '# no front matter\n\nSee [[Nowhere]].\n\n- [ ] a task without an id\n');
  const lint = await call(client, 'zenvault_lint');
  const rules = lint.structuredContent.findings.map((f) => `${f.rule}@${f.path}`);
  for (const rule of ['type-missing', 'link-unresolved', 'task-id-missing']) assert.ok(rules.includes(`${rule}@wiki/Broken.md`), rule);
  assert.ok(lint.structuredContent.counts.errors >= 3);
  assert.match(text(lint), /type-missing/);
  assert.equal((await call(client, 'zenvault_lint', { path: 'wiki/Broken.md' })).structuredContent.counts.errors, 3);
  assert.equal((await call(client, 'zenvault_lint', { path: 'Goals' })).structuredContent.counts.errors, 0, 'a scope hides other folders');
  assert.equal((await call(client, 'zenvault_lint', { path: '../x' })).isError, true);

  // ---- list and read, with the refusals ----
  assert.ok((await call(client, 'zenvault_list', { dir: 'wiki' })).structuredContent.files.some((f) => f.name === 'Broken.md'));
  assert.ok(!(await call(client, 'zenvault_list')).structuredContent.folders.some((f) => f.name === 'linked'), 'a folder link out is not listed');
  assert.match(text(await call(client, 'zenvault_read', { path: 'AGENTS.md' })), /my own rules/);
  for (const p of ['../outside/secret.md', 'wiki/../../outside/secret.md', '/etc/hostname.md', path.join(vault, 'AGENTS.md'), '.private/x.md', 'leak.md', 'linked/y.md', 'missing.md', 'wiki', 'zenvault.json']) {
    const r = await call(client, 'zenvault_read', { path: p });
    assert.equal(r.isError, true, `read ${p}`);
    assert.doesNotMatch(text(r), /secret$|nope/);
  }
  for (const dir of ['..', '.private', 'linked', '/tmp']) assert.equal((await call(client, 'zenvault_list', { dir })).isError, true, `list ${dir}`);
  assert.equal((await call(client, 'zenvault_lint', { path: 'linked' })).isError, true);

  // ---- the /vault command: Markdown for a chat ----
  const cmd = (action, rest) => call(client, 'zenvault_command', rest === undefined ? { action } : { action, rest });
  assert.match(text(await cmd('')), /\/vault lint \[folder\]/);
  assert.match(text(await cmd('status')), /^\*\*Vault:\*\* \d+ notes\nPresent: .*wiki\/.*\nNothing missing/);
  assert.equal(text(await cmd('setup')), 'Nothing to create: the vault is already set up.');
  const lintCmd = await cmd('lint', 'wiki');
  assert.match(text(lintCmd), /^\*\*\d+ errors, \d+ warnings in \d+ notes?\*\* \(`wiki`/);
  assert.match(text(lintCmd), /^- wiki\/Broken\.md:\d+ — /m);
  const goal = await cmd('new', 'goal "Run a 10k" project=garden');
  assert.equal(text(goal), 'Created [Goals/Run a 10k.md](<Goals/Run a 10k.md>)');
  assert.ok(existsSync(path.join(vault, 'Goals/Run a 10k.md')));
  assert.equal(text(await cmd('new', 'project-note garden Kick off')), 'Created [Projects/garden/notes/Kick off.md](<Projects/garden/notes/Kick off.md>)');
  for (const bad of ['essay x', 'project-note ghost Plan', 'goal "Run a 10k"', 'fact ../escape']) {
    const r = await cmd('new', bad);
    assert.equal(r.isError, true, bad);
  }
  assert.equal((await cmd('lint', '../x')).isError, true);

  // ---- writes never leave the vault ----
  assert.deepEqual(readdirSync(outside).sort(), ['folder', 'secret.md'], 'nothing was written outside');
  assert.equal(readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret');
  assert.ok(!existsSync(path.join(tmp, 'escape.md')));
} finally {
  await client.close();
}

// ---- a link to a folder outside as a method folder: initialize refuses and writes nothing there ----
const trap = path.join(tmp, 'trap'), trapOut = path.join(tmp, 'trap-out');
mkdirSync(trap); mkdirSync(trapOut);
symlinkSync(trapOut, path.join(trap, 'Templates'));
const t = await start({ ZEN_PLUGIN_FILES: trap });
try {
  assert.equal((await call(t, 'zenvault_initialize')).isError, true);
  assert.deepEqual(readdirSync(trapOut), []);
} finally { await t.close(); }

// ---- a files folder that is not absolute: refused clearly ----
const rel = await start({ ZEN_PLUGIN_FILES: 'vault' });
try {
  const r = await call(rel, 'zenvault_list');
  assert.equal(r.isError, true);
  assert.match(text(r), /absolute/);
} finally { await rel.close(); }

// ---- no files folder (as in Claude Desktop): every tool says so and refuses ----
const bare = await start({});
try {
  for (const [name, args] of [['zenvault_status', {}], ['zenvault_list', {}], ['zenvault_read', { path: 'a.md' }], ['zenvault_lint', {}], ['zenvault_new', { kind: 'fact', title: 'X' }], ['zenvault_initialize', {}], ['zenvault_command', { action: 'status' }]]) {
    const r = await call(bare, name, args);
    assert.equal(r.isError, true, name);
    assert.match(text(r), /ZEN_PLUGIN_FILES/);
  }
} finally { await bare.close(); rmSync(tmp, { recursive: true, force: true }); }

console.log('mcp smoke ok: 7 tools, the /vault command, refusals, no-files mode');
