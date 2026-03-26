import { describe, expect, it } from 'vitest';
import { parseTaskDocument, resolveFieldName } from '../../src/services/task-document.js';

function scalarField(refName: string, value: string | null) {
  return {
    refName,
    value,
    op: value === null ? 'clear' : 'set',
    kind: 'scalar' as const,
  };
}

function richTextField(refName: string, value: string | null) {
  return {
    refName,
    value,
    op: value === null ? 'clear' : 'set',
    kind: 'rich-text' as const,
  };
}

function frontMatterDocument(...lines: string[]): string {
  return `---\n${lines.join('\n')}\n---\n`;
}

function mixedDocument(frontMatterLines: string[], sectionLines: string[]): string {
  return `${frontMatterDocument(...frontMatterLines)}\n${sectionLines.join('\n')}\n`;
}

function richTextDocument(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function expectParseError(document: string, message: string): void {
  expect(() => parseTaskDocument(document)).toThrow(message);
}

describe('task-document parser', () => {
  it('resolves friendly aliases and raw reference names', () => {
    expect(resolveFieldName('title')).toBe('System.Title');
    expect(resolveFieldName('Assigned To')).toBe('System.AssignedTo');
    expect(resolveFieldName('System.Title')).toBe('System.Title');
    expect(resolveFieldName('not a field')).toBeNull();
  });

  it('parses front matter scalar fields with clear semantics', () => {
    const document = parseTaskDocument(
      frontMatterDocument(
        'title: Fix login bug',
        'assignedTo: jane@example.com',
        'priority: null',
        'System.State:',
      ),
    );

    expect(document.fields).toEqual([
      scalarField('System.Title', 'Fix login bug'),
      scalarField('System.AssignedTo', 'jane@example.com'),
      scalarField('Microsoft.VSTS.Common.Priority', null),
      scalarField('System.State', null),
    ]);
  });

  it('parses mixed front matter and rich-text sections', () => {
    const document = parseTaskDocument(
      mixedDocument(
        ['Title: Improve markdown import UX', 'State: New', 'System.Tags: cli; markdown'],
        [
          '## Description',
          'Implement a single-command task import flow.',
          '',
          '## Acceptance Criteria',
          '- Supports create when no ID is passed',
          '- Supports update when an ID is passed',
        ],
      ),
    );

    expect(document.fields).toEqual([
      scalarField('System.Title', 'Improve markdown import UX'),
      scalarField('System.State', 'New'),
      scalarField('System.Tags', 'cli; markdown'),
      richTextField('System.Description', 'Implement a single-command task import flow.'),
      richTextField(
        'Microsoft.VSTS.Common.AcceptanceCriteria',
        '- Supports create when no ID is passed\n- Supports update when an ID is passed',
      ),
    ]);
  });

  it('treats an empty heading section as a clear operation', () => {
    const document = parseTaskDocument(richTextDocument('## Description', '   ', '## Acceptance Criteria', 'Ready'));

    expect(document.fields[0]).toEqual(richTextField('System.Description', null));
  });

  it('rejects unknown rich-text field aliases', () => {
    expectParseError(richTextDocument('## Unknown Field', 'body'), 'Unknown rich-text field: Unknown Field');
  });

  it('rejects unmappable rich-text reference names', () => {
    expectParseError(
      richTextDocument('## system.description', 'body'),
      'Unknown rich-text field: system.description',
    );
  });

  it('rejects duplicate rich-text heading sections', () => {
    expectParseError(
      richTextDocument('## Description', 'first', '', '## System.Description', 'second'),
      'Duplicate field: System.Description',
    );
  });

  it('rejects duplicates across front matter and heading sections', () => {
    expectParseError(
      mixedDocument(['Description: Summary'], ['## Description', 'More detail']),
      'Duplicate field: System.Description',
    );
  });

  it('rejects malformed front matter in mixed documents', () => {
    expectParseError(
      richTextDocument('---', 'Title Improve markdown import UX', '---', '', '## Description', 'Body'),
      'Malformed YAML front matter',
    );
  });
});
