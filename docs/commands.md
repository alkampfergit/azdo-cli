# Command Reference

## Cheat Sheet

| Command | Purpose | Common Flags |
| --- | --- | --- |
| `azdo get-item <id>` | Read a work item | `--short`, `--fields`, `--markdown`, `--download-images`, `--resize-images <px>`, `--images-path <dir>`, `--org`, `--project` |
| `azdo list-items` | List work items by state, tag, assignee, title | `--state`, `--tag`, `--assigned-to`, `--title-contains`, `--top`, `--json`, `--org`, `--project` |
| `azdo set-state <id> <state>` | Change work item state | `--json`, `--org`, `--project` |
| `azdo assign <id> [name]` | Assign or unassign owner | `--unassign`, `--json`, `--org`, `--project` |
| `azdo set-field <id> <field> <value>` | Update any field | `--json`, `--org`, `--project` |
| `azdo upsert [id]` | Create or update from markdown | `--content`, `--file`, `--type`, `--json`, `--org`, `--project` |
| `azdo comments <subcommand>` | Read or add work item comments | `list`, `add`, `--json`, `--org`, `--project` |
| `azdo get-md-field <id> <field>` | Get rich-text field as markdown | `--download-images`, `--resize-images <px>`, `--images-path <dir>`, `--org`, `--project` |
| `azdo set-md-field <id> <field> [content]` | Set markdown field | `--file`, `--json`, `--org`, `--project` |
| `azdo list-fields <id>` | List all fields of a work item | `--json`, `--org`, `--project` |
| `azdo pr <subcommand>` | Manage pull requests (current branch or by `--pr-number`) — see [Pull request commands](#pull-request-commands) | `list`, `status`, `open`, `update` (`edit`), `abandon` (`close`), `reactivate`, `comments`, `comments add\|edit\|reply` (`comment-add`, `comment-edit`, `comment-reply`), `comment-resolve`, `comment-reopen`, `work-items link\|unlink`, `reviewers list\|add\|remove`, `--pr-number`, `--repo`, `--json`, `--org`, `--project` |
| `azdo pipeline <subcommand>` | Inspect and operate Azure DevOps pipelines | `list`, `get-runs`, `wait`, `get-run-detail`, `logs`, `artifacts`, `artifact-download`, `tests`, `start`, `--filter`, `--limit`, `--branch`, `--commit`, `--pr`, `--timeout`, `--poll-interval`, `--log-id`, `--head`, `--no-progress`, `--path`, `--progress`, `--parameter`, `--json`, `--org`, `--project` |
| `azdo download-attachment <id> <filename>` | Download a work item attachment | `--output <dir>`, `--org`, `--project` |
| `azdo add-attachment <id> <file>` | Attach a local file to a work item | `--comment <text>`, `--org`, `--project` |
| `azdo delete-attachment <id> <filename>` | Remove a work item attachment (prompts unless `--yes`) | `--id <guid>`, `--yes`, `--org`, `--project` |
| `azdo relations <subcommand>` | Work item link relations — see [Work item relations](#work-item-relations) | `types`, `add <type> <id1> <id2>`, `remove <type> <id1> <id2>`, `list <id>`, `--json`, `--org`, `--project` |
| `azdo config <subcommand>` | Manage saved settings | `set [--org]`, `get [--org]`, `unset [--org]`, `list`, `org-copy`, `org-move`, `org-delete`, `wizard`, `--json` |
| `azdo auth login` | Authenticate against an org — OAuth (Microsoft Entra) by default, or a PAT with `--use-pat` | `--org`, `--use-pat`, `--device-code`, `--client-id`, `--tenant-id`, `--scopes`, `--from-stdin`, `--no-browser` |
| `azdo auth` | Legacy PAT-prompt entry point (back-compat alias of `azdo auth login --use-pat`) | `--org`, `--from-stdin`, `--no-browser` |
| `azdo auth status` | Report stored credentials (kind `pat`/`oauth`, org, account/expiry, backend) — never the token | `--org`, `--json` |
| `azdo auth logout` | Remove the stored credential (PAT or OAuth) for an org, or every org with `--all` | `--org`, `--all` |
| `azdo auth token` | Print the token the CLI uses for an org on stdout, for API calls the CLI does not wrap (no `--json` — see [authentication.md](authentication.md#exporting-the-token)) | `--org` |
| `azdo auth diagnose` | Show auth type, credential source, org, and live connectivity test result | `--org`, `--project`, `--json` |
| `azdo clear-pat` | **Deprecated** alias for `azdo auth logout` | `--org` |

---

## Core commands

```bash
# Read a work item (full / short / with extra fields)
azdo get-item 12345
azdo get-item 12345 --short
azdo get-item 12345 --fields "System.Tags,Microsoft.VSTS.Common.Priority"

# Convert rich-text fields to markdown
azdo get-item 12345 --markdown
```

### Downloading embedded images

`get-item` and `get-md-field` can download images embedded in a work item's
rich-text fields. Download is **opt-in** — without a flag, no files are written.
Both legacy HTML fields (`<img>`) and native Markdown fields (`![](url)`) are
supported; only images hosted as Azure DevOps attachments are downloaded
(external image URLs are ignored).

```bash
# Download embedded images at original size to the system temp directory
azdo get-item 12345 --download-images

# Cap width at 1024px (aspect preserved, never upscaled) and save as PNG into ./img
azdo get-item 12345 --resize-images 1024 --images-path ./img

# --resize-images implies --download-images
azdo get-item 12345 --resize-images 800

# Same flags work on get-md-field for a single field
azdo get-md-field 12345 System.Description --download-images
```

Notes:
- Default destination is the OS temp directory; override with `--images-path <dir>` (must exist).
- Files are named `wi-<id>-<index><ext>`; resized images are always `.png`.
- A single image failing to download is reported to stderr; the rest still download.

```bash
# Change state
azdo set-state 12345 "Closed"

# Assign / unassign
azdo assign 12345 "someone@company.com"
azdo assign 12345 --unassign

# Set any field by reference name
azdo set-field 12345 System.Title "Updated title"
```

## List work items

```bash
azdo list-items --state Active --tag ready                 # one line per item: id, state, assignee, title [tags]
azdo list-items --assigned-to @me --title-contains login --top 20
azdo list-items --tag ready --json                         # machine-readable
```

One WIQL query (scoped to the project, newest change first) followed by batch reads of up to 200 items each — one request per 200 matches, never one per item. The default `--top 50` costs two requests; 201 matches cost three (1 WIQL + 2 batch). If the org lacks a process-template field, a batch read is retried once with system fields only. The filters combine with AND; omit all of them to list the latest `--top` items.

| Option | Meaning |
| --- | --- |
| `--state <state>` | exact state, e.g. `Active` |
| `--tag <tag>` | items carrying this tag |
| `--assigned-to <user>` | display name or email; `@me` is the caller |
| `--title-contains <text>` | substring of the title |
| `--top <n>` | at most `n` items (default 50, max 1000) |
| `--json` | array of `{ id, title, description, url, state, tags, assignedTo }` |

`description` is markdown (`""` when empty; Acceptance Criteria / Repro Steps are appended as in `get-item`), `tags` is an array, `assignedTo` is the display name or `null`. No match prints `[]` with `--json` and `No work items found.` otherwise. Filter values are quoted for WIQL, so quotes in a title or tag are safe. Needs **Work Items (Read)**. `--org` and `--project` must be given together.

## List fields

```bash
azdo list-fields 12345          # all fields with values (rich text previewed to 5 lines)
azdo list-fields 12345 --json
```

## Markdown field commands

```bash
azdo get-md-field 12345 System.Description
azdo set-md-field 12345 System.Description "# Title\n\nSome **bold** text"
azdo set-md-field 12345 System.Description --file ./description.md
cat description.md | azdo set-md-field 12345 System.Description
```

### Windows / PowerShell — output encoding

`get-md-field` outputs UTF-8. PowerShell's `>` redirect reads the subprocess
stdout using `[Console]::OutputEncoding`, which defaults to the OEM code page
(CP437) on many Windows systems. This causes non-ASCII characters such as em
dashes (`—`) to appear as `ΓÇö` in the redirected file.

Fix — add this before redirecting:

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
& azdo get-md-field 12345 System.Description > output.md
```

Or use `Out-File`:

```powershell
azdo get-md-field 12345 System.Description | Out-File -Encoding UTF8 output.md
```

## Pull request commands

The `pr` group uses the current git branch and the Azure DevOps `origin` remote automatically.
Requires a credential (OAuth or PAT) with **Code (Read)** scope for reads and **Code (Read & Write)** for creation.

```bash
azdo pr list                               # active PRs in the repository (one API call)
azdo pr list --branch feature/x --json     # which PR belongs to this branch?
azdo pr status                             # list PRs for current branch + checks
azdo pr status --branch feature/x --json   # checks for another branch, no checkout
azdo pr status --pr-number 96              # checks for one PR by number
azdo pr open --title "…" --description "…"      # open PR targeting develop
azdo pr open --title "…"                   # description from a repo-defined PR template, if one exists
azdo pr open --title "…" --target master --draft --work-item 123 --label automata   # other target, draft, linked, labelled
azdo pr open --title "…" --source feature/x --target master   # from any pushed branch, no checkout needed
azdo pr open --title "…" --description-file body.md   # description from a file ("-" = stdin)
azdo pr update --pr-number 96 --title "Real title"    # fix a title after the fact
azdo pr update --pr-number 96 --description-file body.md  # replace the description literally
azdo pr abandon --pr-number 97             # abandon a PR (alias: azdo pr close) — reversible
azdo pr reactivate --pr-number 97          # restore an abandoned PR to active
azdo pr work-items link 1234 --pr-number 64    # link a work item to a PR
azdo pr work-items unlink 1234 --pr-number 64  # unlink it
azdo pr reviewers list --pr-number 64                             # reviewers with votes (approved, waiting-for-author, …)
azdo pr reviewers list --pr-number 64 --json                      # same, with id/uniqueName/vote/voteState/isRequired per reviewer
azdo pr reviewers add jane@example.com --pr-number 64             # add optional reviewer
azdo pr reviewers add jane@example.com --pr-number 64 --required # add/promote to required
azdo pr reviewers remove jane@example.com --pr-number 64          # remove a reviewer
azdo pr comments                           # list threads for current branch's PR
azdo pr comments --pr-number 64            # list threads for any PR by number
azdo pr comments --hide-resolved           # triage view — hide settled threads
azdo pr comments --exclude-resolved        # alias of --hide-resolved
azdo pr comments --code-related-only       # only threads anchored to a file/line
azdo pr comments --exclude-system --max-chars 500   # human comments only, truncated
azdo pr comments --thread 148              # just one thread (e.g. re-read after editing)
azdo pr comments --contains '"kind":"plan"' # threads holding a literal substring
azdo pr comments add --file plan.md        # NEW thread on the PR overview
azdo pr comments edit 148 --file plan.md   # rewrite a comment in place
azdo pr comments delete 148 --comment-id 3 # delete a comment (irreversible; no prompt)
azdo pr comments reply 148 "Done."         # reply inside an existing thread
azdo pr comment-resolve  17 --pr-number 64 # mark thread as resolved (idempotent)
azdo pr comment-reopen   17 --pr-number 64 # reopen a previously resolved thread
```

Every `pr` subcommand accepts `--org`, `--project`, `--repo`, and `--json`.
`--repo <name>` overrides the repository derived from the git `origin` remote, so the commands also
work from outside a checkout of the target repository.

**`azdo pr list`**
- Lists the repository's pull requests in a **single** API call — no checks, policies, or builds, unlike `pr status`
- `--branch <name>` filters by source branch (a leading `refs/heads/` is accepted and stripped); without it, every PR in the repository is listed. `pr list` never falls back to the current branch — that is what `pr status` is for
- `--status active|completed|abandoned|all` (default `active`), `--top <N>` (default 25)
- Prints id, state (`[active, draft]` for a draft), title, source → target, author and URL; `--json` adds the PR `description`, `isDraft`, `creationDate`, `closedDate`, `reviewers` (with `uniqueName`, `vote`, `isRequired`) and `labels`
- `--work-items` adds each PR's linked work item ids (`workItemIds` in `--json`, a `Work items:` line in text). The list endpoint never returns them, so this costs **one extra call per PR** (at most 5 in flight) — still one `azdo` invocation instead of one per PR
- Azure DevOps keeps no "last updated" timestamp on a pull request, so there is none to report; `closedDate` is `null` while the PR is active

**`azdo pr status`**
- Lists PRs for the current branch, including Azure DevOps checks
- `--branch <name>` reports another branch's PRs instead (a leading `refs/heads/` is accepted and stripped) and `--pr-number <id>` reports exactly one PR, whatever its status — neither reads the local git branch, so nothing needs to be checked out. The output, text and `--json`, is the same shape as the default view; with `--pr-number` the `branch` field is that PR's source branch
- The two options are mutually exclusive (exit 1, before any network call). An explicit target that matches nothing is an error, not an empty success: an unknown `--pr-number` exits **3** (`Pull request #N not found in …`), a `--branch` with no PRs exits **1** (`No pull requests found for branch … in …`), both with empty stdout. Without either option an empty result stays exit 0, as before
- **Checks merge two sources**: the Pull Request Status API *and* branch **policy evaluations** (build validation, required reviewers, etc.). Branch-policy checks are the green checks the Azure DevOps UI shows and are not returned by the status endpoint, so both are combined. Each check carries a `source` of `status` or `policy` in `--json`.
- `Checks: none reported by Azure DevOps` is shown only when both sources are genuinely empty; a retrieval failure shows `Checks: unable to retrieve (…)` instead (never silently "none")
- Shows `Detail: …` for failed/errored checks when description is available
- Shows a `Code comments: N open, M closed` line counting only **code-anchored** (file/line) threads; general discussion threads are excluded
- `--json` includes a `checks` array (with `source`) and a `codeCommentCounts` object per PR

**`azdo pr open`**
- Requires `--title`; `--description` is optional
- When `--description` is omitted, looks for a repository-defined pull request template — Azure DevOps's own `pull_request_template[/branches/<branch>].md` convention, checked under `.azuredevops/`, `.vsts/`, `docs/`, and the repository root, always read from the repository's **default** branch (never the PR's source/target branch). Branch-specific templates fall back from the most-specific branch segment down to the least (`feature/foo/december` → `feature/foo` → `feature`), then the repository-wide default template
- When both `--description` and a template apply, the description is the supplied text followed by the template content; with neither, the command fails exactly as before (`--description is required for pull request creation.`)
- **Length limit — 4000 characters.** Azure DevOps caps a pull request description at [4000 characters](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1). That budget covers the **composed** text — your `--description`, the blank-line separator, *and* the repository template — so a description that fits on its own can still be over the limit once the template is appended. The command measures it client-side and fails before the create call, naming every contribution:

  ```
  Error: description is 4172 characters (2299 provided + 2 separator + 1871 from the repository
  pull request template .azuredevops/pull_request_template.md), exceeding the Azure DevOps limit
  of 4000 characters. Shorten the description by at least 172 characters.
  ```

  Exit code `1` — nothing was sent, so no pull request was created. There is no `--truncate`: silently clipping a description is the failure mode this replaces. If Azure DevOps rejects the create anyway, the same arithmetic is appended to the server's own message.
- `--description-file <path>` reads the description from a UTF-8 file instead of `--description`; the two are mutually exclusive. `-` means **standard input**, so `cat body.md | azdo pr open --title "…" --description-file -` works. The file's content is composed with the repository template exactly as inline text is — `--description-file` changes where the text comes from, nothing else. An empty file is an error (unlike an empty `--description`, which has always meant "use the template")
- `--target <branch>` picks the target branch (default `develop`; a leading `refs/heads/` is accepted). It drives the existing-PR lookup, the template lookup and the create call
- `--source <branch>` picks the source branch (default: the current branch). When given, no local checkout is needed, so it works outside a repo with `--org/--project/--repo`
- `--draft` opens the PR as a draft
- `--work-item <id>` links a work item to the PR (positive integer, repeatable); `--label <label>` adds a label (repeatable, trimmed, de-duplicated)
- Everything goes in **one create call** (`isDraft`, `labels`, `workItemRefs`), so a failure never leaves a half-configured PR. `AB#<id>` is not added to the description
- Validation runs before any call: `--source` equal to `--target`, a non-positive or non-numeric `--work-item`, and an empty `--label` are rejected (exit 1). An unpushed source branch is reported by Azure DevOps itself
- Reuses an existing active PR if one already matches the source and target; nothing is written, so `--draft`, `--label` and `--work-item` are **not** applied to it (use `pr update` or `pr work-items link`)
- Fails when the source equals the target (by default: run from `develop`) or when multiple active PRs exist

**`azdo pr update`** (alias: `azdo pr edit`)
- Updates the title and/or the description of an existing pull request — the counterpart to `pr open`, which cannot change a PR it did not create. Re-running `pr open` on a branch that already has an active PR reports `created: false` and changes nothing, by design
- `--title <s>` / `--title-file <path>` and `--description <s>` / `--description-file <path>`; each pair is mutually exclusive and at least one of the four is required. `-` means standard input for either file flag — but only one of them per invocation, since stdin can be drained only once
- **Only the fields you pass are sent.** `azdo pr update --title X` issues `PATCH` with `{"title": "X"}`, so the description is provably untouched — Azure DevOps leaves omitted properties alone
- **`--description` replaces the description literally.** No repository pull request template is looked up or prepended, unlike `pr open` — prepending it on update would re-prepend it on every subsequent edit. If you want the template, paste it into your file
- Values are trimmed, and an empty title or description is rejected rather than clearing the field
- Idempotent: when every field you passed already holds that value, the command reports a no-op, issues **no** `PATCH`, and exits 0 (`noop: true` in `--json`)
- The 4000-character description cap applies here too and is checked client-side before the request:

  ```
  Error: description is 4207 characters, exceeding the Azure DevOps limit of 4000 characters.
  Shorten the description by at least 207 characters.
  ```

- `--pr-number <N>` targets a PR by id; without it the current branch's single active PR is used (same zero-/multi-match rules as the rest of the group)
- `--json` returns `{ pullRequestId, title, description, url, noop, updatedFields }`, where `updatedFields` lists the fields actually written and is `[]` on a no-op
- Changing a PR's **status** is not part of this command — see `azdo pr abandon` / `azdo pr reactivate` below, which ride the same `PATCH`

**`azdo pr abandon`** (alias: `azdo pr close`) / **`azdo pr reactivate`**
- `abandon` sets the pull request's status to `abandoned`; `reactivate` sets it back to `active`. Both send `PATCH .../pullrequests/{id}` with a body of `{"status": …}` and nothing else
- **Abandoning is not deleting and not completing.** The PR stays visible, keeps its comment threads and its work-item links, and `reactivate` restores it at any time — the web UI's own **Abandon** / **Reactivate** pair. The `close` alias is the verb the Azure DevOps docs use for abandon ("Abandon: Close the PR"); it never merges anything. Completing/merging a PR is not offered by the CLI
- **No confirmation prompt**, with or without a TTY: the action is reversible, and a prompt would break scripted callers
- `--pr-number <N>` targets a PR by id. Without it, `abandon` resolves the current branch's single **active** PR and `reactivate` its single **abandoned** one — a reactivation target is by definition not active. Zero or multiple matches fail (exit 1) with a message naming the branch *and* the status searched for:

  ```
  No abandoned pull request matches branch feature/x. Pass --pr-number to target a specific PR.
  ```

- Idempotent: abandoning an already-abandoned PR (or reactivating an active one) reports a no-op, issues **no** `PATCH`, and exits 0 (`noop: true` in `--json`)
- A **completed** PR is refused (exit 1, nothing written) — completion is final in Azure DevOps, and the way back is a revert PR, not a status flip:

  ```
  Error: Pull request #97 is completed and cannot be abandoned. A completed pull request is final;
  revert it with a new pull request instead.
  ```

- `--json` returns `{ pullRequestId, title, status, previousStatus, url, noop }`; on a no-op `status` equals `previousStatus` and both carry the PR's real backend status
- `azdo pr list --status abandoned` finds abandoned PRs to reactivate

**`azdo pr work-items link <workItemId>`** / **`azdo pr work-items unlink <workItemId>`**
- Adds or removes an `ArtifactLink` relation between the work item and the target pull request — the same mechanism the Azure DevOps web UI uses when linking a work item from the PR **Overview** tab
- Idempotent: linking an already-linked work item, or unlinking one that isn't linked, is a no-op (exit 0, `noop: true` in `--json`)
- A nonexistent work item id fails (exit `3`) naming the id
- Shares `--pr-number`, `--org`, `--project`, `--repo`, and `--json` with the rest of `pr`; `--json` returns `{ pullRequestId, workItemId, noop }`

**`azdo pr reviewers list`**
- Lists every reviewer on the target PR with their current vote — the `azdo` counterpart of `gh pr view --json reviews`. Read-only; needs **Code (Read)** only and never calls the Identities API
- Each line reads `<displayName> <uniqueName> — <voteState> (required|optional[, declined])`; an empty list prints `No reviewers on pull request #N.` with exit 0
- `--json` returns `{ pullRequestId, reviewers: [Reviewer] }` where every `Reviewer` carries the stable identity next to the display name: `{ id, displayName, uniqueName, isRequired, vote, voteState, hasDeclined }`. Key on `id` or `uniqueName`, not on `displayName`
- `vote` is Azure DevOps' raw number and `voteState` its named form: `10` → `approved`, `5` → `approved-with-suggestions`, `0` → `no-vote`, `-5` → `waiting-for-author`, `-10` → `rejected`, `15` → `bypassed` (a required reviewer whose requirement was satisfied without counting as an approval). Any other number maps to `unknown` and is still reported verbatim in `vote`
- Groups and teams can be reviewers but cannot vote directly; Azure DevOps rolls a member's vote up into the group's entry, which is what this command reports
- Shares `--pr-number`, `--org`, `--project`, `--repo` and `--json` with the rest of `pr`, including the current-branch auto-detection when `--pr-number` is omitted

**`azdo pr reviewers add <reviewer>`** / **`azdo pr reviewers remove <reviewer>`**
- `azdo pr reviewers` on its own is only a group: it lists `list`, `add` and `remove` and changes nothing
- `<reviewer>` is an email or Azure DevOps unique name, resolved to an identity via the Identities API
- `add` defaults to an **optional** reviewer; `--required` marks them required instead. Re-adding an existing reviewer with a different `--required` value updates their required/optional flag in place — no duplicate entry. Re-adding with the *same* flag is a no-op (exit 0, `noop: true` in `--json`, no write issued)
- `remove` is idempotent: removing someone who isn't currently a reviewer is a no-op (exit 0, `noop: true` in `--json`)
- An identity that cannot be resolved (zero or multiple matches) fails (exit `1`) naming the input
- Identity resolution calls the legacy Identities API (`vssps.dev.azure.com/.../identities`), a separate host/authorization boundary from the rest of `pr`. It requires the PAT's **Identity (Read)** scope — a distinct scope category from **Code (Read & Write)**, which is the only scope every other `pr` call (including the reviewer add/remove write itself) needs. A PAT scoped for Code only fails here with `Could not resolve reviewer identity: your PAT is missing the "Identity (Read)" scope...` (exit `4`) even though the write would otherwise have succeeded. Fix: add **Identity (Read)** to the PAT alongside **Code (Read & Write)**
- `--json` returns `{ pullRequestId, reviewer: { id, displayName, uniqueName, isRequired } | null, noop }`

**`azdo pr comments`**
- Lists every comment thread on the target PR with a bracketed status indicator (`[active]`, `[pending]`, `[resolved]`) next to each thread title
- `--pr-number <N>` targets any PR by numeric id and bypasses the current-branch lookup entirely; invalid numbers and missing PRs fail cleanly with non-zero exit, no crash
- When `--pr-number` is omitted, the active PR is auto-detected as the open PR whose source branch equals `refs/heads/<current branch>`. If zero or more than one open PR matches, the command fails (exit 1) with a message naming the searched branch — pass `--pr-number` to disambiguate. (`pr status` is unaffected: it remains a multi-PR overview that lists all matches.)
- `--hide-resolved` (and its alias `--exclude-resolved`) drops threads whose backend state is settled (`fixed`, `wontFix`, `closed`, `byDesign`) — useful when triaging only the threads that still need attention
- `--code-related-only` shows only threads anchored to a real file/line, omitting general discussion threads
- `--exclude-system` drops Azure DevOps system comments (branch updates, reviewer votes, build events); a thread left with no comments disappears from the listing
- `--max-chars <N>` truncates each comment body to N characters plus ` […]`; `0` (the default) means no limit — useful when feeding a long review into a limited context window. In `--json` every comment also carries `truncated` and `originalLength`, so a cut body is never indistinguishable from a short one
- `--thread <id>` returns just that thread — it is a **selector, not a filter**: a thread id absent from the pull request fails with exit 1 rather than printing an empty listing
- `--contains <text>` keeps only threads holding a comment with that **literal, case-sensitive** substring (no regex). Matched against the full body *before* `--max-chars` truncates, so `--contains '"kind":"review-plan"' --max-chars 200` finds a marker that the cut would have hidden
- The filters are independent and combinable; with none of them the output is unchanged. All are honoured in `--json` output, which also carries the PR `description` and each comment's `commentType`
- Tolerant of Azure DevOps responses that omit `_links.web` (root cause of the original crash reported in issue #34)

**`azdo pr comments add [text]`** (alias: `azdo pr comment-add`)
- Posts a **new** comment thread on the pull request overview — `reply` can only append to an existing thread
- Body comes from the inline argument or `--file <path>` (UTF-8, typically markdown); the two are mutually exclusive and one is required. `--file -` reads standard input
- `--status active|fixed|wontFix|closed|byDesign|pending` makes the thread resolvable; omit it for a plain overview comment
- `--dry-run` resolves the target pull request, prints exactly what would be posted, and exits 0 without writing anything
- `--json` returns `{ pullRequestId, threadId, commentId, status, content, dryRun }`

**`azdo pr comments edit <threadId> [text]`** (alias: `azdo pr comment-edit`)
- Rewrites an existing comment **in place**, keeping the thread, its id, and its position in the discussion — prefer it over a follow-up comment when correcting your own text
- Edits the thread's first comment by default; `--comment-id <N>` targets another one
- Same `--file` and `--dry-run` behaviour as `add`; the dry run prints the replacement body plus a `13191 chars -> 4 chars` delta rather than dumping the current body, and `--json` reports `previousContent` for a real diff
- Azure DevOps only lets a comment's own author edit it — another identity gets a permission error

**`azdo pr comments delete <threadId>`** (alias: `azdo pr comment-delete`)
- Deletes one comment from a thread via the documented `DELETE .../threads/{threadId}/comments/{commentId}` — the way to remove a marker comment a bot posted earlier, instead of editing it to an empty body
- `--comment-id <N>` names the comment. It may be omitted **only** when the thread holds a single visible comment; a thread with several is refused (exit 1) with the candidate ids and authors listed, because a deletion cannot be undone and the "first comment" default `edit` uses would be a guess
- **No confirmation prompt**, under a TTY or not — the command exists for scripted callers. `--dry-run` is the preview: it resolves the comment, prints who wrote it and how long it is, and exits 0 without deleting
- Unknown thread or comment → exit 3 before any write; a comment authored by somebody else → exit 4 (Azure DevOps only lets the author delete); any other server rejection prints the server's own message under an `HTTP_<status>` line with exit 1
- Deleting a thread's last comment leaves an empty thread, which `azdo pr comments` no longer lists
- `--json` returns `{ pullRequestId, threadId, commentId, deleted, dryRun }` — `deleted` is `true` on a real deletion and `false` on a dry run

**`azdo pr comments reply <threadId> [text]`** (alias: `azdo pr comment-reply`)
- Appends a reply to an existing thread
- The body can now come from `--file <path>` instead of the inline argument (`-` reads standard input)

**`azdo pr comment-resolve <threadId>`**
- Marks a single comment thread as resolved on the target PR
- Idempotent: exits 0 with a clear "already resolved" message when the thread is already in any settled state (no redundant backend call, `noop:true` in `--json` output)
- Shares `--pr-number`, `--org`, `--project`, and `--json` with `pr comments`

**`azdo pr comment-reopen <threadId>`**
- Mirror of `comment-resolve` — flips any settled thread back to `active`
- Idempotent: exits 0 with "already active" when the thread is already open/pending
- Same flags as `comment-resolve`

### Pull request JSON fields

- `url` is always populated: Azure DevOps omits `_links.web` from the pull request *list* response, so the CLI builds `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>` itself instead of returning `null`
- `description` carries the PR overview description (trimmed, `null` when empty)
- `createdBy` stays the display name; `createdByUniqueName` (account, usually an email) and `createdById` (identity GUID) are the comparable identity fields — a display name is neither unique nor stable
- each comment carries `commentType` (`text` / `system`), `truncated` and `originalLength`

### Exit codes and failure diagnosis

Every `pr` command exits **0** on success (a `--dry-run` included). Failures carry a code, so a
caller can tell "not permitted" from "not found" without scraping stderr:

| Code | Meaning |
|------|---------|
| `0` | Success, including a `--dry-run` and an idempotent no-op (`comment-resolve` on an already-resolved thread) |
| `1` | Validation failure (bad `--pr-number`, `--thread`, `--status`, empty body, both inline text and `--file`, invalid work item id, an unresolvable reviewer identity), network error, or any other unexpected failure |
| `3` | An addressed resource does not exist: the pull request behind `--pr-number`, the thread behind `--thread` / `<threadId>`, or the comment behind `--comment-id` |
| `4` | Not permitted: authentication failure or permission denied (for example editing or deleting a comment authored by somebody else, which Azure DevOps rejects) |

Branch **auto-detection** failures (no open PR for the current branch, or several) keep exit `1`:
that is a resolution failure rather than a named resource that could not be found, and the code is
pinned by the contract introduced in `019-fix-pr-command`.

On an authentication failure the message names both the required scope and **which token was
used**:

```
Error: Authentication failed. Check that your PAT is valid and has the "Code (Read & Write)" scope.
  Token used: PAT from the AZDO_PAT environment variable (it takes precedence over the stored credential). Fix: give that token the scope above, or unset AZDO_PAT to fall back to the stored credential.
```

**Every failed API request now prints Azure DevOps' own explanation**, not just the status.
Whatever the server put in the response body — its `message`, plus `typeKey` / `errorCode` when
present — is shown on an indented line under the CLI's own guidance, for every command group, not
just `pr`:

```
Error: Access denied. Your PAT may lack write permissions for project "Demo".
  TF401019: The Git repository with name or identifier demo is disabled. [GitRepositoryDisabledException]

Error: Azure DevOps request failed with HTTP_400.
  The pull request description is too long. [InvalidArgumentValueException]
```

The same detail is appended to the curated `Request rejected:` messages, so an
Azure DevOps rule violation now names its `typeKey` alongside its text.

The detail is redacted (tokens are never echoed — both recognised JSON credential fields and
token-shaped runs inside free text), capped at 500 characters, and suppressed entirely when the
response body is the Entra sign-in page rather than an API error. The full, untruncated body is
still available in the trace file when tracing is enabled.

The `NOT_FOUND` diagnostic (`NOT_FOUND | url=… | body=…`, which the commands translate into their
own "not found" wording) carries the same redacted, capped detail and the same redacted URL, so a
404 that answers with a sign-in page or a body quoting a token prints the bare sentinel instead.

Two paths are deliberately outside this contract because they do not go through the shared HTTP
layer and have their own reporting: `azdo auth diagnose` prints the server's `message` (or a bare
`HTTP <status>` when the body names none, with no `typeKey` / `errorCode` suffix), and the PAT
validation in `azdo auth login` reports the status only.

Note the two scopes: reads (`pr list`, `pr status`, `pr comments`, `pr reviewers list`) need **Code (Read)**, while
`comments add` / `edit` / `delete` / `reply` / `comment-resolve` / `comment-reopen`, `pr open`, and
`pr reviewers add` / `remove` need **Code (Read & Write)**. `pr work-items link` / `unlink` also
need **Work Items (Read & Write)**, since the link is written on the work item, not the pull
request. A PAT scoped for Work Items only makes every other `pr` command fail while
`azdo get-item` keeps working. `pr reviewers add` / `remove` additionally need **Identity (Read)**
for the reviewer-lookup step — see the identity-resolution note above. `azdo config --help` lists the credential resolution order, and
`azdo auth diagnose` reports the credential actually in use — including **who it belongs to**:

```bash
azdo auth diagnose --json     # { authType, credentialSource, org, project, connectivityStatus,
                              #   connectivityError, identity: { displayName, uniqueName, id } }
```

`identity` comes from the Azure DevOps `connectionData` endpoint and is the way to check that the
token about to post a comment belongs to the pull request author: compare `identity.uniqueName`
with `createdByUniqueName` from `azdo pr list --json` / `azdo pr comments --json`. It is `null`
when there is no credential, when connectivity already failed, or when the lookup itself failed —
the diagnosis never breaks because of it.

## Pipeline commands

Operate Azure DevOps pipelines. Every subcommand supports `--json`, `--org`, and `--project`.
Designed to be scriptable for CI loops and AI coding agents (push → build → wait → read errors → repeat).

```bash
azdo pipeline list                         # list pipeline definitions
azdo pipeline list --filter ci             # filter definitions by name (substring)
azdo pipeline get-runs 12 --limit 5        # recent runs for definition 12
azdo pipeline get-runs 12 --branch develop # runs for a specific branch
azdo pipeline get-runs --commit abc123f    # which runs built this commit?
azdo pipeline get-runs --pr 4664           # runs for a pull request
azdo pipeline wait 3456                     # block until run 3456 finishes (exit code = result)
azdo pipeline get-run-detail 3456          # date, commit, result, errors, failing tests, stages
azdo pipeline logs 3456                     # list a run's logs (with step names)
azdo pipeline logs 3456 --log-id 7         # print a specific log
azdo pipeline logs 3456 --step "Run tests" # print a log by step/job name
azdo pipeline logs 3456 --log-id 7 --tail 50          # only the last 50 lines
azdo pipeline logs 3456 --log-id 7 --grep 'error CS'  # only matching lines
azdo pipeline logs 3456 --log-id 7 --grep Exception --context 5  # ±5 lines around matches
azdo pipeline logs 3456 --log-id 7 --head 40          # only the first 40 lines
azdo pipeline logs 3456 --step "Trivy" --no-progress  # collapse carriage-return progress redraws
azdo pipeline artifacts 3456               # list the run's build artifacts
azdo pipeline artifact-download 3456 scan-results --path ./out  # download + extract into ./out
azdo pipeline artifact-download 3456 --all # every artifact into ./<name>
azdo pipeline tests 3456                   # test summary + failing tests by name
azdo pipeline tests 3456 --failed          # only the failing tests
azdo pipeline start 12 --branch develop --parameter env=staging
```

**`azdo pipeline list`**
- Lists pipeline definitions (id + name, and folder when present); `--filter <name>` is a case-insensitive substring match

**`azdo pipeline get-runs [def_id]`**
- Lists recent runs newest-first (run id, state/result, timestamp, branch, abbreviated commit)
- `--limit <n>` caps the count (default 10); `--branch <branch>` restricts to runs for that branch (filtered server-side)
- `--commit <sha>` finds the runs that built a commit (full or abbreviated SHA; matched over the 200 most recent builds); `--pr <number>` lists a pull request's validation runs — with either of these the definition id is optional, so "which run built commit `abc123f`?" is a single call

**`azdo pipeline wait <run_id>`**
- Blocks until the run reaches a terminal state, then sets the **process exit code from the result**: `0` succeeded, `1` failed, `2` canceled, `124` on `--timeout`
- `--timeout <seconds>` (default 1800) bounds the wait; `--poll-interval <seconds>` (default 5) sets the cadence; a timeout does **not** cancel the run
- The exit-code contract makes the AI-agent loop scriptable: `azdo pipeline wait $RID && deploy || azdo pipeline get-run-detail $RID`

**`azdo pipeline get-run-detail <run_id>`**
- Composes the run's core (queue/start/finish times, computed duration, trigger reason, requestor, built commit, result, web link), the build timeline (errors + per-stage **and per-job** status — YAML pipelines often report a single implicit stage, so jobs are the actionable breakdown), and the test summary
- Reports the failing-test count when tests ran, and shows **"no tests present"** distinctly from "0 failures"
- When tests failed, lists the failing tests by name with the first line of each error message (capped at 50) — no need to download the full logs to see what broke
- Degrades gracefully: a source that can't be retrieved is shown as "unavailable" rather than failing the command

**`azdo pipeline logs <run_id>`**
- Lists the run's logs with the step/job each log belongs to (joined from the build timeline), so the right `--log-id` is no longer guesswork; `--log-id <id>` prints a specific log's content to stdout
- `--step <name>` selects the log by step/job name (case-insensitive substring, exact match wins) — stable across runs even when skipped jobs shift the numeric log ids
- With `--log-id`/`--step`: `--tail <n>` prints only the last N lines, `--grep <pattern>` prints only lines matching a regular expression, and `--grep … --context <n>` adds ±N surrounding lines per match (grep `-C` semantics, chunks separated by `--`) — multi-line stack traces come out whole

- The listing also shows each log's **record type** (`Stage` / `Job` / `Task`) and its **parent** (`(in <job>)`), so two logs sharing a title (a job log and its task log) are told apart; `--json` carries `type` and `parent`, and the `--step` ambiguity error prints them for every candidate
- `--head <n>` prints only the first N lines (mutually exclusive with `--tail`). `--no-progress` keeps only the final state of each carriage-return progress redraw, and, for a line where Azure DevOps stored several progress bars glued together (e.g. a Trivy DB download), its timestamp plus the last bar (a line with a single bar is left alone) — opt-in, never applied automatically, even off a TTY

**`azdo pipeline artifacts <run_id>`**
- Lists the run's build artifacts (name, type — `Container` / `PipelineArtifact` — and size) from `GET build/builds/{id}/artifacts`; `--json` emits `[{ id, name, type, sizeBytes, downloadUrl }]`. Uses the CLI's own credential, so no separate `az login`

**`azdo pipeline artifact-download <run_id> [name]`**
- Downloads one artifact and **extracts it straight into the destination folder** — the zip is held in memory and never written to disk, so none is left behind, even on failure
- `--path <dir>` is the destination (default `./<name>`); `--all` downloads every artifact, each into `<dir>/<name>` (a name together with `--all` is rejected; neither is an error that lists the available artifacts); an unknown name also lists them
- Never overwrites an existing file unless `--force` is given; entries that would escape the destination (zip-slip), pass through a symbolic link in the destination, or collide with another entry abort the extraction before anything is written
- Memory: the zip is held in memory and extraction inflates every entry at once, so peak memory is a multiple of the artifact size (roughly the zip plus its full uncompressed size) — budget accordingly in memory-limited containers
- Silent by default: stdout carries only the destination path(s) (`--json`: `[{ name, path, files }]`); `--progress` adds byte-progress lines on stderr
- Both artifact types are fetched through the artifact's `downloadUrl` requested as `$format=zip`

**`azdo pipeline tests <run_id>`**
- Prints the run's test summary plus the failing tests **by name with their error messages** (Test Runs API, capped at 50) — replaces log grepping for "which tests failed"
- `--failed` prints only the failing tests; `--json` emits `{present, total, failed, failedTests}`

**`azdo pipeline start <def_id>`**
- Queues a new run and returns its id and link; `--branch <branch>` targets a branch (default: the pipeline's default), `--parameter key=value` (repeatable) passes template parameters
- Pipe the new id straight into `wait`: `RID=$(azdo pipeline start 12 --json | jq .id); azdo pipeline wait $RID`

## Work item comment commands

```bash
azdo comments list 12345
azdo comments list 12345 --json
azdo comments add 12345 "Investigation complete. Working on the fix next."
azdo comments add 12345 "Queued validation run." --json
```

**`azdo comments list`** — prints comments newest-first (ID, author, timestamp, body)

**`azdo comments add`** — requires non-empty text; fails locally before any API call when blank

## Work item attachments

```bash
azdo download-attachment 12345 screenshot.png                  # into the current directory
azdo download-attachment 12345 screenshot.png --output ./files # into an existing directory
azdo add-attachment 12345 ./screenshot.png --comment "Repro captured on staging"
azdo delete-attachment 12345 screenshot.png                    # prompts for confirmation
azdo delete-attachment 12345 screenshot.png --yes              # no prompt (required when stdin is not a TTY)
azdo delete-attachment 12345 screenshot.png --id <guid>        # pick one when several share the name
```

**`azdo download-attachment <id> <filename>`**
- Finds the attachment by its exact file name on the work item and writes it to `--output <dir>` (default `.`; the directory must exist)
- A name that is not attached to the work item fails with exit 1

**`azdo add-attachment <id> <file>`**
- Uploads the local file and links it to the work item as an `AttachedFile` relation; `--comment <text>` is stored with the link
- The file is read, and the work item is checked, **before** anything is uploaded, so a bad path or an inaccessible work item never leaves an orphaned attachment
- Prints the attachment name, size and GUID (`[id: <guid>]`)

**`azdo delete-attachment <id> <filename>`**
- Removes the attachment relation from the work item
- Asks `[y/N]` on a TTY; `-y, --yes` skips the prompt and is **required** in a non-interactive shell (without it the command exits 1 and removes nothing)
- When several attachments share the name, the command lists them and exits 1; re-run with `--id <guid>` to choose one

None of the three commands has `--json`.

## Work item relations

```bash
azdo relations types                   # relation types usable between work items (Child, Parent, Related, ...)
azdo relations types --json
azdo relations add child 1000 2000     # make #2000 a child of #1000 (idempotent)
azdo relations remove child 1000 2000  # remove it (idempotent)
azdo relations list 1000               # work item links on #1000, with target titles
azdo relations list 1000 --json
```

**`azdo relations types`**
- Lists the enabled work-item-to-work-item link types only (`usage: workItemLink`); resource links such as `ArtifactLink`, `Hyperlink` and `AttachedFile` are not listed

**`azdo relations add <type> <id1> <id2>`** / **`azdo relations remove <type> <id1> <id2>`**
- `<type>` is a relation type **name** as printed by `relations types` (`Child`, `Parent`, `Related`, …), matched case-insensitively — not the reference name (`System.LinkTypes.Hierarchy-Forward`)
- The relation is written on `<id1>` pointing at `<id2>`: `add child 1000 2000` makes #2000 a child of #1000
- Idempotent: adding an existing relation reports `already_exists`, removing a missing one reports `not_found`; both exit 0

**`azdo relations list <id>`**
- Lists only **work item link** relations. `ArtifactLink` (pull requests, commits, builds), `Hyperlink` and `AttachedFile` relations are omitted — use `azdo get-item` for attachments and `azdo pr work-items` to manage pull request links
- Target titles are fetched in one batch call; if that call fails the titles are `null` and the listing still succeeds

## azdo upsert

Creates a new work item or updates an existing one from a markdown document.

```bash
# Create a Bug
azdo upsert --type Bug --content $'---\nTitle: Improve markdown import UX\nState: New\n---'

# Update from a file (file is deleted after a successful write)
azdo upsert 12345 --file ./task-import.md

# JSON output
azdo upsert 12345 --content $'---\nSystem.Title: New title\n---' --json
```

Source flags (exactly one required): `--content <markdown>` or `--file <path>`

`--type` defaults to `Task` on create; not valid on update.

### Task document format

```md
---
Title: Improve markdown import UX
Assigned To: user@example.com
State: New
Tags: cli; markdown
Priority: null
---

## Description

Implement a single-command task import flow.

## Acceptance Criteria

- Supports create when no ID is passed
- Supports update when an ID is passed
```

Supported friendly names: `Title`, `Assigned To` / `assignedTo`, `State`, `Description`,
`Acceptance Criteria` / `acceptanceCriteria`, `Tags`, `Priority`.
Raw reference names (e.g. `System.Title`) are also accepted.

`null` or empty YAML fields → clear on update. Empty rich-text sections → clear on update. Omitted fields → untouched.

### JSON output shape

```json
{
  "action": "created",
  "id": 12345,
  "workItemType": "User Story",
  "fields": {
    "System.Title": "Improve markdown import UX"
  }
}
```

## Configuration

```bash
# Default scope (applies to all orgs unless overridden)
azdo config list
azdo config wizard
azdo config set markdown true
azdo config set fields "System.Tags,Custom.Priority"
azdo config set credentialStore dpapi  # Windows: DPAPI files instead of Credential Manager (SSH);
                                       # asks to copy existing credentials (--copy-credentials / --no-copy-credentials)
azdo config get fields
azdo config unset fields
azdo config list --json          # structured array with scope/key/value fields

# Per-org overrides
azdo config set project acme-proj --org acme
azdo config get project --org acme
azdo config unset project --org acme

# Org scope management
azdo config org-copy default acme       # copy default settings into org "acme"
azdo config org-copy acme globex        # copy between orgs
azdo config org-move acme globex        # move (removes source)
azdo config org-delete acme             # delete org scope
azdo config org-copy default acme --force   # overwrite on collision
```

### Settings

`azdo config --help` prints this table (generated from the CLI's own settings registry, so it
cannot drift), and `azdo config set|get|unset --help` point at it.

| Key | Meaning | Accepted values | Scope | Environment override |
| --- | --- | --- | --- | --- |
| `org` | Azure DevOps organization name (required) | string | global only | — |
| `project` | Azure DevOps project name (required) | string | global, or per organization with `--org` | — |
| `fields` | Extra work item fields to include | comma-separated reference names | global, or per organization with `--org` | — |
| `markdown` | Convert rich text fields to markdown on display | `true` / `false` | global, or per organization with `--org` | — |
| `credentialStore` | Where credentials are stored | `keyring` (OS vault, default) / `dpapi` (Windows only; DPAPI-encrypted files under `~/.azdo/credentials`) | global only | `AZDO_CREDENTIAL_STORE` |

Resolution order for `get-item`, `set-state`, and other work item commands:
1. `--org` / `--project` CLI flags
2. Git remote (any Azure DevOps remote, not just `origin`) — project names containing spaces are decoded automatically from the remote URL
3. Org-scoped config (`organizations.<org>.project`)
4. Default config (`project`)

### Credential resolution order

Credentials are never stored in the configuration file. Every command resolves one in this order
(also printed by `azdo config --help`):

1. the `AZDO_PAT` environment variable — wins over everything below
2. the stored credential for the organization — the OS credential store (see `azdo auth login`), or,
   with `azdo config set credentialStore dpapi` on Windows, DPAPI-encrypted files in `~/.azdo/credentials`
3. `AZDO_PAT` in a `.env` file, searched upwards from the working directory

Only `AZDO_PAT` is read — `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_EXT_PAT` and `AZDO_TOKEN` are **ignored**.
Pull request commands need the **Code (Read)** scope, or **Code (Read & Write)** to create, update or
comment; Work Items scopes alone are not enough. `azdo auth diagnose` shows which credential is in use.
Full detail: [authentication.md](authentication.md#credential-resolution-order).

`credentialStore` accepts `keyring` (default) or `dpapi` (Windows only) and is a global setting — it
cannot be set per organization. `azdo config set credentialStore dpapi` offers to copy the existing
Credential Manager credentials; `--copy-credentials` / `--no-copy-credentials` answer without a prompt.

## Authentication commands

```bash
azdo auth login --org myorg              # OAuth (Microsoft Entra), browser flow
azdo auth login --org myorg --device-code
azdo auth login --org myorg --use-pat    # PAT, masked prompt
echo "$PAT" | azdo auth login --org myorg --use-pat --from-stdin
azdo auth status                         # every stored org — never the token
azdo auth status --org myorg --json
azdo auth diagnose --json                # credential in use, connectivity, identity
azdo auth token --org myorg              # the token itself, on stdout only
azdo auth logout --org myorg             # or --all
```

`azdo login` does not exist — use `azdo auth login`. `azdo auth token` prints exactly the token plus a
newline (no `--json`); a PAT is sent as `Authorization: Basic base64(":<token>")`, an OAuth token as
`Authorization: Bearer <token>`. See [authentication.md](authentication.md) for the flows, the
audit log and the exit codes.

## Update notifications

On each command run `azdo` quietly checks the npm registry for a newer **stable**
release and, if one is found, prints a single line to **stderr** after the
command's own output:

```
A new version of azdo-cli is available: 0.5.0 → 0.6.0. Run `npm install -g azdo-cli@latest` to update.
```

The check is best-effort and never blocks or fails your command:

- **Throttled** to at most one registry lookup per 10 minutes (a failed check
  does not reset the window, so the next run may retry).
- **Suppressed** when output is non-interactive (piped, redirected, or in CI),
  so it never pollutes stdout/JSON.
- **Opt-out** with the global `--no-update-check` flag, e.g.
  `azdo --no-update-check get-item 1234`.

## JSON output contracts

Commands that produce structured data accept `--json` and write **one JSON document to stdout**;
errors and advisories always go to stderr. The shapes below are what automation should parse;
a value Azure DevOps may omit is emitted as `null`.

Commands **without** `--json`: `get-item`, `get-md-field`, `download-attachment`, `add-attachment`,
`delete-attachment`, `auth token`, `auth login`, `auth logout`, `config org-copy|org-move|org-delete|wizard`.

### Pull requests

The pull request object shared by `pr list`, `pr status`, `pr open` and `pr comments`:

```jsonc
{
  "id": 64,
  "title": "Fix the thing",
  "repository": "azdo-cli",
  "sourceRefName": "refs/heads/feature/x",
  "targetRefName": "refs/heads/develop",
  "status": "active",                    // active | completed | abandoned
  "createdBy": "Jane Doe",               // display name — not unique, not stable
  "createdByUniqueName": "jane@contoso.com",
  "createdById": "<identity GUID>",
  "url": "https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/64",
  "description": "Because X was broken", // null when empty
  "isDraft": false,
  "creationDate": "2026-09-01T10:00:00Z",
  "closedDate": null,                    // set once completed or abandoned
  "reviewers": [
    { "id": "<identity GUID>", "displayName": "Bob", "uniqueName": "bob@contoso.com",
      "isRequired": true, "vote": 10 }    // 10 approved, 5 with suggestions, 0 none, -5 waiting, -10 rejected
  ],
  "labels": ["needs-review"]             // active label names
}
```

| Command | `--json` shape |
| --- | --- |
| `pr list` | `{ repository, branch, status, pullRequests: [PullRequest] }` — `branch` is `null` without `--branch`; `status` echoes the filter; with `--work-items` each PR also carries `workItemIds: [number]` (sorted, `[]` when none) |
| `pr status` | `{ branch, repository, pullRequests: [PullRequest & { checks: [Check], codeCommentCounts: { open, closed }, checksError? }] }` |
| `pr open` | `{ id, url, branch, targetBranch, created, pullRequest: PullRequest }` — `id`/`url` repeat `pullRequest.id`/`url`; `created: false` when an active PR already existed |
| `pr update` / `pr edit` | `{ pullRequestId, title, description, url, noop, updatedFields }` — `updatedFields` ⊆ `["title","description"]`, `[]` on a no-op |
| `pr abandon` / `pr close` / `pr reactivate` | `{ pullRequestId, title, status, previousStatus, url, noop }` |
| `pr comments` | `{ branch, pullRequest: PullRequest, threads: [Thread] }` |
| `pr comments add` / `pr comment-add` | `{ pullRequestId, threadId, commentId, status, content, dryRun }` — `threadId` / `commentId` are `null` on `--dry-run`; `status` is `null` without `--status` |
| `pr comments edit` / `pr comment-edit` | `{ pullRequestId, threadId, commentId, previousContent, content, dryRun }` |
| `pr comments reply` / `pr comment-reply` | `{ pullRequestId, threadId, commentId, content }` |
| `pr comment-resolve` / `pr comment-reopen` | `{ pullRequestId, threadId, status, noop }` — on a no-op `status` is the thread's actual backend status |
| `pr work-items link` / `unlink` | `{ pullRequestId, workItemId, noop }` |
| `pr reviewers list` | `{ pullRequestId, reviewers: [{ id, displayName, uniqueName, isRequired, vote, voteState, hasDeclined }] }` — `voteState` ∈ `approved` \| `approved-with-suggestions` \| `no-vote` \| `waiting-for-author` \| `rejected` \| `bypassed` \| `unknown` |
| `pr reviewers add` / `remove` | `{ pullRequestId, reviewer: { id, displayName, uniqueName, isRequired } \| null, noop }` |

`Check` (in `pr status`):

```jsonc
{
  "id": 1, "state": "succeeded", "name": "CI", "description": null, "targetUrl": null,
  "createdBy": null, "createdAt": null, "updatedAt": null,
  "source": "policy",   // status | policy | build
  "isBlocking": true    // policy checks: true/false; build checks: null; status checks: property absent
}
```

`Thread` and its comments (in `pr comments`):

```jsonc
{
  "id": 148,
  "status": "active",           // active | pending | fixed | wontFix | closed | byDesign | unknown
  "threadContext": "src/a.ts",  // file path of a code-anchored thread; null for overview threads
  "line": 42,                   // null for overview threads
  "comments": [
    {
      "id": 1,
      "author": "Jane Doe",
      "content": "Please rename this.",
      "publishedAt": "2026-09-30T09:00:00Z",
      "commentType": "text",    // text | system
      "truncated": false,       // true when --max-chars cut the body
      "originalLength": 19
    }
  ]
}
```

### Work items

| Command | `--json` shape |
| --- | --- |
| `set-state`, `assign`, `set-field` | `{ id, rev, title, field, value }` (one line) |
| `set-md-field` | `{ id, rev, field, value }` (one line) |
| `upsert` | `{ action, id, workItemType, fields }` — see [JSON output shape](#json-output-shape) |
| `list-items` | `[{ id, title, description, url, state, tags, assignedTo }]` — `description` markdown, `tags` array |
| `list-fields` | `{ id, fields: { "<reference name>": <value> } }` |
| `comments list` | `{ workItemId, count, comments: [{ id, workItemId, text, author, createdAt, modifiedAt, isDeleted }] }` |
| `comments add` | `{ workItemId, commentId, text, author, createdAt, url }` |
| `relations types` | `[{ referenceName, name, usage, enabled, directional }]` |
| `relations add` | `{ status, type, referenceName, id1, id2 }` — `status` is `added` or `already_exists` |
| `relations remove` | `{ status, type, referenceName, id1, id2 }` — `status` is `removed` or `not_found` |
| `relations list` | `{ workItemId, relations: [{ rel, relName, targetId, targetTitle, targetUrl, comment }] }` |

### Pipelines

| Command | `--json` shape |
| --- | --- |
| `pipeline list` | `[{ id, name, folder }]` — `folder` is `null` for root-level definitions |
| `pipeline get-runs` | `[Run]` where `Run` is `{ id, name, state, result, createdDate, finishedDate, sourceBranch, sourceCommit }` — `state` is `inProgress`, `completed` or `unknown`; `result` is `succeeded`, `failed`, `canceled` or `null` |
| `pipeline wait` | `{ id, state, result, timedOut }` — the exit code still reflects the result |
| `pipeline get-run-detail` | `Run & { startedDate, durationSeconds, reason, requestedFor, webUrl, errors: [{ message, source }], errorsAvailable, stages: [Stage], jobs: [Stage], tests: { present, total, failed, failedTests }, testsAvailable }` where `Stage` is `{ name, state, result }` |
| `pipeline logs` | `[{ id, createdOn, lineCount, step, type, parent }]` — with `--log-id` / `--step` the log text is printed as-is and `--json` has no effect |
| `pipeline tests` | `{ present, total, failed, failedTests: [{ name, errorMessage }] }` |
| `pipeline artifacts` | `[{ id, name, type, sizeBytes, downloadUrl }]` |
| `pipeline artifact-download` | `[{ name, path, files }]` |
| `pipeline start` | `{ id, state, webUrl }` — `RID=$(azdo pipeline start 12 --json \| jq .id)` |

### Authentication and configuration

| Command | `--json` shape |
| --- | --- |
| `auth status` (no `--org`) | `{ orgs: [{ org, kind, backend, accountId?, expiresAt?, scope? }] }` — `kind` is `pat` or `oauth`; the OAuth-only fields are absent for a PAT; `expiresAt` is epoch seconds |
| `auth status --org <o>` | `{ org, backend, stored, masked, updated_at }` — exit 1 with `stored: false` when nothing is stored; `masked` is a masked preview, never the token |
| `auth diagnose` | `{ authType, credentialSource, org, project, connectivityStatus, connectivityError, identity }` |
| `config set` | `{ key, value, scope }` — plus `credentialsCopied` after `set credentialStore dpapi` copied credentials |
| `config list` | `[{ scope, key, value }]` |
| `config get` | `{ key, value, scope }` |
| `config unset` | `{ key, unset: true, scope }` |

`auth diagnose` fields: `authType` is `pat`, `oauth` or `none`; `connectivityStatus` is `ok`, `failed`
or `no-credentials`; `identity` is `{ displayName, uniqueName, id }` — who the credential belongs to,
from Azure DevOps' `connectionData` — or `null` when there is no credential, connectivity failed, or the
lookup failed. Compare `identity.uniqueName` with a pull request's `createdByUniqueName`.
`auth status --json` does **not** carry `identity`; use `auth diagnose --json` for that.
