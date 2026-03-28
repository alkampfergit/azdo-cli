# Integration Tests

These tests exercise the **azdo-cli** service layer against a real Azure DevOps instance. They are kept separate from the unit test suite so that CI can run unit tests without requiring credentials.

## Running

```bash
# Unit tests only (no credentials needed)
npm test

# Integration tests (credentials required)
npm run test:integration
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AZDO_PAT` | Yes | Personal Access Token with **read/write** access to Work Items |
| `AZDO_ORG` | Yes | Azure DevOps organization name (e.g. `mycompany`) |
| `AZDO_PROJECT` | Yes | Azure DevOps project name (e.g. `MyProject`) |
| `AZDO_REPO` | PR tests only | Git repository name inside the project |
| `AZDO_PR_ID` | PR comment tests only | An existing pull request ID for thread/comment assertions |

Set them in your shell before running:

```bash
export AZDO_PAT=your-personal-access-token
export AZDO_ORG=your-organization
export AZDO_PROJECT=your-project
export AZDO_REPO=your-repo          # optional, for PR tests
export AZDO_PR_ID=42                # optional, for PR comment tests
npm run test:integration
```

> **Skip behaviour** — each test suite uses `describe.skipIf` and is silently skipped when the required variables are absent. Running `npm run test:integration` without credentials will show all new tests as skipped (`↓`) rather than failing.

---

## Test Files

### `credential-store.test.ts`

Tests the OS keychain integration (`@napi-rs/keyring`) against the real credential store of the host machine.

| Test | What it verifies |
|---|---|
| Returns `null` when no PAT is stored | Keychain is empty before any write |
| Stores and retrieves a PAT | Round-trip write → read |
| Overwrites an existing PAT | Second write replaces first |
| Deletes the PAT and returns `true` | Entry is removed from keychain |
| Returns `null` after deletion | Key is gone after removal |
| Platform-appropriate result when deleting non-existent PAT | Windows returns `false`; macOS/Linux return `true` |

---

### `work-items.test.ts`

End-to-end CRUD tests for Azure DevOps Work Items. A fresh **Task** item (titled `[azdo-cli-test] …`) is created in `beforeAll` and closed in `afterAll`.

#### `createWorkItem`

| Test | What it verifies |
|---|---|
| Returns a positive numeric work item ID | API assigns a valid numeric ID |
| Returns the revision number starting at 1 | `rev` field is ≥ 1 on creation |
| Stores the provided title in the fields map | `fields['System.Title']` matches the input |

#### `getWorkItem`

| Test | What it verifies |
|---|---|
| Returns the work item with the correct ID | `item.id` matches `createdId` |
| Returns the correct title | `item.title` matches the title set at creation |
| Returns `"Task"` as the work item type | `item.type` is `"Task"` |
| Returns a non-empty state string | `item.state` is a non-empty string |
| Returns a non-empty `areaPath` string | `item.areaPath` is non-empty |
| Returns a non-empty `iterationPath` string | `item.iterationPath` is non-empty |
| Returns a URL pointing to the Azure DevOps web UI | `item.url` starts with `https://dev.azure.com/` |
| Returns `null` for `assignedTo` on an unassigned item | Unassigned items have `null` assignee |
| Throws `NOT_FOUND` for a non-existent work item ID | Error propagation from API for unknown ID `999999999` |
| Returns extra fields when requested | `extraFields` is non-null when `extraFields` option is passed |

#### `getWorkItemFieldValue`

| Test | What it verifies |
|---|---|
| Returns the correct title for `System.Title` | Single-field fetch returns the right value |
| Returns `null` for an empty field (`System.Description` on a new item) | Unset fields return `null` |
| Throws `NOT_FOUND` for a non-existent work item ID | Error propagation for unknown ID |

#### `getWorkItemFields`

| Test | What it verifies |
|---|---|
| Returns a non-empty fields map | API returns at least one field |
| Includes `System.Title` in the fields map | Standard field is present with correct value |
| Includes `System.WorkItemType` in the fields map | Type field is `"Task"` |
| Includes `System.State` in the fields map | State field is a non-empty string |

#### `applyWorkItemPatch`

| Test | What it verifies |
|---|---|
| Updates `System.Title` and returns the new revision | Patch succeeds; `rev` increments; title changes |
| Throws `NOT_FOUND` when patching a non-existent item | Error propagation for unknown ID |

