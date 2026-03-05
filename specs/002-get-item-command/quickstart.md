# Quickstart: Get Work Item Command

**Feature**: 002-get-item-command | **Date**: 2026-03-05

## Prerequisites

- Node.js 18+ (LTS)
- npm
- An Azure DevOps organization with at least one work item
- A PAT with `vso.work` (Work Items read) scope

## Setup

```bash
# Clone and install
git checkout 002-get-item-command
npm install

# Build
npm run build
```

## Usage

### With explicit org/project and PAT

```bash
export AZDO_PAT="your-pat-token"
azdo get-item 12345 --org myorg --project myproject
```

### With git remote auto-detection

From a directory with an Azure DevOps git remote:

```bash
export AZDO_PAT="your-pat-token"
azdo get-item 12345
```

### With interactive PAT prompt

Without `AZDO_PAT` set and no stored credential:

```bash
azdo get-item 12345 --org myorg --project myproject
# CLI prompts: "Enter your Azure DevOps PAT: ****"
# PAT is stored in Windows Credential Manager for future use
```

### Short output

```bash
azdo get-item 12345 --short
```

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Type check
npm run typecheck

# Build and test locally
npm run build && node dist/index.js get-item 12345 --org myorg --project myproject
```

## Key Files

| File | Purpose |
|------|---------|
| `src/commands/get-item.ts` | Command definition and handler |
| `src/services/azdo-client.ts` | Azure DevOps REST API client |
| `src/services/auth.ts` | PAT resolution chain |
| `src/services/git-remote.ts` | Git remote URL parser |
| `src/services/credential-store.ts` | Windows Credential Manager wrapper |
| `src/types/work-item.ts` | TypeScript type definitions |
