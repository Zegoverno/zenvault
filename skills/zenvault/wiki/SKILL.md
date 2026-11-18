---
name: wiki
description: Write or maintain a wiki page in the vault by its rules: one page per thing, typed, linked inside sentences, one line per paragraph, a changelog. Use when asked to add, edit, split, merge or review wiki knowledge.
---

# Write and maintain wiki pages

Read the vault's `AGENTS.md` (Wiki section) once per job. Search before writing: one page per thing, so extend an existing page rather than adding a second one (`zenvault_list` path `wiki`, `zenvault_read`).

## Writing a page

1. Pick the type: `primitive`, `hub`, `source`, `fact`, `solution`, `decision` or `idea`. Create it with `zenvault_new` (kind, title; the owner's chat equivalent is `/vault new <kind> [title]`); the template has the right frontmatter and sections.
2. Name the page by its title, flat in `wiki/`.
3. Write what stays true. No state of a project, job or plan: that belongs in `Projects/`. Decisions and solutions may link to knowledge pages, never the reverse.
4. Break knowledge into first principles: say what a primitive is built from and what it leads to.
5. Links go inside sentences, saying how the two things relate. A link to a page that does not exist stays plain text until the page is written.
6. One line per paragraph and per list item. Never hard-wrap.
7. A page that bears on a project carries `tags: [project-name]`.

## By type

- **source**: `link:` is the real URL, or the line is left out. Never invent a URL. Add `## Caution` or `## How we use it` only when they say something a careful reader would not assume.
- **fact**: `as_of:` and a line saying it may be stale. Update in place.
- **decision**: what, why, the date, who decided. When reversed: `status: superseded` and `superseded_by:` with a link to the new page.
- **idea**: the author's words are never rewritten. Add only a dated `> [!note] YYYY-MM-DD agent-name` block after the body.
- **hub**: lists pages for one subject; the `Wiki` home page links only to hubs.

## Changing a page

- Mark old content: `status: stale` (and say what changed and as of when) or `superseded` (with the link). Never hide it.
- When sources disagree, say so in the page and name both sides.
- End every changed page with `## Changelog`, newest first: `- YYYY-MM-DD — what changed and why`. Never delete entries. Nothing comes after it.
- Run `zenvault_lint` with the page's `path` and fix what it reports.
