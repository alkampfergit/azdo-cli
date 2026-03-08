import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGetMdFieldCommand } from '../../src/commands/get-md-field.js';

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

beforeEach(() => {
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(getWorkItemFieldValue).mockResolvedValue('<p>Hello</p>');
  vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`EXIT_${code}`);
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getStdout(): string {
  return vi.mocked(process.stdout.write).mock.calls
    .map((c: [string]) => c[0])
    .join('');
}

function getStderr(): string {
  return vi.mocked(process.stderr.write).mock.calls
    .map((c: [string]) => c[0])
    .join('');
}

async function run(args: string[]): Promise<void> {
  const cmd = createGetMdFieldCommand();
  try {
    await cmd.parseAsync(args, { from: 'user' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('EXIT_')) return;
    throw err;
  }
}

describe('get-md-field command', () => {
  describe('input validation', () => {
    it('errors on non-integer ID', async () => {
      await run(['abc', 'System.Description']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors on negative ID', async () => {
      await run(['-1', 'System.Description']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
    });

    it('errors on zero ID', async () => {
      await run(['0', 'System.Description']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
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
    it('writes auth error on AUTH_FAILED', async () => {
      vi.mocked(getWorkItemFieldValue).mockRejectedValue(new Error('AUTH_FAILED'));
      await run(['42', 'System.Description']);
      expect(getStderr()).toContain('Authentication failed');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('writes permission error on PERMISSION_DENIED', async () => {
      vi.mocked(getWorkItemFieldValue).mockRejectedValue(new Error('PERMISSION_DENIED'));
      await run(['42', 'System.Description']);
      expect(getStderr()).toContain('Access denied');
    });

    it('writes not-found error on NOT_FOUND', async () => {
      vi.mocked(getWorkItemFieldValue).mockRejectedValue(new Error('NOT_FOUND'));
      await run(['42', 'System.Description']);
      expect(getStderr()).toContain('not found');
    });

    it('writes network error on NETWORK_ERROR', async () => {
      vi.mocked(getWorkItemFieldValue).mockRejectedValue(new Error('NETWORK_ERROR'));
      await run(['42', 'System.Description']);
      expect(getStderr()).toContain('Could not connect');
    });

    it('writes generic error for unknown errors', async () => {
      vi.mocked(getWorkItemFieldValue).mockRejectedValue(new Error('Something unexpected'));
      await run(['42', 'System.Description']);
      expect(getStderr()).toContain('Something unexpected');
    });
  });
});
