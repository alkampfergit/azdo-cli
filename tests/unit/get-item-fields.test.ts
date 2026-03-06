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
    description: '<p>Some description</p>',
    areaPath: 'TestProject\\Area',
    iterationPath: 'TestProject\\Sprint 1',
    url: 'https://dev.azure.com/org/project/_workitems/edit/42',
    extraFields: null,
    ...overrides,
  };
}

describe('formatWorkItem with extra fields', () => {
  it('displays extra fields after URL', () => {
    const item = makeWorkItem({
      extraFields: {
        'System.Tags': 'frontend, bug',
        'Microsoft.VSTS.Common.Priority': '2',
      },
    });

    const output = formatWorkItem(item, false);
    expect(output).toContain('Tags         frontend, bug');
    expect(output).toContain('Priority     2');
  });

  it('extracts label from last segment of reference name', () => {
    const item = makeWorkItem({
      extraFields: {
        'Microsoft.VSTS.Scheduling.StoryPoints': '5',
      },
    });

    const output = formatWorkItem(item, false);
    expect(output).toContain('StoryPoints  5');
  });

  it('shows extra fields in short mode', () => {
    const item = makeWorkItem({
      extraFields: { 'System.Tags': 'important' },
    });

    const output = formatWorkItem(item, true);
    expect(output).toContain('Tags         important');
  });

  it('shows no extra fields section when extraFields is null', () => {
    const item = makeWorkItem({ extraFields: null });
    const output = formatWorkItem(item, false);

    // URL should be immediately followed by empty line then Description
    const lines = output.split('\n');
    const urlIndex = lines.findIndex((l) => l.startsWith('URL:'));
    expect(lines[urlIndex + 1]).toBe('');
  });

  it('preserves existing output format when no extra fields', () => {
    const item = makeWorkItem();
    const output = formatWorkItem(item, false);

    expect(output).toContain('ID:          42');
    expect(output).toContain('Type:        User Story');
    expect(output).toContain('Title:       Test Item');
    expect(output).toContain('State:       Active');
    expect(output).toContain('Assigned To: Alice');
    expect(output).toContain('Area:        TestProject\\Area');
    expect(output).toContain('Description:');
  });

  it('handles simple field name without dots', () => {
    const item = makeWorkItem({
      extraFields: { 'CustomField': 'value' },
    });

    const output = formatWorkItem(item, false);
    expect(output).toContain('CustomField  value');
  });
});

describe('getWorkItem with extra fields', () => {
  it('includes fields query parameter when extraFields provided', async () => {
    const { vi } = await import('vitest');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        rev: 1,
        fields: {
          'System.Title': 'Test',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AreaPath': 'Project\\Area',
          'System.IterationPath': 'Project\\Sprint',
          'System.Tags': 'tag1, tag2',
        },
        _links: { html: { href: 'https://example.com' } },
      }),
    } as Response);

    const { getWorkItem } = await import('../../src/services/azdo-client.js');
    const result = await getWorkItem(
      { org: 'testorg', project: 'testproject' },
      42,
      'fake-pat',
      ['System.Tags'],
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('&fields='),
      expect.any(Object),
    );
    expect(result.extraFields).toEqual({ 'System.Tags': 'tag1, tag2' });

    fetchSpy.mockRestore();
  });

  it('does not include fields param when no extraFields', async () => {
    const { vi } = await import('vitest');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        rev: 1,
        fields: {
          'System.Title': 'Test',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AreaPath': 'Project\\Area',
          'System.IterationPath': 'Project\\Sprint',
        },
        _links: { html: { href: 'https://example.com' } },
      }),
    } as Response);

    const { getWorkItem } = await import('../../src/services/azdo-client.js');
    const result = await getWorkItem(
      { org: 'testorg', project: 'testproject' },
      42,
      'fake-pat',
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.not.stringContaining('&fields='),
      expect.any(Object),
    );
    expect(result.extraFields).toBeNull();

    fetchSpy.mockRestore();
  });

  it('silently omits missing extra fields', async () => {
    const { vi } = await import('vitest');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        rev: 1,
        fields: {
          'System.Title': 'Test',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AreaPath': 'Project\\Area',
          'System.IterationPath': 'Project\\Sprint',
        },
        _links: { html: { href: 'https://example.com' } },
      }),
    } as Response);

    const { getWorkItem } = await import('../../src/services/azdo-client.js');
    const result = await getWorkItem(
      { org: 'testorg', project: 'testproject' },
      42,
      'fake-pat',
      ['NonExistent.Field'],
    );

    expect(result.extraFields).toBeNull();

    fetchSpy.mockRestore();
  });

  it('converts non-string values via String()', async () => {
    const { vi } = await import('vitest');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 42,
        rev: 1,
        fields: {
          'System.Title': 'Test',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AreaPath': 'Project\\Area',
          'System.IterationPath': 'Project\\Sprint',
          'Microsoft.VSTS.Common.Priority': 2,
        },
        _links: { html: { href: 'https://example.com' } },
      }),
    } as Response);

    const { getWorkItem } = await import('../../src/services/azdo-client.js');
    const result = await getWorkItem(
      { org: 'testorg', project: 'testproject' },
      42,
      'fake-pat',
      ['Microsoft.VSTS.Common.Priority'],
    );

    expect(result.extraFields).toEqual({
      'Microsoft.VSTS.Common.Priority': '2',
    });

    fetchSpy.mockRestore();
  });
});