#### `updateWorkItem`

| Test | What it verifies |
|---|---|
| Returns an `UpdateResult` with the correct field name and updated value | `fieldName` and `fieldValue` match the patch |

#### `authentication`

| Test | What it verifies |
|---|---|
| Throws `AUTH_FAILED` when using an invalid PAT | Wrong credentials produce `AUTH_FAILED` error |

---

### `md-fields.test.ts`

Tests markdown/HTML field round-trips. A fresh Task is created in `beforeAll`.

#### `updateWorkItem` — markdown content

| Test | What it verifies |
|---|---|
| Accepts markdown content for `System.Description` and returns an `UpdateResult` | Markdown format hint `multilineFieldsFormat` is accepted |
| Returns the stored content in subsequent `getWorkItemFieldValue` calls | Value persists after write |

#### `updateWorkItem` — HTML content

| Test | What it verifies |
|---|---|
| Accepts HTML content for `System.Description` | Raw HTML is stored without error |
| Returns content that can be converted to markdown without error | `toMarkdown()` does not throw on real AzDo-transformed HTML |
| Converted markdown contains recognisable heading text | Heading content survives the HTML → Markdown conversion |
| Converted markdown contains list items | List items survive the HTML → Markdown conversion |

#### Clearing `System.Description`

| Test | What it verifies |
|---|---|
| Returns `null` from `getWorkItemFieldValue` after the field is removed | `remove` patch operation empties the field |

---

### `list-fields.test.ts`

Tests reading the complete field map for a work item and the command-level formatting helper. A fresh Task is created in `beforeAll`.

#### `getWorkItemFields`

| Test | What it verifies |
|---|---|
| Returns a non-empty fields object | At least one field is returned |
| Includes `System.Title` with the correct value | Title field matches creation value |
| Includes `System.WorkItemType` set to `"Task"` | Type field is present and correct |
| Includes `System.State` as a non-empty string | State field is readable |
| Includes `System.AreaPath` as a non-empty string | Area path is present |
| Includes `System.IterationPath` as a non-empty string | Iteration path is present |
| Includes `System.Id` matching the created item ID | ID field matches the created item |
| Includes `System.Rev` as a positive integer | Revision number is a positive integer |
| Includes at least 10 distinct fields | API returns a rich set of metadata |
| All field keys follow the `Namespace.FieldName` pattern | All keys contain a dot |
| Throws `NOT_FOUND` for a non-existent work item | Error propagation for unknown ID |

#### `formatFieldList` (command helper)

| Test | What it verifies |
|---|---|
| Returns a non-empty formatted string | Helper produces output |
| Contains the work item title in the output | Title is visible in formatted output |
| Contains `System.Title` as a field key | Key appears in formatted output |
| Contains `System.State` as a field key | Key appears in formatted output |
| Marks empty fields with `(empty)` placeholder | Empty fields are labelled, not left blank |

---

### `pull-requests.test.ts`

Read-only tests against the Azure DevOps Git API. Requires `AZDO_REPO`. No PRs are created or modified.

#### `listPullRequests`

| Test | What it verifies |
|---|---|
| Returns an array (possibly empty) for a non-existent branch | API is reachable; non-existent branch yields empty list, not an error |
| Returned PR objects have the expected shape | All mandatory fields (`id`, `title`, `repository`, `sourceRefName`, `targetRefName`, `status`, `url`) are present and correctly typed |
| Filters by `status=active` and returns only active PRs | Status filter is applied server-side |
| Throws `AUTH_FAILED` when using an invalid PAT | Wrong credentials produce `AUTH_FAILED` |
| Throws `NOT_FOUND` for a non-existent repository | Unknown repo name produces `NOT_FOUND` |

#### `getPullRequestThreads` *(requires `AZDO_PR_ID`)*

| Test | What it verifies |
|---|---|
| Returns an array of active comment threads | API returns a list |
| Each thread has a numeric `id` and a valid `status` | Shape of `ActiveCommentThread` matches API response |
| Each thread contains at least one non-deleted comment | Comment filtering works (deleted comments are excluded) |
| Throws `NOT_FOUND` for a non-existent PR ID | Error propagation for unknown PR `999999999` |
| Throws `AUTH_FAILED` when using an invalid PAT | Wrong credentials produce `AUTH_FAILED` |
