# Contract: `azdo pr update`

## C-1 — Transport

```http
PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullrequests/{prId}?api-version=7.1
Content-Type: application/json

{"title":"…"}            # --title only
{"description":"…"}      # --description only
{"title":"…","description":"…"}   # both
```

The body contains **only** the fields the operator supplied and that differ
from the current value. No other `GitPullRequest` property is ever sent.

## C-2 — Exit codes (inherited from the `pr` group)

| Code | Condition |
| --- | --- |
| 0 | update applied, or no-op |
| 1 | validation failure (no field given, mutually exclusive pair, empty value, bad `--pr-number`, over-length description, stdin used twice) |
| 1 | branch resolved to zero or multiple active PRs (contract C-2/C-3 of 019, verbatim messages) |
| 3 | `--pr-number` names a pull request that does not exist |
| 4 | authentication failure / permission denied |

## C-3 — Validation messages (verbatim)

```
Error: pr update requires at least one of --title, --title-file, --description or --description-file.
Error: Cannot specify both --title and --title-file.
Error: Cannot specify both --description and --description-file.
Error: Cannot read standard input twice; only one of --title-file and --description-file may be "-".
Error: Title must not be empty. Pass the text inline or use --title-file <path>.
Error: Description must not be empty. Pass the text inline or use --description-file <path>.
Error: description is 4207 characters, exceeding the Azure DevOps limit of 4000 characters. Shorten the description by at least 207 characters.
```

## C-4 — Human output

Applied:

```
Updated pull request #96 (title, description).
https://dev.azure.com/org/proj/_git/repo/pullrequest/96
```

No-op:

```
Pull request #96 already has the requested title and description; nothing to update.
```

(The parenthesised list names only the fields that were actually written; the
no-op sentence names only the fields that were requested.)

## C-5 — `--json`

```json
{
  "pullRequestId": 96,
  "title": "pr: add azdo pr update",
  "description": "Full body …",
  "url": "https://dev.azure.com/org/proj/_git/repo/pullrequest/96",
  "noop": false,
  "updatedFields": ["title"]
}
```

`updatedFields` is `[]` when `noop` is `true`. `description` is `null` when the
pull request has none.

## C-6 — Template semantics

`pr update --description` / `--description-file` replaces the description
**literally**. The repository pull request template is never resolved and never
prepended — unlike `pr open`, where it still is. This is the whole reason the
two commands do not share description handling.

## C-7 — `-` means stdin

`--title-file -`, `--description-file -` and (on `pr open`)
`--description-file -` read UTF-8 from standard input. The same support lands on
`pr comments add|edit|reply --file -`, which previously failed with
`File not found: -`.
