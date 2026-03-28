# Integration Tests

These tests exercise the **azdo-cli** service layer against a real Azure DevOps instance. They are kept separate from the unit test suite so that CI can run unit tests without requiring credentials.

## Running

```bash
# Unit tests only (no credentials needed)
npm test

# Integration tests (credentials required)
npm run test:integration

# Full suite including GNOME Keyring setup for headless environments
npm run test:integration:full
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AZDO_PAT` (or `AZDO_PATH`) | Yes | Personal Access Token with **read/write** access to Work Items |
| `AZDO_ORG` | Yes | Azure DevOps organization name (e.g. `mycompany`) |
| `AZDO_PROJECT` | Yes | Azure DevOps project name (e.g. `MyProject`) |
| `AZDO_REPO` | PR tests only | Git repository name inside the project |
| `AZDO_PR_ID` | PR comment tests only | An existing pull request ID for thread/comment assertions |

Variables are resolved from: (1) shell environment, then (2) a `.env` file in the **parent directory** of the repo (e.g. `/workspaces/.env`).

```bash
export AZDO_PAT=your-personal-access-token
export AZDO_ORG=your-organization
export AZDO_PROJECT=your-project
export AZDO_REPO=your-repo          # optional, for PR tests
export AZDO_PR_ID=42                # optional, for PR comment tests
npm run test:integration
```

> **Skip behaviour** — each test suite uses `describe.skipIf` and is silently skipped when the required variables are absent. Running `npm run test:integration` without credentials will show all new tests as skipped rather than failing.

> **PR tests** require a PAT with **Code (Read)** scope. If the PAT lacks it, PR tests skip gracefully with a warning.

---

## Test Coverage Summary

### Service functions covered

| Service file | Function | Test file(s) |
|---|---|---|
| `azdo-client.ts` | `createWorkItem` | `work-items.test.ts`, `upsert.test.ts` |
| `azdo-client.ts` | `getWorkItem` | `work-items.test.ts`, `upsert.test.ts` |
| `azdo-client.ts` | `getWorkItemFieldValue` | `work-items.test.ts`, `md-fields.test.ts`, `upsert.test.ts` |
| `azdo-client.ts` | `getWorkItemFields` | `work-items.test.ts`, `list-fields.test.ts` |
| `azdo-client.ts` | `applyWorkItemPatch` | `work-items.test.ts`, `md-fields.test.ts`, `upsert.test.ts` |
| `azdo-client.ts` | `updateWorkItem` | `work-items.test.ts`, `md-fields.test.ts` |
| `pr-client.ts` | `listPullRequests` | `pull-requests.test.ts` |
| `pr-client.ts` | `getPullRequestThreads` | `pull-requests.test.ts` |
| `task-document.ts` | `parseTaskDocument` | `upsert.test.ts` |
| `task-document.ts` | `resolveFieldName` | `upsert.test.ts` |
| `md-convert.ts` | `toMarkdown` | `md-fields.test.ts` |
| `md-convert.ts` | `htmlToMarkdown` | `md-fields.test.ts` |
| `html-detect.ts` | `isHtml` | `md-fields.test.ts` |
| `credential-store.ts` | `storePat` / `getPat` / `deletePat` | `credential-store.test.ts` |
| `list-fields.ts` (cmd) | `formatFieldList` | `list-fields.test.ts` |

### Not covered (by design)

| Function | Reason |
|---|---|
| `openPullRequest` | Mutating (creates real PRs); intentionally read-only test suite |
| `resolvePat` | Tested indirectly by every suite via env var path |
| `resolveContext` | Tested indirectly; depends on config/git state |
| `config-store.*` | File-based, not Azure DevOps dependent; covered by unit tests |
| `authHeaders` / `fetchWithErrors` | Internal utilities used by every API call |
| `git-remote.*` | Requires specific git remote state; covered by unit tests |
| `command-helpers.*` | Call `process.exit`; covered by unit tests with mocking |
| `promptForPat` | Requires interactive TTY |

---

## Test Files

### `credential-store.test.ts`

Tests the OS keychain integration (`@napi-rs/keyring`) against the real credential store. Requires GNOME Keyring daemon (see `scripts/setup-keyring.sh`).

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns `null` when no PAT is stored | Keychain is empty before any write |
| 2 | Stores and retrieves a PAT | Round-trip write then read |
| 3 | Overwrites an existing PAT | Second write replaces first |
| 4 | Deletes the PAT and returns `true` | Entry is removed from keychain |
| 5 | Returns `null` after deletion | Key is gone after removal |
| 6 | Platform-appropriate result when deleting non-existent PAT | Windows `false`; macOS/Linux `true` |

---

### `work-items.test.ts`

