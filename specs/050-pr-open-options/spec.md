# Spec: `pr open --target / --source / --draft / --work-item / --label` (#132)

Approved on issue #132. Decisions: `--json` keeps `{ branch, targetBranch, created, pullRequest }` and adds top-level `id`/`url`; no `AB#<id>` in the description (`workItemRefs` makes the real link); `--work-item` is repeatable.

- `--target` (default `develop`, `refs/heads/` stripped) drives the existing-PR lookup, template lookup and `targetRefName`.
- `--source` (default current branch); when given, no git checkout is needed.
- `--draft` → `isDraft: true`; `--work-item` → `workItemRefs: [{ id }]`; `--label` → `labels: [{ name }]` (trimmed, de-duplicated).
- One POST. An existing active PR for source→target is reported with no write (`created: false`).
- Rejected before any call: source == target, non-positive/non-numeric `--work-item`, empty `--label`.
- Out of scope: auto-complete, reviewers on create, applying flags to an existing PR.
