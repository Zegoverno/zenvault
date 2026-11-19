# Vault conventions

This folder is a shared second brain: plain Markdown that reads well in Obsidian, edited by a person and by agents. These are the rules every agent follows here. The vault's own settings are in `zenvault.json` at its root.

## Folders

| Folder | What |
|---|---|
| `Daily/` | One plan per day, `YYYY-MM-DD.md`, tasks ticked during the day |
| `Goals/` | One SMART goal per note |
| `Projects/<name>/` | One folder per project: `<name>.md` and `tasks.md` at the top, everything else in `notes/` |
| `wiki/` | The wiki: one flat folder of pages named by title |
| `Templates/` | One template per kind of note |
| `skills/` | Procedures an agent can load |

Add a project only when the owner asks. Never create other top-level folders without asking.

## Projects

A project folder's top level holds only `<name>.md` (purpose, status, links, a `## Notes` list) and `tasks.md`. Every other document is a note in `notes/` with this frontmatter:

```yaml
---
type: project-note
project: "[[Projects/<name>/<name>]]"
as_of: YYYY-MM-DD
---
```

A project's own note `<name>.md` has `status`: `active`, `done` or `dropped` (the same values as a goal's), and `areas`.

`as_of` is the date the note was last known to be true: `YYYY-MM-DD`, or `YYYY-MM` when the day is not known. There is no archive folder: a note that stops being current is deleted, and git keeps the history. What stays true whatever the project does goes to the wiki instead.

A project built in code lists its repos in the frontmatter of `<name>.md` (`repos:` with URLs) and in a `## Repos` section right after the intro: per repo, what it is, where it is cloned (or "not cloned") and which docs to read first. The repo holds the technical truth; the vault holds the why and the context across projects, and never copies repo docs.

## Areas

Every goal touches one or more life areas, a wheel of life, written as tags such as `#area/health`. The list is `areas` in `zenvault.json`. The default six:

- `health`: health and vitality
- `love`: love and relationships
- `meaning`: mind and meaning
- `leadership`: leadership and impact
- `business`: productivity and business
- `wealth`: wealth and finance

In frontmatter, write areas without the `#`: `areas: [health, wealth]`.

## Goals

A goal is SMART: specific, measurable, achievable, relevant, time-bound. Its frontmatter holds:

- `project`: a link to the project
- `areas`: areas from the list above
- `status`: `active`, `done` or `dropped`
- `due`: `YYYY-MM-DD`
- `metric`: what is measured
- `target`: the value to reach

The body says the goal, why it matters and how it is measured. A goal states only the goal: no baseline, no current state. A lifelong or not-yet-measurable goal carries `smart: false` and says what is missing to make it SMART; `due`, `metric` and `target` are then optional.

## Tasks

Tasks live in each project's `tasks.md` (and in a daily note for tasks of one day) as checkboxes in the Obsidian Tasks format, one per line:

```
- [ ] Call the plumber [[Fix the kitchen]] 📅 2030-01-31 ⏫ 🆔 t7k2x9
- [x] Buy paint 🆔 a91c3f ✅ 2030-01-20
- [-] Repaint the fence 🆔 k2m8q1 ❌ 2030-01-22
```

- Every task has a `🆔`: a short id of 6 lowercase letters or digits (`a91c3f`), unique in the whole vault. (Older, shorter ids stay valid: the linter only warns, and an id is never changed once something points at it.) A task exists once: never copy a task line into another note, link to it or embed the file. The one exception is the daily plan: a task chosen from a project may be listed there as a link back (`- [ ] Book the physio — [[Projects/alpha/tasks|alpha]]`); the `🆔` stays on the project task, and the linter skips `Daily/` for task ids.
- State: `- [ ]` open, `- [x]` done, `- [-]` dropped. A done task carries `✅ YYYY-MM-DD` (the day it was done), a dropped one `❌ YYYY-MM-DD`; an open task carries neither.
- `📅` due date, `⏳` scheduled day. Dates are `YYYY-MM-DD`.
- Priority, at most one: `🔺` urgent (needed now, not tied to a goal), `⏫` important (moves a goal forward), `🔽` not urgent, `⏬` parking lot. No mark sorts just above the parking lot. `🔼` is read as medium for old tasks but is not offered any more.
- A link to a goal ties the task to it: `[[Fix the kitchen]]` names a note in `Goals/`. A task without a goal is fine. Links on a task name goals and nothing else.
- Fields may come in any order; the line keeps the Tasks plugin's emoji format so Obsidian reads it too.
- The owner adds, finishes and drops tasks, in Obsidian or in the zenbot app (which writes the same lines). An agent adds a task only when asked and never invents one. Drop a task by deleting its line, or `- [-]` to keep the record.

