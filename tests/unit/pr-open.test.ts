import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrOpenCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  openPullRequest: vi.fn(),
}));

vi.mock('../../src/services/git-remote.js', () => ({
  detectRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

// `-` resolves to a synchronous read of file descriptor 0. There is no way to
// swap the test runner's own stdin, so the read itself is the thing asserted:
// the command must ask node:fs for fd 0, not for a file literally named "-".
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from 'node:fs';

const { readFileSync: realReadFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');

import { openPullRequest } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrOpenCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  vi.mocked(openPullRequest).mockResolvedValue({
    branch: 'feature/test',
    targetBranch: 'develop',
    created: true,
    pullRequest: {
      id: 12,
      title: 'Created PR',
      repository: 'repo-name',
      sourceRefName: 'refs/heads/feature/test',
      targetRefName: 'refs/heads/develop',
      status: 'active',
      createdBy: 'Alice',
      url: 'https://example.test/pr/12',
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pr open command', () => {
  it('requires --title', async () => {
    await run(['--description', 'Description']);
    expect(getStderr()).toContain('--title is required for pull request creation.');
    expect(getExitCode()).toBe(1);
  });

  it('requires --description when no template resolves (FR-013)', async () => {
    vi.mocked(openPullRequest).mockRejectedValue(new Error('DESCRIPTION_REQUIRED'));

    await run(['--title', 'Title']);

    expect(getStderr()).toContain('--description is required for pull request creation.');
    expect(getExitCode()).toBe(1);
  });

  it('creates a pull request without --description when a template resolves (FR-012)', async () => {
    await run(['--title', 'Title']);

    expect(vi.mocked(openPullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', 'Title', undefined,
    );
    expect(getStdout()).toContain('Created pull request #12: Created PR');
  });

  it('rejects opening a pull request from develop', async () => {
    vi.mocked(getCurrentBranch).mockReturnValue('develop');
    await run(['--title', 'Title', '--description', 'Description']);
    expect(getStderr()).toContain('Pull request creation requires a source branch other than develop.');
    expect(getExitCode()).toBe(1);
  });

  it('prints a creation message when a new pull request is created', async () => {
    await run(['--title', 'Title', '--description', 'Description']);
    expect(getStdout()).toContain('Created pull request #12: Created PR');
    expect(getStdout()).toContain('https://example.test/pr/12');
  });

  it('prints a reuse message when an active pull request already exists', async () => {
    vi.mocked(openPullRequest).mockResolvedValue({
      branch: 'feature/test',
      targetBranch: 'develop',
      created: false,
      pullRequest: {
        id: 12,
        title: 'Existing PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    });

    await run(['--title', 'Title', '--description', 'Description']);

    expect(getStdout()).toContain('Active pull request already exists for feature/test -> develop: #12');
  });

  it('prints an ambiguity error and exits with code 1', async () => {
    vi.mocked(openPullRequest).mockRejectedValue(new Error('AMBIGUOUS_PRS:12,13'));

    await run(['--title', 'Title', '--description', 'Description']);

    expect(getStderr()).toContain('Multiple active pull requests already exist for this branch targeting develop: #12, #13.');
    expect(getExitCode()).toBe(1);
  });

  it('prints JSON output with --json', async () => {
    await run(['--title', 'Title', '--description', 'Description', '--json']);
    expect(JSON.parse(getStdout())).toEqual({
      branch: 'feature/test',
      targetBranch: 'develop',
      created: true,
      pullRequest: {
        id: 12,
        title: 'Created PR',
        repository: 'repo-name',
        sourceRefName: 'refs/heads/feature/test',
        targetRefName: 'refs/heads/develop',
        status: 'active',
        createdBy: 'Alice',
        url: 'https://example.test/pr/12',
      },
    });
  });
});

describe('pr open --description-file (038, FR-010)', () => {
  let tempDir: string;

  beforeEach(() => {
    // The file-level beforeEach re-arms the mocks but does not clear their call
    // history, and these cases assert that openPullRequest was NOT reached.
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'azdo-pr-open-'));
    // The stdin cases below swap this out; re-arm the real reader every test so
    // the swap cannot leak into the file-reading cases.
    vi.mocked(readFileSync).mockImplementation(realReadFileSync as never);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTemp(name: string, content: string): string {
    const path = join(tempDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  it('reads the description from a file and composes it as inline text would be', async () => {
    await run(['--title', 'Title', '--description-file', writeTemp('body.md', '# Heading\n\nBody\n')]);

    expect(vi.mocked(openPullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', 'Title', '# Heading\n\nBody',
    );
  });

  it('rejects --description together with --description-file', async () => {
    await run(['--title', 'Title', '--description', 'Inline', '--description-file', writeTemp('b.md', 'File')]);

    expect(getStderr()).toContain('Cannot specify both --description and --description-file.');
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(openPullRequest)).not.toHaveBeenCalled();
  });

  it('reports a missing description file', async () => {
    await run(['--title', 'Title', '--description-file', join(tempDir, 'nope.md')]);

    expect(getStderr()).toContain('File not found:');
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(openPullRequest)).not.toHaveBeenCalled();
  });

  it('rejects an empty description file instead of silently falling back to the template', async () => {
    await run(['--title', 'Title', '--description-file', writeTemp('empty.md', '   \n')]);

    expect(getStderr()).toContain('Description must not be empty.');
    expect(getExitCode()).toBe(1);
  });

  it('reads the description from standard input when the path is "-"', async () => {
    vi.mocked(readFileSync).mockImplementation(((target: unknown, encoding: unknown) => (
      target === 0 ? 'Piped body\n' : realReadFileSync(target as never, encoding as never)
    )) as never);

    await run(['--title', 'Title', '--description-file', '-']);

    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(0, 'utf-8');
    expect(vi.mocked(openPullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', 'Title', 'Piped body',
    );
  });

  it('reports a failure to read standard input', async () => {
    vi.mocked(readFileSync).mockImplementation((() => {
      throw new Error('EAGAIN');
    }) as never);

    await run(['--title', 'Title', '--description-file', '-']);

    expect(getStderr()).toContain('Cannot read standard input.');
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(openPullRequest)).not.toHaveBeenCalled();
  });

  it('still treats an empty inline --description as "use the template"', async () => {
    await run(['--title', 'Title', '--description', '   ']);

    expect(vi.mocked(openPullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 'feature/test', 'Title', undefined,
    );
  });
});
