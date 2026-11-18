---
status: active
areas: []
repos: []
---
# {{title}}

Purpose in one or two lines.

## Repos
- [repo-name](https://example.com/org/repo-name) (`~/repo-name` or not cloned): what it is. Read `README.md` first.

## Goals
```dataview
LIST FROM "Goals" WHERE contains(string(project), "{{title}}") AND status = "active"
```

## Tasks
![[Projects/{{title}}/tasks]]

## Notes
