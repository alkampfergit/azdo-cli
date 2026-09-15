# PR Report: Surface Azure DevOps error bodies, pre-flight the composed PR description

**Branch**: `feature/037-api-error-surfacing`
**Date**: 2026-09-15
**Spec**: [specs/037-api-error-surfacing/spec.md](../../specs/037-api-error-surfacing/spec.md)

## Summary

Every Azure DevOps failure now tells you what Azure DevOps actually said. The
response body — which carries the real `message` / `typeKey` — was read for the
trace file and then dropped, so a 400 surfaced as `Error: Azure DevOps request
failed with HTTP_400.` and nothing else. It is now captured once, in
`fetchWithErrors`, and appended to whichever error is thrown for that response.
Separately, `pr open` measures the description it is about to send — your text
*plus* the repository PR template — against the documented 4000-character cap and
fails before the HTTP call with the full arithmetic, instead of letting the
server answer with an opaque 400 and no pull request.

Closes #95.

## What's New

- **`src/services/azdo-client.ts` — one capture point.** `fetchWithErrors` reads
  the body of every non-ok response exactly once (from a clone, so the caller's
  stream is untouched), renders a detail, and stashes it in a
  `WeakMap<Response, string>`. 401 → `AUTH_FAILED: <detail>`, 403 →
  `PERMISSION_DENIED: <detail>`. A new synchronous `httpError(response)` builds
  `HTTP_<status>: <detail>` for the 18 `!response.ok` throw sites across
  `azdo-client`, `pr-client`, `relations-client` and `pipeline-client` — so this
  improves every command group, not just `pr`.
- **Detail rendering.** `message`, plus `[typeKey]` or `[errorCode …]` when
  present; run through the existing `redactBody`; capped at 500 characters with
  an explicit `…(truncated)` marker; a body that will not parse as JSON falls
  back to its first 200 characters. An HTML body — the Entra sign-in page — is
  never echoed. The full body still goes to the trace file.
- **Sentinels are now prefixes, everywhere.** Twelve `=== 'AUTH_FAILED'` /
  `=== 'PERMISSION_DENIED'` comparisons across `pr.ts`, `pipeline.ts`,
  `relations.ts`, `upsert.ts`, `command-helpers.ts` and `pr-client.ts` became
  `isSentinel(...)` calls. Without this, appending a detail would have silently
  dropped the curated guidance *and* the `pr` exit code 4 — a regression, not an
  improvement. The curated line prints first, the server detail underneath it.
- **`pr open` description pre-flight.** `composeDescription` now returns its
  arithmetic (`providedChars`, `separatorChars`, `templateChars`,
  `templatePath`, `totalChars`) alongside the text, because the caller cannot
  measure the template contribution without repeating the whole template lookup.
  Over 4000 characters, the command fails before the create call:

  ```
  Error: description is 4172 characters (2299 provided + 2 separator + 1871 from the
  repository pull request template .azuredevops/pull_request_template.md), exceeding
  the Azure DevOps limit of 4000 characters. Shorten the description by at least 172
  characters.
  ```

  If the server rejects the create with a 400 anyway, the same arithmetic is
  appended to the server's own message as a backstop.
- **Docs.** `docs/commands.md` documents the composed-description limit under
  `pr open` and the new enriched error output under the exit-code section.

## New Libraries / Dependencies

None.

## Breaking Changes

None to the CLI surface. Error *messages* gain a suffix, and the sentinel
strings the code branches on stay valid as prefixes. Exit codes, curated
wording (`BAD_REQUEST:` / `CREATE_REJECTED:` / `UPDATE_REJECTED:` /
`NOT_FOUND` / `DESCRIPTION_REQUIRED`), and the `NOT_FOUND | url=… | body=…`
shape are unchanged.

## Testing

- **Unit (new, `tests/unit/api-error-surfacing.test.ts`)**: the detail-rendering
  table (message, message+typeKey, typeKey-only, numeric `errorCode`, non-JSON,
  empty, HTML, HTML mislabelled as JSON), 500-char truncation, 200-char raw cap,
  redaction, newline collapsing, `httpError` fallback, 401/403/400/500 through
  `fetchWithErrors`, the curated `BAD_REQUEST` still winning on a 400 it already
  handles, the caller's body stream surviving the capture, and the command layer
  printing curated guidance + detail with exit code 4.
- **Unit (extended, `tests/unit/pr-client.test.ts`)**: pre-flight over the limit
  (asserting **zero** POST calls), over the limit with no template, exactly 4000
  characters accepted, and the 400 backstop carrying the arithmetic.
- **Unit (extended, `tests/unit/helpers/command-test-utils.ts`)**: every command
  suite using the shared error-case table now also proves a detail-carrying
  sentinel keeps its curated message.
- **Gate**: `npm test && npm run lint` — 1084 passed, 128 skipped, lint clean.

## Notes

- The 4000 cap is documented on the **update** operation, not create; the create
  page lists `description` as a plain string with no `maxLength`. Same field,
  same server-side validation — recorded as an inference in
  [research.md](./research.md), with the enriched 400 handler as the backstop.
  Verified via the Microsoft Learn MCP server and cross-checked on Context7
  (Constitution Principle VI).
- **Title length stays unchecked**: no `maxLength` is documented on either page.
- An earlier note on the issue claimed PR *list* responses truncate
  `description` to 400 characters. That could not be confirmed on Learn (the
  related `maxCommentLength` parameter is documented as "Not used"), so it is
  deliberately **not** in the docs.
- The plan posted on the issue proposed making `fetchWithErrors` throw on every
  non-ok status. Reconnaissance showed that would have made the six curated
  `status === 400` branches in `azdo-client.ts` unreachable and silently changed
  their wording — hence the capture-and-format split instead. Same single change
  point, no regression.
- Out of scope, as agreed: `pr update` (#96), `pr abandon` (#97), `auth token`
  (#98), and a typed `AzdoApiError` model.
