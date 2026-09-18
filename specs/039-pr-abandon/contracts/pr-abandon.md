# Contract: `azdo pr abandon` / `azdo pr reactivate`

## C-1 — Transport

```http
PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullrequests/{prId}?api-version=7.1
Content-Type: application/json

{"status":"abandoned"}   # pr abandon
{"status":"active"}      # pr reactivate
```

The body carries **only** `status`. No other `GitPullRequest` property is sent
(038 C-1, same reason).

## C-2 — Target resolution

| Command | `--pr-number` given | `--pr-number` omitted |
| --- | --- | --- |
| `pr abandon` | `GET .../pullrequests/{id}` | the branch's single **active** PR |
| `pr reactivate` | `GET .../pullrequests/{id}` | the branch's single **abandoned** PR |

Zero/multi match messages (exit 1, verbatim, no `Error: ` prefix):

```
No open pull request matches branch feature/x. Pass --pr-number to target a specific PR, or push the branch and open a pull request.
Multiple open pull requests match branch feature/x: #1, #2. Re-run with --pr-number to choose.
No abandoned pull request matches branch feature/x. Pass --pr-number to target a specific PR.
Multiple abandoned pull requests match branch feature/x: #1, #2. Re-run with --pr-number to choose.
```

The first two are the pinned 019 C-2/C-3 strings, unchanged.

## C-3 — Exit codes (inherited from the `pr` group)

| Code | Condition |
| --- | --- |
| 0 | status changed, or no-op |
| 1 | validation failure (bad `--pr-number`, completed pull request, zero/multi branch match) |
| 3 | `--pr-number` names a pull request that does not exist |
| 4 | authentication failure / permission denied |

## C-4 — Validation messages (verbatim)

```
Error: Invalid --pr-number "abc"; expected a positive integer.
Error: Pull request #97 is completed and cannot be abandoned. A completed pull request is final; revert it with a new pull request instead.
Error: Pull request #97 is completed and cannot be reactivated. A completed pull request is final; revert it with a new pull request instead.
```

## C-5 — Human output

Applied:

```
Abandoned pull request #97 (pr: add azdo pr abandon).
https://dev.azure.com/org/proj/_git/repo/pullrequest/97
```

```
Reactivated pull request #97 (pr: add azdo pr abandon).
https://dev.azure.com/org/proj/_git/repo/pullrequest/97
```

No-op:

```
Pull request #97 is already abandoned; nothing to do.
Pull request #97 is already active; nothing to do.
```

## C-6 — `--json`

```json
{
  "pullRequestId": 97,
  "title": "pr: add azdo pr abandon",
  "status": "abandoned",
  "previousStatus": "active",
  "url": "https://dev.azure.com/org/proj/_git/repo/pullrequest/97",
  "noop": false
}
```

On a no-op, `noop` is `true` and `status` equals `previousStatus` (both the
pull request's real backend status).

## C-7 — No prompt

Neither command reads stdin and neither branches on `process.stdout.isTTY`.
Abandoning is reversible via `pr reactivate`, so the confirmation would buy
nothing and would break every scripted caller.

## C-8 — `close` alias

`azdo pr close` is `azdo pr abandon`. It does **not** complete or merge the pull
request; the help text says so explicitly. Completing a pull request is out of
scope for this feature.
