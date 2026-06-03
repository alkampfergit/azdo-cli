# PR Report: `azdo pipeline` command group

**Branch**: `024-azdo-pipeline`
**Date**: 2026-06-03
**Spec**: [specs/024-azdo-pipeline/spec.md](./spec.md)

## Summary

Adds a new `azdo pipeline` command group for Azure DevOps Pipelines — list
definitions, inspect runs, wait for a run to finish (with a result-reflecting
exit code), drill into a run's errors/failing-tests/stages, fetch logs, and
queue runs. Designed for the AI-coding-agent loop (push → build → wait → read
errors → repeat) with `--json` on every subcommand. Closes #51.

## What's New

<!-- Finalised in speckit-gh step 11 -->

- **[pipeline command group]**: [TBD]

## Testing

<!-- Finalised in speckit-gh step 11 -->

- **[Unit]**: [TBD]

## Notes

<!-- Finalised in speckit-gh step 11 -->

- [TBD]
