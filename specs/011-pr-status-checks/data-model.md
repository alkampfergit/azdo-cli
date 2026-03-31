# Data Model: Pull Request Status Checks

**Date**: 2026-03-31
**Feature**: 011-pr-status-checks

## Entities

### PullRequestCheck

Represents one Azure DevOps pull request status check.

- **id**: `number` — Azure DevOps status identifier
- **state**: `string` — status state such as `pending`, `succeeded`, `failed`, or `error`
- **name**: `string` — display name derived from status context
- **description**: `string | null` — detail text returned by Azure DevOps
- **targetUrl**: `string | null` — optional deep link for the check
- **createdBy**: `string | null` — display name of the check publisher
- **createdAt**: `string | null` — creation timestamp
- **updatedAt**: `string | null` — last update timestamp

Validation and rules:
- Exclude checks where state is `notApplicable` or `notSet`.
- Preserve `description` as returned without rewriting.
- `name` must always be non-empty after mapping; fall back to `Status #<id>` if context is missing.

### PullRequestStatusPullRequest

Status-command pull request entity enriched with status checks.

- **id**: `number`
- **title**: `string`
- **repository**: `string`
- **sourceRefName**: `string`
- **targetRefName**: `string`
- **status**: `string`
- **createdBy**: `string | null`
- **url**: `string`
- **checks**: `PullRequestCheck[]`

Rules:
- `checks` belongs only to this pull request.
- `checks` defaults to an empty array when no checks are returned.
- The existing base pull request entity used by other commands remains unchanged.

### PullRequestStatusResult

Represents the full `azdo pr status` response.

- **branch**: `string`
- **repository**: `string`
- **pullRequests**: `PullRequestStatusPullRequest[]`

Rules:
- Existing top-level shape remains stable.
- Each pull request entry includes `checks`, even when empty.

## Relationships

- One **PullRequestStatusResult** contains zero or more **PullRequestStatusPullRequest** entities.
- One **PullRequestStatusPullRequest** contains zero or more **PullRequestCheck** entities.
