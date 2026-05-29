# Data Model: Sync authentication docs

This feature has no runtime data model. The relevant "entities" are the documentation artefacts and the command surface they must describe — captured here as a coverage matrix the implementation works against.

## Entity: Authentication document

| Attribute | Description |
|---|---|
| `path` | File path of the doc |
| `role` | summary / command-reference / full-guide / registration-guide / setup-guide |
| `status` | stale / accurate / verify-only |
| `must-mention` | Commands/flows it must accurately describe |

| path | role | status | must-mention |
|---|---|---|---|
| `README.md` | summary | stale | `azdo auth login` (OAuth default), PAT alternative, link to full guide |
| `docs/commands.md` | command-reference | stale | `azdo auth login` row + accurate `auth`/`status`/`logout`/`clear-pat` rows |
| `docs/authentication.md` | full-guide | accurate | (already complete — verify only) |
| `docs/oauth-app-registration.md` | registration-guide | verify-only | custom Entra app, command names, cross-links |
| `docs/linux-credential-store.md` | setup-guide | verify-only | no removed/renamed command references |

## Entity: Auth command (target the docs must match)

See [contracts/auth-command-surface.md](./contracts/auth-command-surface.md) for the authoritative definition. Summary:

| command | kind | deprecated? |
|---|---|---|
| `azdo auth login` | OAuth (default) + PAT (`--use-pat`) | no |
| `azdo auth` (bare) | legacy PAT-prompt alias | no (back-compat) |
| `azdo auth status` | inspect | no |
| `azdo auth logout` | remove | no |
| `azdo clear-pat` | remove (PAT) | **yes** → use `auth logout` |

## Relationship / consistency rules

- Every command in the second table MUST be represented accurately in the `must-mention` of the relevant doc(s) (FR-003/FR-004).
- The same command/flow described in more than one doc MUST be described consistently (FR-005) — same command names, same default (OAuth), same deprecation status.
- Internal cross-links between these docs MUST resolve (FR-009 / SC-004).
