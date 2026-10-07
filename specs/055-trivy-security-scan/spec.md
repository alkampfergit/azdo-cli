# Spec: Scheduled Trivy dependency scan

Issue: #144

## Goal
Fail loudly when a dependency carries a HIGH or CRITICAL vulnerability, and let a maintainer download the full report from the run.

## Requirements
- New `.github/workflows/security.yml`, separate from `ci.yml`. Triggers: `schedule` (`0 5 */3 * *`, every 3 days) and `workflow_dispatch`. No `push` / `pull_request` trigger: vulnerabilities are found in code that already exists.
- A matrix over `develop` and `master` checks each ref out explicitly (scheduled runs use the default branch's copy of the file). `fail-fast: false`.
- `aquasecurity/trivy-action` (pinned by SHA), `scan-type: fs`, `severity: HIGH,CRITICAL`, `exit-code: 1`, scanners `vuln,secret,misconfig,license`, `TRIVY_INCLUDE_DEV_DEPS=true`. **`ignore-unfixed` is not set**: unfixed findings fail too.
- A second scan covers the published artefact (`npm pack`, extract, scan `vuln,secret`).
- JSON and SARIF reports are written before the gate steps and uploaded with `if: always()` as `trivy-report-<ref>`.
- Accepted risks live in a reviewed `.trivyignore`, each with a reason.

## Decisions (from the issue discussion)
- Unfixed vulnerabilities fail the scan (owner). Cover everything (owner). Separate, scheduled check, not per push (owner).
- SARIF is an artefact only; no upload to Code Scanning, so no `security-events: write`.
- The packed tarball has no lockfile, so that scan can only find secrets and bundled files; dependency CVEs come from the repository scan.
- The scheduled run is not a required PR status check; a failure is a red scheduled run.

## Delivery
The `gh` token lacks the `workflow` scope, so the workflow ships as `security-workflow.patch`: `git apply specs/055-trivy-security-scan/security-workflow.patch`.

## Out of scope
Per-push scanning, Code Scanning upload, container images.
