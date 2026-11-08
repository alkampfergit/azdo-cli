# Work items

Commands take the numeric work item id. Pass `--org` and `--project` together,
or neither. Fields are named by reference name (`System.Title`,
`Microsoft.VSTS.Common.Priority`); `azdo list-fields <id> --json` shows the
names a work item really has.

## Read

```bash
azdo get-item 12345 --json                     # id, title, description (markdown), state, tags, assignedTo, createdBy, url, relations
azdo get-item 12345 --fields "System.Tags,Microsoft.VSTS.Common.Priority"
azdo list-items --state Active --tag ready --json
azdo list-items --assigned-to @me --title-contains login --top 20 --json
azdo list-fields 12345 --json                  # every field with its value
azdo get-md-field 12345 System.Description     # one rich-text field as markdown (no --json)
```

- `get-item --json` lists **every** relation, linked pull requests included
  (`relations[].pullRequest.id`).
- `list-items` filters combine with AND; `--top` defaults to 50 (max 1000). No
  match prints `[]`.
- `assignedTo` in `get-item --json` is `{ displayName, uniqueName, id }` or
  `null`; in `list-items --json` it is the display name or `null`.
- `--download-images` / `--resize-images <px>` / `--images-path <dir>` on
  `get-item` or `get-md-field` save embedded images as files, so you can look
  at screenshots. They cannot be combined with `--json`.

## Change one field

```bash
azdo set-state 12345 "Active" --json
azdo assign 12345 "someone@company.com" --json
azdo assign 12345 --unassign --json
azdo set-field 12345 System.Title "Updated title" --json
azdo set-md-field 12345 System.Description --file ./description.md --json
cat notes.md | azdo set-md-field 12345 System.Description --json   # content from stdin
```

`set-md-field` stores the field as Markdown. The state must be a valid state
for the work item type (`New`, `Active`, `Closed`, … depend on the process).

## Create or update from markdown — `upsert`

```bash
azdo upsert --type Bug --file ./bug.md --json   # create (type defaults to Task)
azdo upsert 12345 --file ./update.md --json     # update; --type is not allowed here
```

The document is YAML front matter plus `##` sections:

```md
---
Title: Improve markdown import UX
Assigned To: user@example.com
State: New
Tags: cli; markdown
Priority: 2
---

## Description

What and why.

## Acceptance Criteria

- One testable line per criterion
```

- **`--file` deletes the file after a successful write.** Write a temporary
  copy, or use `--content` for small documents.
- Friendly keys: `Title`, `Assigned To`, `State`, `Description`,
  `Acceptance Criteria`, `Tags`, `Priority`; reference names (`System.Title`)
  also work.
- On update, an omitted field is left alone; `null` or an empty value or
  section **clears** the field.
- `--json` returns `{ action, id, workItemType, fields }` with `action`
  `created` or `updated`; keep the `id` of a new item.

## Comments

```bash
azdo comments list 12345 --json
azdo comments add 12345 "Investigation done, fix in PR 42." --json   # text is inline only
azdo comments edit 12345 987 --file note.md --markdown --json
azdo comments delete 12345 987 --json          # no prompt, not idempotent
```

- Comments are HTML unless you pass `--markdown` (on `add` and `edit`).
- `comments add` takes the text only as an argument. For a long body, add a
  short comment and then rewrite it with `comments edit … --file -`.
- To tell whether a comment is yours, compare `authorId` with `identity.id` from
  `azdo auth diagnose --json`.
- `comments add --json` returns `commentId`; keep it to edit or delete later.

## Attachments (no `--json`)

```bash
azdo add-attachment 12345 ./screenshot.png --comment "Repro on staging"
azdo download-attachment 12345 screenshot.png --output ./files
azdo delete-attachment 12345 screenshot.png --yes      # --yes is required without a TTY
azdo delete-attachment 12345 screenshot.png --id <guid> --yes   # when names collide
```

## Links

- Parent/child and related items: `references/relations.md`.
- Linking a pull request: `azdo pr work-items link <id>` in
  `references/pull-requests.md`.
