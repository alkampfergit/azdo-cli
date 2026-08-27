# Quickstart: Work Item Attachment Create/Delete

Prerequisites: `azdo` authenticated (`azdo auth login` or a valid PAT), a target work item ID you can edit.

## Attach a file

```bash
azdo add-attachment 123 ./screenshot.png
azdo add-attachment 123 ./repro.log --comment "Repro captured on staging"
```

Note the `id:` printed on success — it's the attachment's stable GUID, needed later only if you ever have two attachments with the same filename.

## Verify it landed

```bash
azdo get-item 123
# or, to fetch the bytes back:
azdo download-attachment 123 screenshot.png
```

## Remove an attachment

```bash
azdo delete-attachment 123 screenshot.png
# prompts: Remove "screenshot.png" from work item 123? [y/N]
```

Non-interactively (scripts/CI):

```bash
azdo delete-attachment 123 screenshot.png --yes
```

## If the filename is ambiguous (two attachments share it)

```bash
azdo delete-attachment 123 screenshot.png
# Error: multiple attachments named "screenshot.png" on work item 123:
#   3f9a1c...  128 KB  2026-08-20
#   9be207...  131 KB  2026-08-27
# Re-run with --id <guid> to remove a specific one.

azdo delete-attachment 123 screenshot.png --id 9be207... --yes
```
