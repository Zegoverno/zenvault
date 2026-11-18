---
name: organize
description: Decide which folder of the vault a note belongs in, and propose where to put or move it. Use when the user hands over a note, an idea or a pile of files and asks where it goes, or when a note looks misplaced.
---

# Organize a note

The vault's rules are in its `AGENTS.md`; read it first (`zenvault_read` path `AGENTS.md`). Ask by the note's purpose:

| The note is... | It goes in |
|---|---|
| the plan of one day | `Daily/YYYY-MM-DD.md` |
| one outcome to reach, with a metric, a target and a date | `Goals/<title>.md` (SMART; `smart: false` if it cannot be measured yet) |
| a to-do with an id | the project's `tasks.md` (a one-day task may sit in that day's daily note) |
| a working document of one project: a plan, a design, open questions | `Projects/<project>/notes/<title>.md`, `type: project-note`, with `project:` and `as_of:` |
| something that stays true whatever any project does: a concept, a fact, a source, a solved problem, a decision, a draft idea | `wiki/<title>.md` with its `type` |
| a reusable procedure for an agent | `skills/` |
| a blank starting point for a kind of note | `Templates/` |

Rules:

1. A project's top level holds only `<name>.md` and `tasks.md`. Everything else is in `notes/`.
2. There is no archive. A note that stopped being current is deleted (git keeps it), after the owner agrees.
3. Project state never goes in the wiki; lasting knowledge never stays buried in a project note. When a project note holds both, split it: the lasting part becomes a wiki page and the note links to it.
4. A new note starts from a template: `zenvault_new` creates it and never overwrites (the owner can do the same in chat with `/vault new <kind> [title]`).
5. Moving, renaming and deleting are the owner's call. Propose the move (from, to, why), wait, then do it and run `zenvault_lint` to check that links and ids still hold.
