# Tasks: Work Item Attachments

**Branch**: `014-work-item-attachments`
**Plan**: [plan.md](plan.md)
**Spec**: [spec.md](spec.md)

## Task 1: Add WorkItemAttachment type and update WorkItem interface

**Priority**: P1 (foundation for all other tasks)
**Files**: `src/types/work-item.ts`

- [ ] Add `WorkItemAttachment` interface with `name: string`, `size: number`, `url: string`
- [ ] Add optional `attachments: WorkItemAttachment[] | null` field to `WorkItem` interface

## Task 2: Modify getWorkItem to fetch and return attachments

**Priority**: P1 (required by both get-item display and download command)
**Files**: `src/services/azdo-client.ts`, `tests/unit/azdo-client.test.ts`

- [ ] Write tests for `getWorkItem` returning attachments from relations
- [ ] Write test for `getWorkItem` returning `null` attachments when no `AttachedFile` relations exist
- [ ] Modify `getWorkItem` to add `$expand=relations` to the API request URL
- [ ] Add `AzdoRelation` interface for the API response shape
- [ ] Parse relations array, filter for `rel === "AttachedFile"`, extract `name`, `resourceSize`, and `url`
- [ ] Return parsed attachments in the `WorkItem` result (null if none)

## Task 3: Display attachments in get-item output

**Priority**: P1 (User Story 1)
**Files**: `src/commands/get-item.ts`, `tests/unit/get-item-attachments.test.ts`

- [ ] Write tests for `formatWorkItem` displaying attachments list
- [ ] Write test for `formatWorkItem` showing attachment count in short mode
- [ ] Write test for `formatWorkItem` omitting attachments when none present
- [ ] Add `formatFileSize` helper to format bytes as human-readable (KB, MB, etc.)
- [ ] Update `formatWorkItem` to display "Attachments:" section with filename and size when `workItem.attachments` is present
- [ ] Update `formatWorkItem` to display "Attachments: N" count in short mode

## Task 4: Add downloadAttachment service function

**Priority**: P2 (required by download command)
**Files**: `src/services/azdo-client.ts`, `tests/unit/azdo-client.test.ts`

- [ ] Write test for `downloadAttachment` fetching binary content from URL
- [ ] Write test for `downloadAttachment` handling 404 response
- [ ] Implement `downloadAttachment(url: string, pat: string): Promise<ArrayBuffer>` that fetches the attachment binary content with auth headers

## Task 5: Create download-attachment command

**Priority**: P2 (User Story 2)
**Files**: `src/commands/download-attachment.ts`, `tests/unit/download-attachment.test.ts`

- [ ] Write test for command resolving attachment by filename and saving to current directory
- [ ] Write test for command with `--output` option saving to specified directory
- [ ] Write test for command error when attachment filename not found
- [ ] Write test for command error when output directory does not exist
- [ ] Create `download-attachment` command with `<id>` and `<filename>` arguments
- [ ] Add `--org`, `--project`, `--output` options
- [ ] Implement: resolve context, get work item with attachments, find matching attachment, download, write to disk
- [ ] Use `node:fs/promises` writeFile and `node:path` join for file output
- [ ] Display success message with filename, size, and path

## Task 6: Register download-attachment command in CLI

**Priority**: P2 (wiring)
**Files**: `src/index.ts`, `tests/unit/cli.test.ts`

- [ ] Import `createDownloadAttachmentCommand` in `src/index.ts`
- [ ] Add `program.addCommand(createDownloadAttachmentCommand())` to CLI
- [ ] Verify CLI recognizes the new command (existing CLI test pattern)

## Task 7: Final validation

**Priority**: P2
**Files**: N/A

- [ ] Run `npm test && npm run lint` and fix any failures
- [ ] Verify all tasks above are marked complete
