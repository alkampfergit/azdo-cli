import { it, expect, vi } from 'vitest';
import type { Command } from 'commander';
import type { Mock } from 'vitest';

export function getStdout(): string {
  return vi.mocked(process.stdout.write).mock.calls
    .map((c: [string]) => c[0])
    .join('');
}

export function getStderr(): string {
  return vi.mocked(process.stderr.write).mock.calls
    .map((c: [string]) => c[0])
    .join('');
}

export function setupProcessSpies(): void {
  vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`EXIT_${code}`);
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

export function createCommandRunner(factory: () => Command) {
  return async (args: string[]): Promise<void> => {
    const cmd = factory();
    try {
      await cmd.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('EXIT_')) return;
      throw err;
    }
  };
}

/**
 * Generates `it.each` error handling tests for command test suites.
 * @param mockFn - The mocked API function to make reject
 * @param run - The command runner function
 * @param baseArgs - Base args to pass to the command (e.g. ['42', 'System.Description'])
 */
export function describeCommandErrors(
  mockFn: Mock,
  run: (args: string[]) => Promise<void>,
  baseArgs: string[],
): void {
  const errorCases: [string, string, string][] = [
    ['AUTH_FAILED', 'Authentication failed', 'auth error'],
    ['PERMISSION_DENIED', 'Access denied', 'permission error'],
    ['NOT_FOUND', 'not found', 'not-found error'],
    ['NETWORK_ERROR', 'Could not connect', 'network error'],
    ['BAD_REQUEST: invalid field', 'Request rejected', 'bad-request error'],
    ['Something unexpected', 'Something unexpected', 'generic error'],
  ];

  it.each(errorCases)(
    'writes %s as stderr message',
    async (errorCode, expectedMessage) => {
      mockFn.mockRejectedValue(new Error(errorCode));
      await run(baseArgs);
      expect(getStderr()).toContain(expectedMessage);
      expect(process.exit).toHaveBeenCalledWith(1);
    },
  );
}
