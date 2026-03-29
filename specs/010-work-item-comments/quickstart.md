# Quickstart: Work Item Comments

## Prerequisites

- Configure Azure DevOps authentication using the existing CLI PAT flow.
- Ensure the target work item exists in the resolved organization and project.

## Read comment history

```bash
azdo comments list 123
```

Expected result:

- The CLI prints the visible comment history for work item `123`, newest comment first.
- If no comments exist, the CLI prints `Work item #123 has no comments.`

## Read comment history as JSON

```bash
azdo comments list 123 --json
```

Expected result:

- The CLI prints a JSON object containing `workItemId`, `count`, and a `comments` array.

## Post a progress update

```bash
azdo comments add 123 "Investigation complete. Working on the fix next."
```

Expected result:

- Azure DevOps creates a new comment on work item `123`.
- The CLI prints `Added comment #<commentId> to work item #123`.

## Post a progress update as JSON

```bash
azdo comments add 123 "Queued validation run." --json
```

Expected result:

- The CLI prints a JSON object containing `workItemId`, `commentId`, and the created comment metadata.

## Failure examples

```bash
azdo comments add 123 "   "
```

Expected result:

- The CLI rejects the request locally with `Error: Comment text must be a non-empty string.`