End-to-end CRUD tests for Azure DevOps Work Items. Creates one **Task** (titled `work-items: CRUD operations on Task work items`) in `beforeAll`, closed in `afterAll`.

#### `createWorkItem` (3 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns a positive numeric work item ID | API assigns a valid numeric ID |
| 2 | Returns the revision number starting at 1 | `rev` field is >= 1 on creation |
| 3 | Stores the provided title in the fields map | `fields['System.Title']` matches the input |

#### `getWorkItem` (10 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns the work item with the correct ID | `item.id` matches `createdId` |
| 2 | Returns the correct title | `item.title` matches the title set at creation |
| 3 | Returns `"Task"` as the work item type | `item.type` is `"Task"` |
| 4 | Returns a non-empty state string | `item.state` is a non-empty string |
| 5 | Returns a non-empty `areaPath` string | `item.areaPath` is non-empty |
| 6 | Returns a non-empty `iterationPath` string | `item.iterationPath` is non-empty |
| 7 | Returns a URL pointing to the Azure DevOps web UI | `item.url` starts with `https://dev.azure.com/` |
| 8 | Returns `null` for `assignedTo` on an unassigned item | Unassigned items have `null` assignee |
| 9 | Throws `NOT_FOUND` for a non-existent work item ID | Error propagation for unknown ID `999999999` |
| 10 | Returns extra fields when requested | `extraFields` is non-null when `extraFields` option is passed |

#### `getWorkItemFieldValue` (3 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns the correct title for `System.Title` | Single-field fetch returns the right value |
| 2 | Returns `null` for an empty field | Unset fields return `null` |
| 3 | Throws `NOT_FOUND` for a non-existent work item ID | Error propagation for unknown ID |

#### `getWorkItemFields` (4 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns a non-empty fields map | API returns at least one field |
| 2 | Includes `System.Title` in the fields map | Standard field is present with correct value |
| 3 | Includes `System.WorkItemType` in the fields map | Type field is `"Task"` |
| 4 | Includes `System.State` in the fields map | State field is a non-empty string |

#### `applyWorkItemPatch` (2 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Updates `System.Title` and returns the new revision | Patch succeeds; `rev` increments; title changes |
| 2 | Throws `NOT_FOUND` when patching a non-existent item | Error propagation for unknown ID |

#### `updateWorkItem` (1 test)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns an `UpdateResult` with the correct field name and value | `fieldName` and `fieldValue` match the patch |

#### `authentication` (1 test)

| # | Test | What it verifies |
|---|---|---|
| 1 | Throws an error when using an invalid PAT | Wrong credentials produce an error |

---

### `md-fields.test.ts`

Tests markdown/HTML field round-trips. Creates one **Task** (titled `md-fields: HTML and Markdown field round-trip tests`) in `beforeAll`.

#### `updateWorkItem` with markdown content (2 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Accepts markdown content for `System.Description` | Markdown format hint is accepted |
| 2 | Returns the stored content in subsequent reads | Value persists after write |

#### `updateWorkItem` with HTML content (4 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Accepts HTML content for `System.Description` | Raw HTML is stored without error |
| 2 | Content can be converted to markdown without error | `toMarkdown()` does not throw on real AzDo HTML |
| 3 | Converted markdown contains recognisable heading text | Heading survives HTML to MD conversion |
| 4 | Converted markdown contains list items | List items survive conversion |

#### `isHtml` on real API data (2 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Detects HTML content returned by the API | `isHtml()` returns `true` for real AzDo HTML |
| 2 | `htmlToMarkdown` converts real API HTML to clean markdown | Tags are stripped; text content is preserved |

#### Clearing `System.Description` (1 test)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns `null` after the field is removed | `remove` patch operation empties the field |

---

### `list-fields.test.ts`

Tests reading the complete field map and the command-level formatting helper. Creates one **Task** (titled `list-fields: verify complete field schema for a Task`) in `beforeAll`.

#### `getWorkItemFields` (11 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns a non-empty fields object | At least one field is returned |
| 2 | Includes `System.Title` with the correct value | Title matches creation value |
| 3 | Includes `System.WorkItemType` set to `"Task"` | Type field is correct |
| 4 | Includes `System.State` as a non-empty string | State field is readable |
| 5 | Includes `System.AreaPath` as a non-empty string | Area path is present |
| 6 | Includes `System.IterationPath` as a non-empty string | Iteration path is present |
| 7 | Includes `System.Id` matching the created item ID | ID field matches |
| 8 | Includes `System.Rev` as a positive integer | Revision is a positive integer |
| 9 | Includes at least 10 distinct fields | API returns a rich set of metadata |
| 10 | All field keys follow the `Namespace.FieldName` pattern | All keys contain a dot |
| 11 | Throws `NOT_FOUND` for a non-existent work item | Error propagation for unknown ID |

