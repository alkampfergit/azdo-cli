# Changelog

All notable changes to **azdo-cli** are summarised here — one short stanza per
release. Full per-release detail lives in [`docs/changelogs/`](docs/changelogs/).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
the project uses [Semantic Versioning](https://semver.org/).

> Maintained with the `changelog` skill — keep this file slim. Record changes
> with `/changelog record`; finalise a release with `/changelog release X.Y.Z`.
> Detail belongs in `docs/changelogs/<version>.md`, never inline here.

## [Unreleased]

_Targeting **0.15.0**. Working detail: [`docs/changelogs/unreleased.md`](docs/changelogs/unreleased.md)._

- `azdo pr comments add` / `edit` (+ `comment-add`/`comment-edit` aliases): create a new PR thread, rewrite a comment in place; `--file`, `--status`, `--dry-run`.
- `azdo pr list`: single-call PR lookup with `--branch`, `--status`, `--top`.
- `azdo pr comments` gains `--exclude-system` and `--max-chars`; `reply` gains `--file`; `--repo` added to every `pr` subcommand.
- Remove the four `scripts/*_pr_*.ps1` helpers — superseded by the commands above.

## [0.14.1] - 2026-06-26 — ADO HTML-entity decode for markdown fields

Patch: full HTML-entity decoding on non-HTML markdown field downloads; em dashes, blockquote markers, and all named/numeric entities are now decoded correctly.
→ [details](docs/changelogs/0.14.1.md)

- Fix ADO HTML entities (`&gt;`, `&mdash;`, numeric) decoded in `toMarkdown()` output; set/get roundtrips are now byte-identical (#76/#77).

## [0.14.0] - 2026-06-26 — Maintainer skill, generic-type markdown fix & dep hardening

Adds a `maintainer` skill for release-maintenance automation; fixes ADO's
REST sanitizer stripping `<T>` generic types inside backtick code spans;
hardens the dev dependency chain.
→ [details](docs/changelogs/0.14.0.md)

- Add Maintainer skill for release maintenance workflows.
- Fix generic type args (`<T>`) stripped by ADO sanitizer in markdown code spans; fix `addWorkItemRelation` idempotency (#74/#75).
- Bump vulnerable dev dependencies (vite, postcss, esbuild) — dev-only, zero audit vulnerabilities (#73).

## [0.13.0] - 2026-06-16 — Pipelines, auth diagnostics & PR improvements

OAuth is the default login flow; new `azdo pipeline` group covers the full
CI/AI-agent lifecycle; `azdo auth diagnose` + `--trace` flag for debugging;
PR comment reply, line numbers, and resolution filters.
→ [details](docs/changelogs/0.13.0.md)

- OAuth login (`azdo auth login`) with browser and headless flows (#38).
- New `azdo pipeline` command group: list, get-runs, wait, get-run-detail, logs, tests, start (#51).
- `azdo auth diagnose` and global `--trace <filepath>` for auth/HTTP debugging (#68).
- `azdo pr comments reply`; line-number display; `--code-related-only`/`--exclude-resolved` filters; policy checks in `pr status` (#50/#61/#65).
- Fix project auto-detection for names with spaces; PR detection on userinfo remotes (#71/#43).

## [0.10.1] - 2026-04-27 — Patch

CI workflow fix. → [details](docs/changelogs/0.10.1.md)

## [0.10.0] - 2026-04-24 — Secure auth, PAT storage & PR threads

Dedicated `auth` command with secure multi-org PAT storage; reliable PR comment
threads with resolve/reopen; hardened PAT entry. → [details](docs/changelogs/0.10.0.md)

## [0.9.0] - 2026-04-08 — Maintenance

Release-process / version bump; no user-facing feature changes. → [details](docs/changelogs/0.9.0.md)

## [0.8.1] - 2026-04-08 — Work item attachments

View and download work item attachments. → [details](docs/changelogs/0.8.1.md)

## [0.8.0] - 2026-04-03 — Markdown comments

`--markdown` flag for adding and listing work item comments. → [details](docs/changelogs/0.8.0.md)

## [0.7.1] - 2026-04-03 — Patch

Follow-up formatting fix. → [details](docs/changelogs/0.7.1.md)

## [0.7.0] - 2026-04-03 — Markdown field formatting

Correct markdown field label formatting in `get-item` output. → [details](docs/changelogs/0.7.0.md)

## [0.6.0] - 2026-03-31 — PR status checks

`pr status` surfaces Azure DevOps pull request checks. → [details](docs/changelogs/0.6.0.md)

## [0.5.0] - 2026-03-29 — Create-by-type & work item comments

Create work items by type; add and list work item comments; integration tests. → [details](docs/changelogs/0.5.0.md)

## [0.4.0] - 2026-03-27 — Pull request commands

First PR CLI commands, more resilient field handling, improved secret handling. → [details](docs/changelogs/0.4.0.md)

## [0.3.0] - 2026-03-26 — Markdown display & upsert

Automatic markdown rendering of rich-text fields; upsert work items from markdown. → [details](docs/changelogs/0.3.0.md)

## [0.2.5] - 2026-03-09 — Base CLI, first commands & CI

The first working CLI (consolidates the same-day 0.2.0–0.2.5 prereleases):
get-item, settings, update, markdown fields, and the OIDC publish pipeline. → [details](docs/changelogs/0.2.5.md)

## [0.1.0] - 2026-03-04 — Project bootstrap

Repository skeleton, dev container, and tooling baseline. → [details](docs/changelogs/0.1.0.md)
