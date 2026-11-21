# Pipelines

Every `pipeline` subcommand accepts `--json`, `--org` and `--project`. Runs
are identified by run id, pipelines by definition id.

## Find a run

```bash
azdo pipeline list --filter ci --json            # definition ids and names
azdo pipeline get-runs 12 --limit 5 --json       # newest first
azdo pipeline get-runs 12 --branch develop --json
azdo pipeline get-runs --commit abc123f --json   # runs that built a commit
azdo pipeline get-runs --pr 4664 --json          # validation runs of a pull request
```

## Start a run and wait for it

```bash
RID=$(azdo pipeline start 12 --branch develop --parameter env=staging --json | jq .id)
azdo pipeline wait "$RID" --timeout 1800 --poll-interval 10
```

`pipeline wait` sets its exit code from the result: `0` succeeded, `1` failed,
`2` canceled, `124` timed out (the run keeps going). Use it as the loop
condition after a push: `azdo pipeline wait "$RID" || azdo pipeline get-run-detail "$RID" --json`.

## Find out why a run failed

Work from the cheapest call to the most expensive:

```bash
azdo pipeline get-run-detail 3456 --json   # result, errors, stages, jobs, failing tests
azdo pipeline tests 3456 --failed --json   # failing tests with their error messages
azdo pipeline logs 3456 --json             # list logs: id, step, type, parent, lineCount
azdo pipeline logs 3456 --step "Run tests" --tail 100
azdo pipeline logs 3456 --log-id 7 --grep 'error CS' --context 5
azdo pipeline logs 3456 --log-id 7 --head 40 --no-progress
```

- `get-run-detail` often answers the question alone; read logs only when it
  does not.
- Prefer `--step` to `--log-id`: step names are stable across runs.
- Always narrow a log with `--tail`, `--head` or `--grep`; whole logs are
  large. With `--log-id` or `--step` the text is printed as-is and `--json` has
  no effect.

## Artifacts

```bash
azdo pipeline artifacts 3456 --json
azdo pipeline artifact-download 3456 scan-results --path ./out --json
azdo pipeline artifact-download 3456 --all --path ./artifacts
```

The artifact is extracted straight into the folder. Existing files are not
overwritten unless you pass `--force`.
