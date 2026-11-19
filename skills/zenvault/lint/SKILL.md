---
name: lint
description: Check the vault against its method with zenvault_lint and fix what is safe to fix. Use after a batch of edits, before reporting vault work done, or when asked to tidy or audit the vault.
---

# Lint the vault

Browse and search notes in zenbot's Files tab. The owner can also type `/vault lint [folder]` in chat for a readable summary; you use the tool.

1. Run `zenvault_lint` (no path for the whole vault, or a note or folder to scope the report). Read the counts first, then the findings: each has a path, a line, a rule and a severity.
2. Fix what is safe, in the note itself, with the smallest change:
   - add a missing `type`, `as_of` or changelog line the page's content makes obvious;
   - fix a date or status spelling (`YYYY-MM-DD`, `active|done|dropped`, `current|stale|superseded`);
   - add a missing task `🆔`: 6 lowercase letters or digits, not used anywhere in the vault (never change an existing id, even a short one: `task-id-format` is only a warning);
   - a done `- [x]` or dropped `- [-]` task without its `✅`/`❌ YYYY-MM-DD`: add the date only when you know it (the owner just said so, or the line's history shows it); otherwise ask;
   - a project `status` that is not `active`, `done` or `dropped`, and a legacy `🔼` priority: ask which it means;
   - turn a dead `[[link]]` into plain text, or correct a typo in its target;
   - join hard-wrapped lines of one paragraph.
3. Ask before anything else: moving or renaming a file, deleting a note, writing a page to satisfy a link, changing a goal's area, due date, metric or target, or inventing a source URL. Those are the owner's. Never edit the text of an `idea` page.
4. Warnings are heuristics (`hard-wrap`, `changelog-format`, `fact-as-of`): fix them when clearly right, otherwise mention them.
5. Run `zenvault_lint` again and report the counts before and after, and what is left for the owner.

Rules the linter checks: type and wiki type, status, `superseded_by`, source `link`, `as_of`, flat wiki, project folder contents, project-note fields, goal fields, status, due format and areas (the list is `areas` in `zenvault.json`), daily file names, project status, task lines in `Projects/*/tasks.md` (ids present, unique and 6 lowercase letters or digits; `✅`/`❌` dates; one priority from 🔺 ⏫ 🔽 ⏬; links that name goals; `Daily/` tasks are links back to project tasks and are skipped), resolving links, changelog format, hard wrapping, the `Wiki` home linking only to hubs.