## Daily plan

`Daily/YYYY-MM-DD.md` is the plan for one day: the fixed commitments, a few suggested tasks (overdue first, then what moves an active goal) and the active goals. Tasks listed here are references to the project's `tasks.md`, which stays the one source of truth: they need no `🆔`. Nothing else belongs in a daily file name.

## Wiki

A wiki for remembering and retrieving what matters when a problem comes up. Pages sit flat in `wiki/`, named by title (`Bayes' theorem.md`), with YAML frontmatter holding `type` and optional `aliases`. The home page `Wiki` links only to hubs, never to individual pages.

- **One page per thing.** Every idea, fact or decision has exactly one page. Other pages link to it and never restate it.
- **Links go inside sentences** ("only works if you account for the [[Base rate]]"), not in lists at the bottom.
- **First principles.** Break knowledge into primitives and say what each is built from and what it leads to.
- **Links resolve.** Every `[[link]]` names an existing page (or a `Goals/` or `Projects/` path). A concept with no page yet stays plain text until someone writes the page.
- **One line per paragraph.** Never hard-wrap prose; write each paragraph and list item on one line.
- **Write what stays true.** Knowledge pages hold what does not change with anyone's situation. Project state goes in `Projects/`; decisions and solutions may link to wiki pages, never the reverse.
- **Project tags.** A page that bears on a project carries its name: `tags: [name]`. The tag marks relevance only.
- **Contradictions are flagged, not erased.** When sources disagree, the page says so inline and names both sides.
- **Links are evidence, not proof.** A link says two things are related; the sentence says how.

### Types

- `primitive`: a concept, principle, model or formula. Sections: idea (one or two lines), formula, intuition (an example that stays true), when to reach for it (the signals that should bring it to mind), where it fails, built from / leads to.
- `hub`: a map of one subject or context type. It lists pages in learning order, or by query. A primitive's `subject` names its hub.
- `source`: a book, article, video or news item: what it argues and what is worth keeping, linked to primitives. `link:` holds the real URL, only when one is known; never invent one. Optional sections only when they add something a careful reader would not assume: `## Caution` (a specific flaw, not a generic disclaimer) and `## How we use it` (a durable use).
- `fact`: something true about the world, with `as_of:` and a line saying it may be stale and should be checked. Updated in place.
- `solution`: a problem that was solved: the problem, what worked, the limits and pitfalls.
- `decision`: an agreement: what, why, the date, who decided. When reversed, `status: superseded` and `superseded_by:` with a link to the new one.
- `idea`: a person's draft, kept exactly as written (`author:` names them). The body is never rewritten; an agent only adds, after it, a dated block: `> [!note] YYYY-MM-DD agent-name` followed by the comment.

### Status and changelog

- `status:` is `current` (the default, may be omitted), `stale` (the body says what changed and as of when) or `superseded` (with a link to the replacement). Stale is marked, not hidden.
- Every changed page ends with `## Changelog`: one line per change, newest first, `- YYYY-MM-DD — what changed and why`. The body is always the current version; the changelog keeps the history. Never delete entries. Nothing comes after it.

## Allowed values

The values the method allows for `type` and `status` (wiki pages, goals, projects), with their labels and display order, are data in `values.json` next to this file (and from the `zenvault_values` tool, which adds the vault's `areas`). The linter reads the same file, so what is listed here, what is checked and what an app offers in a filter cannot differ.

## Safety

- Never overwrite or delete a note without the owner's say. Create files only where they do not exist.
- Raw sources are immutable. Keep originals unedited; the wiki is the maintained layer.
- No secrets in the vault.
- Run the linter (`zenvault_lint`) after a batch of edits and fix what it reports.
