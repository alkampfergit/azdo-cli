# Changelog

All notable changes to **azdo-cli** are summarised here — one short stanza per
release. Full per-release detail lives in [`docs/changelogs/`](docs/changelogs/).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
the project uses [Semantic Versioning](https://semver.org/).

> Maintained with the `changelog` skill — keep this file slim. Record changes
> with `/changelog record`; finalise a release with `/changelog release X.Y.Z`.
> Detail belongs in `docs/changelogs/<version>.md`, never inline here.

## [Unreleased]

_Targeting **0.12.0** (0.11.0 already published to npm). Working detail: [`docs/changelogs/unreleased.md`](docs/changelogs/unreleased.md)._

- OAuth login (`azdo auth login`) with browser and headless flows (#38).
- New `azdo pipeline` command group (list/get-runs/wait/get-run-detail/logs/start) for Azure DevOps Pipelines (#51).
- Better PR comments & status: `--code-related-only`/`--exclude-resolved` filters, code-comment counts, and `pr status` now surfaces branch policy checks (#50).
- Fix `azdo pr` on Azure DevOps remotes that carry userinfo (#43).
- Sync authentication docs with the current auth surface (#42).

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
