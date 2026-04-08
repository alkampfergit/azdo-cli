import { describe, it, expect } from 'vitest';
import { formatWorkItem, formatFileSize } from '../../src/commands/get-item.js';
import type { WorkItem } from '../../src/types/work-item.js';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 42,
    rev: 1,
    title: 'Test Item',
    state: 'Active',
    type: 'User Story',
    assignedTo: 'Alice',
    description: '<p>Description</p>',
    areaPath: 'TestProject\\Area',
    iterationPath: 'TestProject\\Sprint 1',
    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
    extraFields: null,
    attachments: null,
    ...overrides,
  };
}

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(102400)).toBe('100.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });

  it('formats small KB values', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('formatWorkItem with attachments', () => {
  it('displays attachment list in full mode', () => {
    const item = makeWorkItem({
      attachments: [
        { name: 'design.png', size: 102400, url: 'https://example.com/a1' },
        { name: 'requirements.docx', size: 46285, url: 'https://example.com/a2' },
      ],
    });

    const output = formatWorkItem(item, false);
    expect(output).toContain('Attachments:');
    expect(output).toContain('  design.png (100.0 KB)');
    expect(output).toContain('  requirements.docx (45.2 KB)');
  });

  it('displays attachment count in short mode', () => {
    const item = makeWorkItem({
      attachments: [
        { name: 'design.png', size: 102400, url: 'https://example.com/a1' },
        { name: 'readme.md', size: 1024, url: 'https://example.com/a2' },
        { name: 'data.csv', size: 2048, url: 'https://example.com/a3' },
      ],
    });

    const output = formatWorkItem(item, true);
    expect(output).toContain('Attachments: 3');
    expect(output).not.toContain('design.png');
  });

  it('omits attachments section when null', () => {
    const item = makeWorkItem({ attachments: null });

    const output = formatWorkItem(item, false);
    expect(output).not.toContain('Attachments');
  });
});
