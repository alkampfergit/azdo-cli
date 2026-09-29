import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCommandError, reportCredentialStoreUnavailable } from '../../src/services/command-helpers.js';
import { CredentialStoreUnavailableError } from '../../src/types/credential.js';

// 043 FR-006: an unusable credential store is exit 4 for every command, not
// only for `azdo auth` — `get-item`, `pr`, `pipeline` … all route through
// reportCredentialStoreUnavailable().
describe('credential store unavailable outside `azdo auth`', () => {
  let stderr: string;

  beforeEach(() => {
    stderr = '';
    process.exitCode = undefined;
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  const unavailable = () =>
    new CredentialStoreUnavailableError('windows-dpapi', undefined, 'The DPAPI store is only available on Windows.');

  it('reports the store message with exit code 4', () => {
    expect(reportCredentialStoreUnavailable(unavailable())).toBe(true);
    expect(stderr).toBe('Error: The DPAPI store is only available on Windows.\n');
    expect(process.exitCode).toBe(4);
  });

  it('ignores every other error', () => {
    expect(reportCredentialStoreUnavailable(new Error('AUTH_FAILED'))).toBe(false);
    expect(stderr).toBe('');
    expect(process.exitCode).toBeUndefined();
  });

  it('makes handleCommandError exit 4 instead of 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    handleCommandError(unavailable(), 1, { org: 'o', project: 'p' }, 'read');
    expect(exit).toHaveBeenCalledWith(4);
    expect(stderr).toContain('only available on Windows');
  });

  it('sets exit code 4 when handleCommandError does not exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    handleCommandError(unavailable(), 1, undefined, 'read', false);
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(4);
  });
});
