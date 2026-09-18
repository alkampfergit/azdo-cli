# Implementation Plan: Surface Azure DevOps error bodies, pre-flight the composed PR description

**Branch**: `feature/037-api-error-surfacing` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/037-api-error-surfacing/spec.md`, GitHub issue #95

## Summary

Capture the Azure DevOps error body once, in `fetchWithErrors`, and make it
available to every error thrown for that response — so `AUTH_FAILED`,
`PERMISSION_DENIED` and all 18 `HTTP_<status>` throws carry the server's own
`message`/`typeKey` instead of a bare status. Separately, make `pr open` measure
the composed description (operator text + separator + repository PR template)
against the documented 4000-character cap and fail before the HTTP call with the
full arithmetic, keeping an enriched 400 handler as the backstop.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+)
**Primary Dependencies**: commander.js, native `fetch` — **no new dependencies**
**Storage**: N/A
**Testing**: vitest (`tests/unit`, `tests/integration`)
**Target Platform**: Node CLI (Windows / macOS / Linux)
**Project Type**: single-project CLI
**Constraints**: no change to existing curated error wording or to `pr` exit codes; body read must not consume the stream the caller still needs
**Scale/Scope**: 4 service modules, 4 command modules, 2 docs pages, 2 new/extended test files

## Constitution Check

| Principle | Status |
|---|---|
| I. CLI-First Design | PASS — no new commands; error output stays on stderr, exit codes unchanged |
| II. TypeScript Strictness | PASS — no `any`; `unknown` + type guards when parsing the error body |
| III. Single Responsibility | PASS — enrichment lives in the shared HTTP layer, not per command |
| IV. npm Distribution | PASS — no new dependencies |
| V. Simplicity | PASS — one capture point plus one synchronous formatter; no error-class hierarchy (Q2 = A) |
| VI. ADO API Research | PASS — 4000 verified via Microsoft Learn MCP and cross-checked via Context7; see [research.md](./research.md) §1 |

No violations; Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/037-api-error-surfacing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── error-surfacing.md
├── tasks.md
└── pr-report.md
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── azdo-client.ts        # fetchWithErrors: capture body + WeakMap; new httpError(); 9 throw sites
│   ├── pr-client.ts          # httpError() at 4 sites; composeDescription arithmetic; pre-flight; 400 backstop
│   ├── relations-client.ts   # httpError() at 3 sites
│   ├── pipeline-client.ts    # httpError() at 2 sites
│   ├── command-helpers.ts    # sentinel prefix match + detail line
│   └── trace-writer.ts       # unchanged (redactBody reused)
├── commands/
│   ├── pr.ts                 # sentinel prefix match + detail line; DESCRIPTION_TOO_LONG handler
│   ├── pipeline.ts           # sentinel prefix match + detail line
│   ├── relations.ts          # sentinel prefix match + detail line
│   └── upsert.ts             # sentinel prefix match in the write-error predicates
└── types/
    └── pull-request.ts       # ComposedDescription shape

tests/unit/
├── api-error-surfacing.test.ts   # new
└── pr-client.test.ts             # extended: description pre-flight

docs/
└── commands.md               # template contribution, 4000 write cap, 400 read truncation, enriched errors
```

**Structure Decision**: existing flat `src/services` + `src/commands` layout; no
new directories.

## Phase 1 design

### 1. Body capture (`src/services/azdo-client.ts`)

- `const failureDetails = new WeakMap<Response, string>()`.
- In `fetchWithErrors`, after the trace block and before the status branches:
  when `!response.ok`, obtain the body text (reuse the text already read for the
  trace when a writer is active, else `await response.clone().text()`), render a
  detail via `describeFailureBody(bodyText, contentType)`, and store it in the
  WeakMap keyed by the response. The original response is returned untouched.
- `describeFailureBody`:
  1. empty/whitespace body → `null`;
  2. `text/html` content type **or** a body starting with `<` → `null` (FR-004);
  3. `redactBody(body)` first, then `JSON.parse`;
  4. compose from `message`, then `typeKey` / `errorCode` in brackets;
  5. unparseable → first 200 characters of the redacted raw body;
  6. truncate the composed detail at 500 characters, appending `…(truncated)`.
- 401 → `AUTH_FAILED[: detail]`; 403 → `PERMISSION_DENIED[: detail]`; 404
  unchanged; HTML guard unchanged.
- New export `httpError(response: Response): Error` — synchronous, returns
  `new Error('HTTP_<status>[: detail]')` from the WeakMap, falling back to the
  bare sentinel.

### 2. Throw-site migration

All 18 ``throw new Error(`HTTP_${response.status}`)`` become
`throw httpError(response)` (`azdo-client.ts` ×9, `pr-client.ts` ×4,
`relations-client.ts` ×3, `pipeline-client.ts` ×2). The six curated
`status === 400` branches in `azdo-client.ts` are untouched and still run first.

### 3. Sentinel prefix matching

`=== 'AUTH_FAILED'` → `.startsWith('AUTH_FAILED')` (same for
`PERMISSION_DENIED`) at the 12 sites listed in [research.md](./research.md) §5.
A shared `sentinelDetail(message, sentinel)` helper returns the text after
`': '` so handlers can print the curated line first and the detail beneath it.

### 4. Description pre-flight (`src/services/pr-client.ts`)

- `MAX_PR_DESCRIPTION_CHARS = 4000` with the Learn URL in a comment.
- `composeDescription` returns `ComposedDescription | null`:
  `{ text, providedChars, separatorChars, templateChars, templatePath, totalChars }`.
- `openPullRequest` rejects with `DESCRIPTION_TOO_LONG: <message>` when
  `totalChars > MAX_PR_DESCRIPTION_CHARS`, **before** building the payload or
  issuing the POST.
- The create POST is wrapped: an `HTTP_400…` failure is rethrown with the same
  arithmetic appended, so the backstop reports it even if the server's limit
  ever differs.

### 5. Docs

`docs/commands.md`, `pr open` section: the template is appended to
`--description` (with a blank-line separator), and the composed text must stay
within 4000 characters. (An earlier draft also promised a 400-character
read-side truncation on PR **list** responses; `research.md` could not confirm
that number against Learn, so it is not documented — see the decision there.)

## Testing strategy

- `tests/unit/api-error-surfacing.test.ts` — enrichment: JSON `message`,
  `message` + `typeKey`, `typeKey`-only, non-JSON body (200-char prefix),
  HTML body (no echo), >500-char truncation, redaction of a sensitive field,
  401/403 detail plus curated handler output and exit code 4, curated
  `BAD_REQUEST:` still winning on 400.
- `tests/unit/pr-client.test.ts` — pre-flight under / exactly at / over the
  limit, with and without a template; no `fetch` create call on rejection; the
  400 backstop carrying the arithmetic.
- Full gate: `npm test && npm run lint`.
