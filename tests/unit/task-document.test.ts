import { describe, expect, it } from 'vitest';
import { parseTaskDocument, resolveFieldName } from '../../src/services/task-document.js';

describe('task-document parser', () => {
  it('resolves friendly aliases and raw reference names', () => {
    expect(resolveFieldName('title')).toBe('System.Title');
    expect(resolveFieldName('Assigned To')).toBe('System.AssignedTo');
    expect(resolveFieldName('System.Title')).toBe('System.Title');
    expect(resolveFieldName('not a field')).toBeNull();
  });

  it('parses front matter scalar fields with clear semantics', () => {
    const document = parseTaskDocument(`---
title: Fix login bug
assignedTo: jane@example.com
priority: null
System.State:
---
`);

    expect(document.fields).toEqual([
      { refName: 'System.Title', value: 'Fix login bug', op: 'set', kind: 'scalar' },
      { refName: 'System.AssignedTo', value: 'jane@example.com', op: 'set', kind: 'scalar' },
      { refName: 'Microsoft.VSTS.Common.Priority', value: null, op: 'clear', kind: 'scalar' },
      { refName: 'System.State', value: null, op: 'clear', kind: 'scalar' },
    ]);
  });

  it('parses mixed front matter and rich-text sections', () => {
    const document = parseTaskDocument(`---
Title: Improve markdown import UX
State: New
System.Tags: cli; markdown
---

## Description
Implement a single-command task import flow.

## Acceptance Criteria
- Supports create when no ID is passed
- Supports update when an ID is passed
`);

    expect(document.fields).toEqual([
      { refName: 'System.Title', value: 'Improve markdown import UX', op: 'set', kind: 'scalar' },
      { refName: 'System.State', value: 'New', op: 'set', kind: 'scalar' },
      { refName: 'System.Tags', value: 'cli; markdown', op: 'set', kind: 'scalar' },
      { refName: 'System.Description', value: 'Implement a single-command task import flow.', op: 'set', kind: 'rich-text' },
      {
        refName: 'Microsoft.VSTS.Common.AcceptanceCriteria',
        value: '- Supports create when no ID is passed\n- Supports update when an ID is passed',
        op: 'set',
        kind: 'rich-text',
      },
    ]);
  });

  it('treats an empty heading section as a clear operation', () => {
    const document = parseTaskDocument(`## Description
   
## Acceptance Criteria
Ready
`);

    expect(document.fields[0]).toEqual({
      refName: 'System.Description',
      value: null,
      op: 'clear',
      kind: 'rich-text',
    });
  });

  it('rejects unknown rich-text field aliases', () => {
    expect(() => parseTaskDocument(`## Unknown Field
body
`)).toThrow('Unknown rich-text field: Unknown Field');
  });

  it('rejects unmappable rich-text reference names', () => {
    expect(() => parseTaskDocument(`## system.description
body
`)).toThrow('Unknown rich-text field: system.description');
  });

  it('rejects duplicate rich-text heading sections', () => {
    expect(() => parseTaskDocument(`## Description
first

## System.Description
second
`)).toThrow('Duplicate field: System.Description');
  });

  it('rejects duplicates across front matter and heading sections', () => {
    expect(() => parseTaskDocument(`---
Description: Summary
---

## Description
More detail
`)).toThrow('Duplicate field: System.Description');
  });

  it('rejects malformed front matter in mixed documents', () => {
    expect(() => parseTaskDocument(`---
Title Improve markdown import UX
---

## Description
Body
`)).toThrow('Malformed YAML front matter');
  });
});
