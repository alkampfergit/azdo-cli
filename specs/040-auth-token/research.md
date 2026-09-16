# Research: `azdo auth token`

**Feature**: 040-auth-token | **Date**: 2026-09-16

## Constitution Principle VI — Azure DevOps API research

Source consulted: **Microsoft Learn MCP server** (`microsoft_docs_search`,
query: *"Azure DevOps REST API authenticate with personal access token Basic
auth header vs OAuth bearer token"*).

This feature adds **no** Azure DevOps REST call — it prints a credential the CLI
has already resolved. The research below is what the documentation says about
how that credential is *used*, because the answer determines one design decision
(FR-007) and the content of the docs page.

### R-1 — The two credential kinds need two different headers

| Credential | Header | Learn source |
| --- | --- | --- |
| PAT | `Authorization: Basic <base64(":" + pat)>` — `curl -u :{PAT} …` | [Use personal access tokens](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops) |
| Entra OAuth access token | `Authorization: Bearer <access_token>` | [Use Azure DevOps OAuth 2.0](https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/azure-devops-oauth?view=azure-devops), [Tokens](https://learn.microsoft.com/rest/api/azure/devops/tokens/?view=azure-devops-rest-7.1) |

An exported token is therefore **not** self-describing at the point of use: the
caller has to know which of the two it holds before it can build a request.

### R-2 — Tokens are opaque; callers must not inspect them

From [Authentication methods for Azure DevOps integrations](https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops#frequently-asked-questions-faq):

> Treat tokens as opaque — pass them in authorization headers, but don't decode
> or inspect them. […] Starting summer 2025, Azure DevOps is further encrypting
> authentication tokens, which means clients can't read token payloads.

**Consequence for open decision 2 of issue #98:** "let the caller work out the
kind from the token" is not merely inconvenient, it is documented as
unsupported. The CLI must say which kind it handed over. It says so on **stderr**
(FR-007) so stdout stays exactly the token (FR-001), and only when stderr is a
TTY so machine callers see a byte-for-byte silent stderr.

### R-3 — Precedent for the export itself

Microsoft ships the same escape hatch for the Azure CLI:
`az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798
--query "accessToken" --output tsv`, documented in
[Authentication with Azure Repos](https://learn.microsoft.com/azure/devops/repos/git/auth-overview?view=azure-devops#authentication-mechanisms)
as the way to obtain a token for ad-hoc Git/REST operations — a bare token on
stdout, no gate, no prompt. `gh auth token` behaves identically.

**Consequence for open decision 1 of issue #98:** an ungated command is the
established shape for exactly this job (FR-005).

### R-4 — Refresh before export

`499b84ac-…` access tokens are short-lived; the docs' own flow is "refresh
expired access tokens" before use. The CLI already does this transparently
(`refreshIfNeeded`, 60-second skew margin), so the export path gets it for free
by reusing the shared resolution ladder (NFR-002) rather than reading the vault
directly — reading the vault directly would be the one implementation that could
hand out a dead token (FR-003).

## Decision log

| # | Decision | Alternative rejected |
| --- | --- | --- |
| D-1 | Ungated: no flag, no prompt, no TTY check on the export itself. | `--yes` / confirmation — breaks US-2 scripting, and the credential is already readable by any process running as this user. |
| D-2 | Credential description on stderr, TTY-gated. | Silence (caller cannot know Basic vs Bearer — R-2); stdout (violates FR-001); a flag (surface for something a human always wants and a script never parses). |
| D-3 | No `--json`. | A `{ "token": … }` envelope — issue #98 forbids the token in `--json` output, which would leave an envelope with nothing in it. |
| D-4 | Reuse the single resolution ladder; refactor `resolveCredential()` to sit on top of the new metadata-carrying `exportCredential()`. | A fourth private resolver in `services/auth.ts` — guaranteed drift between the token `azdo` sends and the token it prints. |
