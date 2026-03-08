import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSetMdFieldCommand } from '../../src/commands/set-md-field.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  updateWorkItem: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  resolvePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { updateWorkItem } from '../../src/services/azdo-client.js';
import { resolvePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';
import { existsSync, readFileSync } from 'node:fs';

const defaultResult = {
  id: 42,
  rev: 2,
  title: 'Test Item',
  fieldName: 'System.Description',
  fieldValue: '# Hello',
};

beforeEach(() => {
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(updateWorkItem).mockResolvedValue(defaultResult);
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
  const cmd = createSetMdFieldCommand();
  try {
    await cmd.parseAsync(args, { from: 'user' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('EXIT_')) return;
    throw err;
  }
}

describe('set-md-field command', () => {
  describe('input validation', () => {
    it('errors on non-integer ID', async () => {
      await run(['abc', 'System.Description', 'content']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors on negative ID', async () => {
      await run(['-1', 'System.Description', 'content']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
    });

    it('errors on zero ID', async () => {
      await run(['0', 'System.Description', 'content']);
      expect(getStderr()).toContain('Work item ID must be a positive integer');
    });

    it('errors when only --org without --project', async () => {
      await run(['42', 'System.Description', 'content', '--org', 'myorg']);
      expect(getStderr()).toContain('--org and --project must both be provided');
    });

    it('errors when only --project without --org', async () => {
      await run(['42', 'System.Description', 'content', '--project', 'myproj']);
      expect(getStderr()).toContain('--org and --project must both be provided');
    });
  });

  describe('inline content', () => {
    it('uses inline content argument as markdown source', async () => {
      await run(['42', 'System.Description', '# Hello World']);
      expect(updateWorkItem).toHaveBeenCalledWith(
        { org: 'testorg', project: 'testproj' },
        42,
        'test-pat',
        'System.Description',
        expect.arrayContaining([
          expect.objectContaining({ op: 'add', path: '/fields/System.Description', value: '# Hello World' }),
        ]),
      );
    });

    it('sends two JSON patch operations: field value and multilineFieldsFormat', async () => {
      await run(['42', 'System.Description', '# Hello']);
      const lastCall = vi.mocked(updateWorkItem).mock.calls.at(-1)!;
      const ops = lastCall[4];
      expect(ops).toHaveLength(2);
      expect(ops[0]).toEqual({ op: 'add', path: '/fields/System.Description', value: '# Hello' });
      expect(ops[1]).toEqual({ op: 'add', path: '/multilineFieldsFormat/System.Description', value: 'Markdown' });
    });

    it('outputs human-readable confirmation on success', async () => {
      await run(['42', 'System.Description', '# Hello']);
      expect(getStdout()).toContain('Updated work item 42');
      expect(getStdout()).toContain('markdown content');
    });

    it('outputs JSON result when --json flag is set', async () => {
      await run(['42', 'System.Description', '# Hello', '--json']);
      const parsed = JSON.parse(getStdout().trim());
      expect(parsed).toEqual({
        id: 42,
        rev: 2,
        field: 'System.Description',
        value: '# Hello',
      });
    });
  });

  describe('--file content', () => {
    it('reads content from file specified by --file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# File Content');
      await run(['42', 'System.Description', '--file', 'readme.md']);
      expect(updateWorkItem).toHaveBeenCalledWith(
        expect.any(Object),
        42,
        'test-pat',
        'System.Description',
        expect.arrayContaining([
          expect.objectContaining({ value: '# File Content' }),
        ]),
      );
    });

    it('errors when both inline content and --file provided', async () => {
      await run(['42', 'System.Description', 'inline', '--file', 'readme.md']);
      expect(getStderr()).toContain('Cannot specify both inline content and --file');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await run(['42', 'System.Description', '--file', 'missing.md']);
      expect(getStderr()).toContain('File not found: missing.md');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('errors when file cannot be read', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('EACCES');
      });
      await run(['42', 'System.Description', '--file', 'noperm.md']);
      expect(getStderr()).toContain('Cannot read file: noperm.md');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('stdin content', () => {
    it('reads from stdin when piped and no other content', async () => {
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      const originalIterator = process.stdin[Symbol.asyncIterator];
      const chunks = [Buffer.from('# From stdin')];
      Object.defineProperty(process.stdin, Symbol.asyncIterator, {
        value: () => {
          let idx = 0;
          return {
            next: async () =>
              idx < chunks.length
                ? { value: chunks[idx++], done: false }
                : { value: undefined, done: true },
          };
        },
        configurable: true,
      });

      try {
        await run(['42', 'System.Description']);
        expect(updateWorkItem).toHaveBeenCalledWith(
          expect.any(Object),
          42,
          'test-pat',
          'System.Description',
          expect.arrayContaining([
            expect.objectContaining({ value: '# From stdin' }),
          ]),
        );
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
        Object.defineProperty(process.stdin, Symbol.asyncIterator, { value: originalIterator, configurable: true });
      }
    });

    it('errors when TTY and no content provided', async () => {
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      try {
        await run(['42', 'System.Description']);
        expect(getStderr()).toContain('No content provided');
        expect(process.exit).toHaveBeenCalledWith(1);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      }
    });

    it('errors when stdin is piped but empty', async () => {
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      const originalIterator = process.stdin[Symbol.asyncIterator];
      Object.defineProperty(process.stdin, Symbol.asyncIterator, {
        value: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
        configurable: true,
      });

      try {
        await run(['42', 'System.Description']);
        expect(getStderr()).toContain('No content provided via stdin');
        expect(process.exit).toHaveBeenCalledWith(1);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
        Object.defineProperty(process.stdin, Symbol.asyncIterator, { value: originalIterator, configurable: true });
      }
    });
  });

  describe('error handling', () => {
    it('writes auth error on AUTH_FAILED', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('AUTH_FAILED'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('Authentication failed');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('writes permission error on PERMISSION_DENIED', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('PERMISSION_DENIED'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('Access denied');
    });

    it('writes not-found error on NOT_FOUND', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('NOT_FOUND'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('not found');
    });

    it('writes update-rejected error on UPDATE_REJECTED', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('UPDATE_REJECTED: Invalid field'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('Update rejected: Invalid field');
    });

    it('writes network error on NETWORK_ERROR', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('NETWORK_ERROR'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('Could not connect');
    });

    it('writes generic error for unknown errors', async () => {
      vi.mocked(updateWorkItem).mockRejectedValue(new Error('Something unexpected'));
      await run(['42', 'System.Description', 'content']);
      expect(getStderr()).toContain('Something unexpected');
    });
  });
});