#### `formatFieldList` (5 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns a non-empty formatted string | Helper produces output |
| 2 | Contains the work item title in the output | Title is visible |
| 3 | Contains `System.Title` as a field key | Key appears in output |
| 4 | Contains `System.State` as a field key | Key appears in output |
| 5 | Does not include `null` or `undefined` strings | No literal null/undefined in output |

---

### `upsert.test.ts`

Tests the upsert flow: parsing task documents then creating/updating **User Story** work items. Each work item title describes the test being executed.

#### `resolveFieldName` (8 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Resolves `"title"` to `System.Title` | Alias resolution works |
| 2 | Resolves `"description"` to `System.Description` | Alias resolution |
| 3 | Resolves `"acceptance criteria"` to `Microsoft.VSTS.Common.AcceptanceCriteria` | Multi-word alias |
| 4 | Resolves `"priority"` to `Microsoft.VSTS.Common.Priority` | Alias resolution |
| 5 | Resolves `"tags"` to `System.Tags` | Alias resolution |
| 6 | Passes through a fully-qualified reference name | `System.AreaPath` stays as-is |
| 7 | Returns `null` for an unknown alias | Unknown names are rejected |
| 8 | Returns `null` for an empty string | Empty input is rejected |

#### `parseTaskDocument` (5 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Parses YAML front-matter with scalar fields | Title + priority parsed correctly |
| 2 | Parses rich-text sections (Description, Acceptance Criteria) | `##` headings produce `rich-text` fields |
| 3 | Parses a combined front-matter + rich-text document | Both scalar and rich-text fields in one doc |
| 4 | Treats `null`/empty/tilde values as clear operations | `~` value produces `op: 'clear'` |
| 5 | Throws on duplicate fields | Duplicate `title` produces an error |
| 6 | Throws on malformed front-matter | Missing closing `---` produces an error |

#### Create User Story via upsert flow (5 tests)

Work item: `upsert: create User Story from task document`

| # | Test | What it verifies |
|---|---|---|
| 1 | Creates a User Story from a parsed task document | ID > 0; title matches |
| 2 | Created User Story has WorkItemType `"User Story"` | Type is correct |
| 3 | Created User Story has priority 2 | Priority field is set |
| 4 | Created User Story has a non-empty description | Rich-text section was stored |
| 5 | Created User Story has acceptance criteria | Second rich-text section was stored |

#### Update User Story via upsert flow (3 tests)

Work item: `upsert: update target — initial state` then `upsert: update target — after update`

| # | Test | What it verifies |
|---|---|---|
| 1 | Updates title and description from a task document | Patch succeeds; rev increments |
| 2 | Updated User Story reflects the new title | Title changed after patch |
| 3 | Updated User Story reflects the new description | Description changed after patch |

#### Clear fields via upsert flow (1 test)

Work item: `upsert: clear fields test`

| # | Test | What it verifies |
|---|---|---|
| 1 | Removes a field when the task document sets it to `~` | `remove` op clears the field |

#### User Story with tags (1 test)

Work item: `upsert: User Story with tags`

| # | Test | What it verifies |
|---|---|---|
| 1 | Creates a User Story with tags set from a task document | `System.Tags` contains both tags |

#### Markdown format hint (1 test)

Work item: `upsert: markdown format hint verification`

| # | Test | What it verifies |
|---|---|---|
| 1 | Sets `multilineFieldsFormat` for Description | Markdown hint is included in operations |

---

### `pull-requests.test.ts`

Read-only tests against the Azure DevOps Git API. Requires `AZDO_REPO`. No PRs are created or modified. Skips gracefully if PAT lacks Code (Read) scope.

#### `listPullRequests` (5 tests)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns an array for a non-existent branch | API reachable; empty list, not error |
| 2 | Returned PR objects have the expected shape | All fields present and typed |
| 3 | Filters by `status=active` | Status filter applied server-side |
| 4 | Throws an error with invalid PAT | Wrong credentials fail |
| 5 | Throws an error for a non-existent repository | Unknown repo fails |

#### `getPullRequestThreads` (5 tests, requires `AZDO_PR_ID`)

| # | Test | What it verifies |
|---|---|---|
| 1 | Returns an array of active comment threads | API returns a list |
| 2 | Each thread has a numeric `id` and valid `status` | Shape matches `ActiveCommentThread` |
| 3 | Each thread contains at least one non-deleted comment | Comment filtering works |
| 4 | Throws `NOT_FOUND` for a non-existent PR ID | Error propagation |
| 5 | Throws `AUTH_FAILED` with invalid PAT | Wrong credentials fail |
