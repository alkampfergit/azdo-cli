# PR Report: Fix `azdo pr` errors on valid Azure DevOps remotes

**Branch**: `019-fix-pr-command`
**Date**: 2026-05-29
**Spec**: [specs/019-fix-pr-command/spec.md](./spec.md)

## Summary

`azdo pr <sub>` aborted with *"Git remote 'origin' is not an Azure DevOps URL"* on any remote whose URL carries a `<user>@` (or `<user>:<token>@`) userinfo prefix — the exact form Azure DevOps's own "Clone" instructions produce — and also rejected a trailing `.git` suffix. This change extends the URL recognition layer to tolerate both, without widening the host allow-list, emits a one-time per-session stderr warning when an embedded credential is detected (never echoing it), and documents the branch→PR auto-detection rule in every `azdo pr <sub> --help` plus hardens the zero/multi-match error messages.

## What's New

<!-- finalised in step 11 -->

- [What's New — filled once /speckit-implement completes]

## Testing

<!-- finalised in step 11 -->

- [Testing — filled once /speckit-implement completes]
