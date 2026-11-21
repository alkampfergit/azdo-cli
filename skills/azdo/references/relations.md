# Work item relations

Links between two work items: parent/child, related, predecessor/successor, and
the other link types the organization enables.

```bash
azdo relations types --json             # the type names you can use (Child, Parent, Related, ...)
azdo relations list 1000 --json         # work item links on #1000, with target titles
azdo relations add child 1000 2000 --json      # #2000 becomes a child of #1000
azdo relations add related 1000 3000 --json
azdo relations remove child 1000 2000 --json
```

- `<type>` is the **name** from `relations types`, case-insensitive — not the
  reference name (`System.LinkTypes.Hierarchy-Forward`).
- The link is written on the first id and points at the second:
  `add child 1000 2000` means "1000 has child 2000". To set a parent, either
  `add parent 2000 1000` or `add child 1000 2000`.
- `add` and `remove` are idempotent: `status` is `added` / `already_exists` or
  `removed` / `not_found`, and both exit 0.
- `relations list` shows only work item links. Pull requests, commits, builds,
  attachments and hyperlinks are left out; read them with
  `azdo get-item <id> --json` (`relations`).
- Link a pull request with `azdo pr work-items link <id>`, not with
  `relations` (see `references/pull-requests.md`).
