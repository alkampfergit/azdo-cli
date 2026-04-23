import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createListFieldsCommand, formatFieldList } from '../../src/commands/list-fields.js';
import { getStdout, getStderr, setupProcessSpies, createCommandRunner, describeCommandErrors } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  getWorkItemFields: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requirePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { getWorkItemFields } from '../../src/services/azdo-client.js';
import { requirePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createListFieldsCommand);

const sampleFields: Record<string, unknown> = {
  'System.Title': 'Test item',
  'System.State': 'Active',
  'System.WorkItemType': 'Task',
  'System.AssignedTo': { displayName: 'Test User', uniqueName: 'test@example.com' },
  'System.Description': '<p>Some description</p>',
};

beforeEach(() => {
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(requirePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(getWorkItemFields).mockResolvedValue(sampleFields);
  setupProcessSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('list-fields command', () => {
  describe('input validation', () => {
    const invalidIds: [string, string][] = [
      ['non-integer', 'abc'],
      ['negative', '-1'],
      ['zero', '0'],
    ];

    it.each(invalidIds)('errors on %s ID', async (_label, id) => {
      await run([id]);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when only --org provided without --project', async () => {
      await run(['42', '--org', 'myorg']);
      expect(getStderr()).toContain('--org and --project must both be provided');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when only --project provided without --org', async () => {
      await run(['42', '--project', 'myproj']);
      expect(getStderr()).toContain('--org and --project must both be provided');
    });
  });

  describe('happy path', () => {
    it('outputs field count header and field list', async () => {
      await run(['42']);
      const output = getStdout();
      expect(output).toContain('Work Item 42');
      expect(output).toContain('5 fields');
      expect(output).toContain('System.Title');
      expect(output).toContain('Test item');
      expect(output).toContain('System.State');
      expect(output).toContain('Active');
    });

    it('outputs sorted fields', async () => {
      await run(['42']);
      const output = getStdout();
      const titleIdx = output.indexOf('System.AssignedTo');
      const stateIdx = output.indexOf('System.State');
      expect(titleIdx).toBeLessThan(stateIdx);
    });

    it('outputs JSON when --json flag provided', async () => {
      await run(['42', '--json']);
      const output = JSON.parse(getStdout());
      expect(output.id).toBe(42);
      expect(output.fields).toEqual(sampleFields);
    });

    it('passes --org and --project to resolveContext', async () => {
      await run(['42', '--org', 'myorg', '--project', 'myproj']);
      expect(resolveContext).toHaveBeenCalledWith(
        expect.objectContaining({ org: 'myorg', project: 'myproj' }),
      );
    });

    it('passes correct args to getWorkItemFields', async () => {
      await run(['42']);
      expect(getWorkItemFields).toHaveBeenCalledWith(
        { org: 'testorg', project: 'testproj' },
        42,
        'test-pat',
      );
    });
  });

  describe('error handling', () => {
    describeCommandErrors(
      vi.mocked(getWorkItemFields),
      run,
      ['42'],
    );
  });
});

describe('formatFieldList', () => {
  it('formats fields alphabetically with values', () => {
    const result = formatFieldList({
      'System.State': 'Active',
      'System.Title': 'Test',
    });
    const lines = result.split('\n');
    expect(lines[0]).toContain('System.State');
    expect(lines[0]).toContain('Active');
    expect(lines[1]).toContain('System.Title');
    expect(lines[1]).toContain('Test');
  });

  it('shows full value without truncation', () => {
    const longValue = 'x'.repeat(200);
    const result = formatFieldList({ 'System.CustomField': longValue });
    expect(result).toContain(longValue);
    expect(result).not.toContain('...');
  });

  it('converts rich text HTML to markdown preview with first 5 lines', () => {
    const html = '<p>Line 1</p><p>Line 2</p><p>Line 3</p><p>Line 4</p><p>Line 5</p><p>Line 6</p>';
    const result = formatFieldList({ 'System.Description': html });
    expect(result).toContain('[rich text]');
    expect(result).toContain('Line 1');
    expect(result).toContain('more lines');
  });

  it('stringifies object values as JSON', () => {
    const result = formatFieldList({
      'System.AssignedTo': { displayName: 'User' },
    });
    expect(result).toContain('{"displayName":"User"}');
  });

  it('shows (empty) for null and undefined values', () => {
    const result = formatFieldList({
      'System.Description': null,
    });
    expect(result).toContain('System.Description');
    expect(result).toContain('(empty)');
  });
});
