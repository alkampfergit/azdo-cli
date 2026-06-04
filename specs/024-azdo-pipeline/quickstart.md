# Quickstart: `azdo pipeline` command group (024)

Manual verification once implemented. Requires an Azure DevOps project with at
least one pipeline and some run history, and queue permission for `start`.

## 0. Build
```bash
npm run lint && npm test && npm run build
```

## 1. List + filter (US1)
```bash
azdo pipeline list
azdo pipeline list --filter ci
azdo pipeline list --json | jq '.[].id'
```

## 2. Runs for a definition (US2)
```bash
azdo pipeline get-runs <def_id>
azdo pipeline get-runs <def_id> --limit 5 --branch develop
azdo pipeline get-runs <def_id> --branch develop --limit 1 --json | jq '.[0].id'
```

## 3. Wait + exit code (US3) — the AI-agent loop
```bash
azdo pipeline wait <run_id>; echo "exit=$?"     # 0 success, non-zero fail/cancel
azdo pipeline wait <run_id> --timeout 60; echo "exit=$?"   # distinct code on timeout
```

## 4. Run detail (US4)
```bash
azdo pipeline get-run-detail <run_id>           # date, commit, result, errors, stages, tests, link
azdo pipeline get-run-detail <run_id> --json | jq '{result, failed: .tests.failed, errors: (.errors|length)}'
```
Verify a no-tests run shows "no tests present" (not "0 failures").

## 5. Logs (US5)
```bash
azdo pipeline logs <run_id>
azdo pipeline logs <run_id> --log-id <id>
```

## 6. Start (US6)
```bash
azdo pipeline start <def_id> --branch develop
azdo pipeline start <def_id> --branch develop --parameter env=staging --json | jq .id
```

## 7. End-to-end agent loop
```bash
RID=$(azdo pipeline start <def_id> --branch "$(git branch --show-current)" --json | jq .id)
if azdo pipeline wait "$RID"; then echo "green"; else azdo pipeline get-run-detail "$RID"; fi
```

## 8. Regression
```bash
npm test   # all existing + new pipeline unit tests pass
```
