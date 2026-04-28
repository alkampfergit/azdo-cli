# PR Report: OAuth login for azdo-cli

**Branch**: `018-oauth-login`
**Date**: 2026-04-28
**Spec**: [specs/018-oauth-login/spec.md](spec.md)

## Summary

Adds an OAuth-based browser login to `azdo auth login` so a new user can authorise the CLI against an Azure DevOps organisation without minting a Personal Access Token in the AzDO web UI. OAuth is now the default; PAT remains a first-class option via `--use-pat`. A device-code-style fallback covers headless hosts (CI runners, dev containers, remote SSH), and a markdown guide ships in-repo explaining how to register the AzDO OAuth application end-to-end for both the project maintainer and end users on locked-down tenants.

## What's New

<!-- Finalised in step 11 once /speckit-implement completes. Placeholder bullets reflect the planned phases. -->

- **[area]**: [what changed and why]

## New Libraries / Dependencies *(optional — remove section if none)*

<!-- Plan calls for zero new runtime dependencies (Constitution IV / V). Remove this section in step 11 if that holds. -->

## Breaking Changes *(optional — remove section if none)*

<!-- `azdo auth login` with no flags previously prompted for a PAT. Post-feature it opens the browser. Deliberate behaviour change driven by FR-012 (owner-approved). Documented in step 11. -->

## Testing

<!-- Finalised in step 11. Plan enumerates: unit (PKCE, callback validation, config, refresh single-flight, command flag routing, credential envelope, audit events, headless detection, device-code, scope-table parity), integration (loopback round-trip, device-code round-trip, PAT regression, multi-org isolation). -->

## Notes *(optional — remove section if none)*

<!-- DEFAULT_OAUTH_CLIENT_ID ships as a placeholder until the maintainer registers the project's shared Entra app following docs/oauth-app-registration.md (FR-015, T046–T048). The override path (AZDO_OAUTH_CLIENT_ID env / config) works without that GUID being filled in. -->
