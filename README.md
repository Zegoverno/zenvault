# zenvault

A vault **method** for Markdown notes, packaged for agents: the folders, the note types and the rules, with templates to start from, a linter that checks them, and skills that teach an agent to follow them. It is a [zenbot](https://github.com/Zegoverno/zenbot) plugin and a standard MCP server (stdio), so it also runs in other MCP hosts. It works on plain Markdown folders and reads well in Obsidian.

## The `/vault` command

zenvault adds no tab: browse and search your notes in zenbot's **Files** tab, which opens in the vault. What zenvault adds is one slash command, in the web chat and in Matrix, and an answer in plain Markdown:

| Command | What |
|---|---|
| `/vault lint [folder]` | check the vault: `3 errors, 1 warning in 2 notes`, then the findings grouped by rule, each `path:line — message`, at most 40 lines (then "…and N more; run `/vault lint <folder>` to narrow") |
| `/vault new <kind> [title]` | create a note from a template and link it. Kinds: daily, goal, project, project-note, tasks, primitive, hub, source, fact, solution, decision, idea, wiki-home |
| `/vault status` | which method folders are present or missing |
| `/vault setup` | create only what is missing and list it; nothing is overwritten |
| `/vault` | the usage |

The title is the rest of the line, quoted or not. `project-note` and `tasks` name an existing project first (`/vault new project-note alpha Kick-off`); any kind takes `project=<name>` (`/vault new goal "Run a 10k" project=alpha`). Quote names that have spaces. `daily` with no title is today. Errors say what is wrong: unknown kind, no such project, the file exists (nothing is overwritten), a name that is not a file name.

## The method in short

The full rules are in [`method/AGENTS.md`](method/AGENTS.md), which `zenvault_initialize` installs in your vault as `AGENTS.md` (only if you have none).

| Folder | What |
|---|---|
| `Daily/` | `YYYY-MM-DD.md`, the plan of one day, tasks ticked |
| `Goals/` | one SMART goal per note: `project`, `areas`, `status` (active/done/dropped), `due`, `metric`, `target`; or `smart: false` |
| `Projects/<name>/` | top level only `<name>.md` and `tasks.md`; other documents in `notes/` as `type: project-note` with `project:` and `as_of:`. No archive: stale notes are deleted, git keeps the history. A project built in code lists `repos:` and a `## Repos` section |
| `wiki/` | flat pages named by title, one page per thing, links inside sentences, first principles. Types: primitive, hub, source, fact, solution, decision, idea. `status` current/stale/superseded, a `## Changelog` (newest first) on every changed page, one line per paragraph |
| `Templates/`, `skills/` | a template per kind of note; procedures for agents |

- **Life areas** are tags (`#area/health`) in a wheel of life: health, love, meaning, leadership, business, wealth. The list is `areas` in `zenvault.json` at the vault root; change it to fit your life.
- **Tasks** use the Obsidian Tasks emoji format. Every task has a `🆔` unique in the vault (a task in a `Daily/` plan is a link back to the project task and needs none); priorities `🔺 ⏫ 🔽 ⏬`; dates `📅 ⏳ ✅`.

## Tools

All paths are relative to the vault folder (`ZEN_PLUGIN_FILES`).

| Tool | What | Writes |
|---|---|---|
| `zenvault_status` | what is set up and missing, the areas, note counts | no |
| `zenvault_list` | Markdown notes and folders in a folder | no |
| `zenvault_read` | a note's text | no |
| `zenvault_lint` | check the vault against the method; optional `path` scopes the report; returns findings and counts | no |
| `zenvault_new` | create a note from a template: `kind` (daily, goal, project, project-note, tasks, primitive, hub, source, fact, solution, decision, idea, wiki-home), `title`, `project`. Returns the path; never overwrites | yes, new files only |
| `zenvault_initialize` | create only the missing folders, templates, `AGENTS.md` and `zenvault.json` | yes, new files only |
| `zenvault_command` | the `/vault` command above: `action` (`lint`, `new`, `status`, `setup`) and `rest`; answers in Markdown for people. Agents should use the tools above, which return data | yes, new files only |

A template in the vault's own `Templates/` wins over the bundled one. Without `ZEN_PLUGIN_FILES` (some hosts) every tool says so and refuses.

### The linter

Pure TypeScript in [`core/lint.ts`](core/lint.ts), one small named rule each. Errors: `frontmatter-closed`, `type-missing`, `wiki-type-unknown`, `wiki-status`, `superseded-needs-link`, `source-link-url`, `project-stray-file`, `project-note-type`, `project-note-fields`, `goal-fields`, `goal-status`, `goal-due-format`, `goal-area-unknown`, `daily-name`, `task-id-missing`, `task-id-duplicate`, `link-unresolved`. Warnings: `wiki-flat`, `fact-as-of`, `idea-author`, `goal-project-link`, `changelog-format`, `hard-wrap` (a heuristic), `wiki-home-hubs`. A page with no changelog is fine; one with a malformed changelog gets a warning. `Templates/`, `skills/` and the instruction files are not linted. Links resolve by title, alias or path; links in code are ignored.

### Skills

`organize` (which folder a note belongs in), `wiki` (write and maintain wiki pages by the rules) and `lint` (run the linter, fix only what is safe, ask before moving or deleting). Installed as `plugin-zenvault-zenvault/<name>` in zenbot.

## Permissions

| Permission | Why |
|---|---|
| `files:read` | read, list and lint the notes of the vault |
| `files:write` | `zenvault_new`, `zenvault_initialize` and the `/vault new` and `setup` commands create new files and folders in the vault |

No network, no AI, no telemetry. The server needs nothing else.

## Safety

- Every path is relative to the vault. Absolute paths, drive letters, `~`, backslashes, NUL, `..` and dot folders (`.git`, `.obsidian`) are refused.
- After the check the real path (links followed) must still be inside the vault: a link pointing out is never read, listed, linted or written through, and a link where a folder should be makes `initialize` refuse.
- Writes are exclusive (`O_EXCL`): a file that exists, even as a link, is never replaced. Nothing is ever deleted or moved.
- Titles are file names: no folders, no dot start, no reserved characters.
- Reads are capped (2 MB per note, 5000 notes).

These are tested in `mcp/files.test.ts` and in the stdio smoke test, which runs the bundled server against a synthetic vault.

## Develop

```bash
npm ci
npm run check     # typecheck, unit tests, build, MCP smoke test, release archive test
npm run pack      # dist/zenvault-<version>.tgz and its sha256
```

`core/` is pure TypeScript with unit tests (lint, text, templates, config); `mcp/` is the server (`files.ts` path safety, `vault.ts` the tools' logic, `command.ts` the `/vault` grammar and wording, `app.ts` the MCP wiring). `vite.server.config.ts` bundles `mcp/dist/server.js` as one file, with the templates and the method inside; the installed plugin has no `node_modules`.

## Release

The release is a GitHub release tagged `v<version>` with the one asset `zenvault-<version>.tgz`, which holds `plugin.json`, `mcp/dist/server.js`, `skills/`, `templates/`, `method/AGENTS.md`, `README.md` and `LICENSE`: no links, no absolute paths, no `..`, no `node_modules`, no dot files. `npm run pack` builds it reproducibly and prints the sha256 for the marketplace entry. Try it locally with `zen plugins add dist/zenvault-0.1.1.tgz`.

## License

MIT
