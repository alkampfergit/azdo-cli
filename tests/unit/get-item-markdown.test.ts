import { describe, it, expect } from 'vitest';
import type { WorkItem } from '../../src/types/work-item.js';
import { formatWorkItem } from '../../src/commands/get-item.js';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 42,
    rev: 1,
    title: 'Test Item',
    state: 'Active',
    type: 'User Story',
    assignedTo: 'Alice',
    description: '<h2>Overview</h2><p>Text with <strong>bold</strong></p>',
    areaPath: String.raw`TestProject\Area`,
    iterationPath: String.raw`TestProject\Sprint 1`,
    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
    extraFields: null,
    ...overrides,
  };
}

describe('formatWorkItem with markdown=true', () => {
  it('converts HTML description to markdown', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('## Overview');
    expect(output).toContain('**bold**');
  });

  it('uses stripHtml when markdown=false', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false, false);
    expect(output).toContain('--- Overview ---');
    expect(output).not.toContain('## Overview');
  });

  it('handles null description gracefully', () => {
    const item = makeWorkItem({ description: null });
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('Description:');
  });

  it('handles empty string description gracefully', () => {
    const item = makeWorkItem({ description: '' });
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('Description:');
  });

  it('truncates to 3 lines in short mode with markdown', () => {
    const item = makeWorkItem({
      description: '<p>Line1</p><p>Line2</p><p>Line3</p><p>Line4</p><p>Line5</p>',
    });
    const output = formatWorkItem(item, true, true);
    expect(output).toContain('...');
  });
});

describe('formatWorkItem markdown with extra fields', () => {
  it('converts HTML extra fields to markdown when markdown=true', () => {
    const item = makeWorkItem({
      extraFields: {
        'Custom.ReproSteps': '<p>Step <strong>one</strong></p>',
      },
    });
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('Step **one**');
  });

  it('passes plain-text extra fields through unchanged when markdown=true, with colon-space separator', () => {
    const item = makeWorkItem({
      extraFields: {
        'System.Tags': 'v1.0, release',
      },
    });
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('Tags: v1.0, release');
  });

  it('leaves extra fields as raw strings when markdown=false', () => {
    const item = makeWorkItem({
      extraFields: {
        'Custom.ReproSteps': '<p>Step <strong>one</strong></p>',
      },
    });
    const output = formatWorkItem(item, false, false);
    expect(output).toContain('<p>Step <strong>one</strong></p>');
  });

  it('handles null extraFields gracefully', () => {
    const item = makeWorkItem({ extraFields: null });
    const output = formatWorkItem(item, false, true);
    expect(output).not.toContain('undefined');
  });
});

describe('three-state markdown flag resolution', () => {
  it('markdown=true overrides config false (flag wins)', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('## Overview');
  });

  it('markdown=false keeps stripHtml (flag wins over config)', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false, false);
    expect(output).toContain('--- Overview ---');
  });

  it('default parameter is false (backward compatible)', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false);
    expect(output).toContain('--- Overview ---');
  });
});

describe('markdown field formatting: single-line vs multi-line', () => {
  it('single-line extra field displays as "Label: value" on same line when markdown=true', () => {
    const item = makeWorkItem({
      description: null,
      extraFields: {
        'System.Tags': 'bug, critical',
      },
    });
    const output = formatWorkItem(item, false, true);
    expect(output).toContain('Tags: bug, critical');
    // Should NOT have padded format (old format without separator)
    expect(output).not.toMatch(/Tags\s{2,}bug/);
  });

  it('single-line description in short mode displays as "Description: content" on same line when markdown=true', () => {
    const item = makeWorkItem({
      description: '<p>Short description</p>',
    });
    const output = formatWorkItem(item, true, true);
    // Single-line content should appear after "Description: " on same line
    expect(output).toContain('Description: Short description');
  });

  it('multi-line extra field displays label then content on next line when markdown=true', () => {
    const item = makeWorkItem({
      description: null,
      extraFields: {
        'Custom.ReproSteps': '<h2>Steps</h2><p>Step one</p><p>Step two</p>',
      },
    });
    const output = formatWorkItem(item, false, true);
    // Label should be on its own line, followed by newline and content
    expect(output).toMatch(/ReproSteps:\n/);
    expect(output).toContain('## Steps');
  });

  it('multi-line description in short mode starts content on line after label when markdown=true', () => {
    const item = makeWorkItem({
      description: '<h2>Overview</h2><p>Text with <strong>bold</strong></p>',
    });
    const output = formatWorkItem(item, true, true);
    // Multi-line markdown content should start on the line after "Description:"
    expect(output).toMatch(/Description:\n/);
    expect(output).not.toMatch(/Description:[^\n]+## Overview/);
  });

  it('non-markdown extra fields retain original padded format when markdown=false', () => {
    const item = makeWorkItem({
      extraFields: {
        'System.Tags': 'v1.0, release',
      },
    });
    const output = formatWorkItem(item, false, false);
    // Old padded format should remain unchanged in non-markdown mode
    expect(output).toContain('Tags         v1.0, release');
  });

  it('empty extra field value in markdown mode does not crash', () => {
    const item = makeWorkItem({
      extraFields: {
        'Custom.Notes': '',
      },
    });
    expect(() => formatWorkItem(item, false, true)).not.toThrow();
  });

  it('HTML extra field with single-line conversion displays on same line when markdown=true', () => {
    const item = makeWorkItem({
      description: null,
      extraFields: {
        'System.Tags': '<p>simple tag</p>',
      },
    });
    const output = formatWorkItem(item, false, true);
    // After HTML→MD conversion, "simple tag" is a single line
    expect(output).toContain('Tags: simple tag');
  });
});
