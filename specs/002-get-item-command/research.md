# Research: Get Work Item Command

**Feature**: 002-get-item-command | **Date**: 2026-03-05

## Azure DevOps REST API

**Decision**: Use the Work Items - Get Work Item REST API v7.1 with direct `fetch()` calls.

**Endpoint**:
```
GET https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}?api-version=7.1
```

**Authentication**: Basic auth with empty username and PAT as password.
```
Authorization: Basic {Base64(":pat-token")}
```

**Response shape**: JSON with `id`, `rev`, `fields` object, `_links`, `url`. Fields include `System.Title`, `System.State`, `System.WorkItemType`, `System.AssignedTo`, `System.Description`, etc.

**Required PAT scope**: `vso.work` (Work Items read).

**Rationale**: API v7.1 is the latest stable version. Direct fetch() (built into Node 18+) avoids the heavy `azure-devops-node-api` SDK, aligning with the constitution's minimal dependency principle.

**Alternatives considered**:
- `azure-devops-node-api` SDK: Large dependency, overkill for single endpoint
- API v7.2: Preview only, v7.1 is safer for compatibility

## Windows Credential Manager

**Decision**: Use `@napi-rs/keyring` for credential storage.

**Rationale**: The keytar package was archived in December 2022. `@napi-rs/keyring` is its community-accepted successor, using Rust (napi-rs) instead of C++ (node-gyp). It ships prebuilt binaries for Windows x64/ARM64, macOS, and Linux - no compilation needed. The API is keytar-compatible.

**API**:
```typescript
import { getPassword, setPassword, deletePassword } from '@napi-rs/keyring';
await setPassword('azdo-cli', 'pat', patValue);
const pat = await getPassword('azdo-cli', 'pat');
```

**Alternatives considered**:
- `keytar`: Archived, requires node-gyp build toolchain
- Encrypted config file: Less secure, but zero native dependencies
- `wincredmgr`: Windows-only, low adoption, uncertain maintenance

## Git Remote URL Parsing

**Decision**: Support five Azure DevOps cloud URL formats via regex matching.

**Formats**:

| Format | Pattern |
|--------|---------|
| HTTPS (current) | `https://dev.azure.com/{org}/{project}/_git/{repo}` |
| HTTPS (legacy) | `https://{org}.visualstudio.com/{project}/_git/{repo}` |
| HTTPS (legacy + DefaultCollection) | `https://{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}` |
| SSH (current) | `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}` |
| SSH (legacy) | `{org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}` |

**Rationale**: All five formats are actively used in production. On-premises (TFS) format deferred.

**Alternatives considered**:
- Support only dev.azure.com: Would break users with legacy URLs
- On-premises support: Deferred, uncommon for cloud CLI tool

## Interactive PAT Prompt

**Decision**: Use Node.js built-in `readline` with `process.stdin.setRawMode(true)` for hidden input.

**Rationale**: Zero dependencies. ~25 lines of code. Aligns with constitution's minimal dependency principle. Only need a single password-style prompt.

**Key detail**: Must check `process.stdin.isTTY` before using `setRawMode()`. Non-TTY contexts fall back to plain readline (no masking).

**Alternatives considered**:
- `@inquirer/prompts`: Good DX, but adds dependency for single prompt
- `inquirer`: Heavy, overkill
- `password-prompt`: Last published 2019, unmaintained
