# Grounding Report: Delete Work Items

**Date**: 2026-10-29

## Original Feature Idea

> I want to delete work items

## Capability Report

- Azure DevOps supports deletion of a single work item to the Recycle Bin. It also supports deletion of multiple work items.
- Permanent deletion is a separate option. The user excluded this option.
- Deletion requires the project permission to delete and restore work items. The documented authorization scope is `vso.work_write`. An authorization scope does not replace project permissions.
- Restore and Recycle Bin management are separate operations. They are outside this feature.
- The command reference lists deletion of comments and attachments. It does not list deletion of whole work items.
- Use recoverable deletion only. Do not request permanent destruction. Select the single-item or batch transport during planning. Do not assume that a batch request is atomic.
- The documentation does not establish a batch size limit or an atomicity guarantee for this feature. Planning must check these points before it selects the transport.

## Sources

Context7 lookup used `/microsoftdocs/azure-devops-docs`. The Microsoft Learn MCP tool was not available, so the official REST reference was checked through web search.

- [Delete a work item](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/delete?view=azure-devops-rest-7.1)
- [Delete multiple work items](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/delete-work-items?view=azure-devops-rest-7.1)
- [Work tracking permissions](https://learn.microsoft.com/en-us/azure/devops/security/set-permissions-access-work-tracking?view=azure-devops)
- [Recycle Bin operations](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/recyclebin?view=azure-devops-rest-7.1)

## Questions and Answers

1. Should deletion use the Recycle Bin only, offer permanent deletion as an option, or use permanent deletion only?
   - User answer: "A". This selects the Recycle Bin only.
2. Should one command accept one or more explicit work item IDs, or one ID only?
   - User answer: "one or more ok".

## Grounded Feature Summary

Let users delete one or more work items by explicit ID in one command. Move these items to the Azure DevOps Recycle Bin. Exclude permanent deletion, restore, query-based selection, and automatic deletion of related items. Report the result for each requested item. Use the existing organization, project, and authentication settings. Assume confirmation for interactive use and an explicit confirmation option for scripts, consistent with attachment deletion.
