# Unreleased — targeting 0.21.0

> Working detail for the next release. Finalise into
> `docs/changelogs/0.21.0.md` when the release is cut.

### Documentation

- `docs/commands.md` is now a complete command reference: it adds the
  attachment and `relations` commands, the credential resolution order,
  a short authentication section, and a **JSON output contracts** section with
  the `--json` shape of every command that has one. A new unit test checks the
  page against the real command tree, so a command, alias or option can no
  longer ship undocumented. (#116)
- A root `context7.json` limits the Context7 index to the user documentation,
  so specs and planning notes that mention removed commands (`azdo login`,
  `azdo work-item get`, `azdo boards …`) no longer show up. (#116)
