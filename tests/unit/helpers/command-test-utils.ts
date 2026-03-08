import { vi } from 'vitest';
import type { Command } from 'commander';

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
