import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGetMdFieldCommand } from '../../src/commands/get-md-field.js';
import { getStdout, getStderr, setupProcessSpies, createCommandRunner, describeCommandErrors } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  getWorkItemFieldValue: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  resolvePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import { getWorkItemFieldValue } from '../../src/services/azdo-client.js';
import { resolvePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createGetMdFieldCommand);

beforeEach(() => {
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(getWorkItemFieldValue).mockResolvedValue('<p>Hello</p>');
  setupProcessSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('get-md-field command', () => {
  describe('input validation', () => {
    const invalidIds: [string, string][] = [
      ['non-integer', 'abc'],
      ['negative', '-1'],
      ['zero', '0'],
    ];

    it.each(invalidIds)('errors on %s ID', async (_label, id) => {
      await run([id, 'System.Description']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when only --org provided without --project', async () => {
      await run(['42', 'System.Description', '--org', 'myorg']);
      expect(getStderr()).toContain('--org and --project must both be provided');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when only --project provided without --org', async () => {
      await run(['42', 'System.Description', '--project', 'myproj']);
      expect(getStderr()).toContain('--org and --project must both be provided');
    });
  });

  describe('happy path', () => {
    it('outputs markdown-converted content for HTML field', async () => {
      vi.mocked(getWorkItemFieldValue).mockResolvedValue('<p><strong>Hello</strong></p>');
      await run(['42', 'System.Description']);
      const output = getStdout();
      expect(output).toContain('**Hello**');
      expect(output).not.toContain('<strong>');
    });

    it('outputs plain text unchanged', async () => {
      vi.mocked(getWorkItemFieldValue).mockResolvedValue('plain text value');
      await run(['42', 'System.Title']);
      expect(getStdout()).toContain('plain text value');
    });

    it('outputs empty line when field value is null', async () => {
      vi.mocked(getWorkItemFieldValue).mockResolvedValue(null);
      await run(['42', 'System.Description']);
      expect(getStdout()).toBe('\n');
    });

    it('passes --org and --project to resolveContext', async () => {
      await run(['42', 'System.Description', '--org', 'myorg', '--project', 'myproj']);
      expect(resolveContext).toHaveBeenCalledWith(
        expect.objectContaining({ org: 'myorg', project: 'myproj' }),
      );
    });

    it('passes correct args to getWorkItemFieldValue', async () => {
      await run(['42', 'System.Description']);
      expect(getWorkItemFieldValue).toHaveBeenCalledWith(
        { org: 'testorg', project: 'testproj' },
        42,
        'test-pat',
        'System.Description',
      );
    });
  });

  describe('error handling', () => {
    describeCommandErrors(
      vi.mocked(getWorkItemFieldValue),
      run,
      ['42', 'System.Description'],
    );
  });
});
