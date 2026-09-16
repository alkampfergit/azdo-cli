import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrUpdateCommand } from '../../src/commands/pr.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pr-client.js', () => ({
  updatePullRequest: vi.fn(),
  listPullRequests: vi.fn(),
  getPullRequestById: vi.fn(),
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

import { getPullRequestById, listPullRequests, updatePullRequest } from '../../src/services/pr-client.js';
import { detectRepoName, getCurrentBranch } from '../../src/services/git-remote.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPrUpdateCommand);

const currentPr = {
  id: 96,
  title: 'test probe',
  repository: 'repo-name',
  sourceRefName: 'refs/heads/feature/test',
  targetRefName: 'refs/heads/develop',
  status: 'active',
  createdBy: 'Alice',
  url: 'https://example.test/pr/96',
  description: 'placeholder body',
};

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  setupProcessSpies();
  tempDir = mkdtempSync(join(tmpdir(), 'azdo-pr-update-'));
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
  vi.mocked(detectRepoName).mockReturnValue('repo-name');
  vi.mocked(getCurrentBranch).mockReturnValue('feature/test');
  // The stdin cases below swap this out; re-arm the real reader every test so
  // the swap cannot leak into the file-reading cases.
  vi.mocked(readFileSync).mockImplementation(realReadFileSync as never);
  vi.mocked(getPullRequestById).mockResolvedValue(currentPr);
  vi.mocked(listPullRequests).mockResolvedValue([currentPr]);
  vi.mocked(updatePullRequest).mockImplementation(async (_ctx, _repo, _cred, prId, fields) => ({
    ...currentPr,
    id: prId,
    title: fields.title ?? currentPr.title,
    description: fields.description ?? currentPr.description,
  }));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeTemp(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('pr update — input validation (FR-003, FR-004, FR-007)', () => {
  it('fails when no field is supplied', async () => {
    await run(['--pr-number', '96']);

    expect(getStderr()).toContain(
      'pr update requires at least one of --title, --title-file, --description or --description-file.',
    );
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('rejects --title together with --title-file', async () => {
    await run(['--pr-number', '96', '--title', 'X', '--title-file', writeTemp('t.md', 'Y')]);

    expect(getStderr()).toContain('Cannot specify both --title and --title-file.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects --description together with --description-file', async () => {
    await run(['--pr-number', '96', '--description', 'X', '--description-file', writeTemp('d.md', 'Y')]);

    expect(getStderr()).toContain('Cannot specify both --description and --description-file.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects an empty title', async () => {
    await run(['--pr-number', '96', '--title', '   ']);

    expect(getStderr()).toContain('Title must not be empty. Pass the text inline or use --title-file <path>.');
    expect(getExitCode()).toBe(1);
  });

  it('rejects an empty description file rather than clearing the field', async () => {
    await run(['--pr-number', '96', '--description-file', writeTemp('empty.md', '\n\n')]);

    expect(getStderr()).toContain('Description must not be empty. Pass the text inline or use --description-file <path>.');
    expect(getExitCode()).toBe(1);
    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
  });

  it('reports a missing file', async () => {
    await run(['--pr-number', '96', '--description-file', join(tempDir, 'nope.md')]);

    expect(getStderr()).toContain('File not found:');
    expect(getExitCode()).toBe(1);
  });

  it('reads the description from standard input when the path is "-" (FR-005)', async () => {
    vi.mocked(readFileSync).mockImplementation(((target: unknown, encoding: unknown) => (
      target === 0 ? 'Body piped in\n' : realReadFileSync(target as never, encoding as never)
    )) as never);

    await run(['--pr-number', '96', '--description-file', '-']);

    expect(vi.mocked(readFileSync)).toHaveBeenCalledWith(0, 'utf-8');
    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { description: 'Body piped in' },
    );
  });

  it('reports a failure to read standard input', async () => {
    vi.mocked(readFileSync).mockImplementation((() => {
      throw new Error('EAGAIN');
    }) as never);

    await run(['--pr-number', '96', '--title-file', '-']);

    expect(getStderr()).toContain('Cannot read standard input.');
    expect(getExitCode()).toBe(1);
  });

  it('refuses to read standard input twice (FR-005)', async () => {
    await run(['--pr-number', '96', '--title-file', '-', '--description-file', '-']);

    expect(getStderr()).toContain(
      'Cannot read standard input twice; only one of --title-file and --description-file may be "-".',
    );
    expect(getExitCode()).toBe(1);
  });

  it('rejects an invalid --pr-number', async () => {
    await run(['--pr-number', 'abc', '--title', 'X']);

    expect(getStderr()).toContain('Invalid --pr-number "abc"; expected a positive integer.');
    expect(getExitCode()).toBe(1);
  });
});

describe('pr update — partial patch (FR-001, FR-003)', () => {
  it('sends only the title when only --title is given', async () => {
    await run(['--pr-number', '96', '--title', 'pr: add azdo pr update']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { title: 'pr: add azdo pr update' },
    );
    expect(getStdout()).toContain('Updated pull request #96 (title).');
    expect(getExitCode()).toBe(0);
  });

  it('sends only the description when only --description is given', async () => {
    await run(['--pr-number', '96', '--description', 'A real body']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { description: 'A real body' },
    );
    expect(getStdout()).toContain('Updated pull request #96 (description).');
  });

  it('sends both when both changed', async () => {
    await run(['--pr-number', '96', '--title', 'New title', '--description', 'New body']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { title: 'New title', description: 'New body' },
    );
    expect(getStdout()).toContain('Updated pull request #96 (title, description).');
  });

  it('omits a field that already matches, even when it was supplied', async () => {
    await run(['--pr-number', '96', '--title', 'test probe', '--description', 'New body']);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { description: 'New body' },
    );
  });

  it('reads the description from a file', async () => {
    await run(['--pr-number', '96', '--description-file', writeTemp('body.md', '# Heading\n\nBody text\n')]);

    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { description: '# Heading\n\nBody text' },
    );
  });

  it('resolves the pull request from the current branch when --pr-number is omitted', async () => {
    await run(['--title', 'Branch-resolved title']);

    expect(vi.mocked(listPullRequests)).toHaveBeenCalled();
    expect(vi.mocked(updatePullRequest)).toHaveBeenCalledWith(
      expect.any(Object), 'repo-name', expect.any(Object), 96, { title: 'Branch-resolved title' },
    );
  });
});

describe('pr update — no-op (FR-008)', () => {
  it('issues no PATCH when every supplied field already matches', async () => {
    await run(['--pr-number', '96', '--title', 'test probe', '--description', 'placeholder body']);

    expect(vi.mocked(updatePullRequest)).not.toHaveBeenCalled();
    expect(getStdout()).toContain(
      'Pull request #96 already has the requested title and description; nothing to update.',
    );
    expect(getExitCode()).toBe(0);
  });

  it('names only the requested field in the no-op message', async () => {
    await run(['--pr-number', '96', '--title', 'test probe']);

    expect(getStdout()).toContain('Pull request #96 already has the requested title; nothing to update.');
  });

  it('reports noop:true with an empty updatedFields in --json', async () => {
    await run(['--pr-number', '96', '--title', 'test probe', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 96,
      title: 'test probe',
      description: 'placeholder body',
      url: 'https://example.test/pr/96',
      noop: true,
      updatedFields: [],
    });
  });
});

describe('pr update — output and errors', () => {
  it('emits the documented JSON shape on a real update (FR-012)', async () => {
    await run(['--pr-number', '96', '--title', 'Corrected', '--json']);

    expect(JSON.parse(getStdout())).toEqual({
      pullRequestId: 96,
      title: 'Corrected',
      description: 'placeholder body',
      url: 'https://example.test/pr/96',
      noop: false,
      updatedFields: ['title'],
    });
  });

  it('exits 3 when the pull request does not exist', async () => {
    vi.mocked(getPullRequestById).mockRejectedValue(new Error('NOT_FOUND | url=… | body=…'));

    await run(['--pr-number', '4242', '--title', 'X']);

    expect(getStderr()).toContain('Pull request #4242 not found in test-org/test-project/repo-name.');
    expect(getExitCode()).toBe(3);
  });

  it('exits 4 on a permission failure', async () => {
    vi.mocked(updatePullRequest).mockRejectedValue(new Error('PERMISSION_DENIED: TF401019'));

    await run(['--pr-number', '96', '--title', 'X']);

    expect(getStderr()).toContain('Access denied');
    expect(getExitCode()).toBe(4);
  });

  it('reports an over-long description as a validation failure, not an API failure (FR-009)', async () => {
    vi.mocked(updatePullRequest).mockRejectedValue(
      new Error('DESCRIPTION_TOO_LONG: description is 4207 characters, exceeding the Azure DevOps limit of 4000 characters. Shorten the description by at least 207 characters.'),
    );

    await run(['--pr-number', '96', '--description', 'x'.repeat(4207)]);

    expect(getStderr()).toContain('Error: description is 4207 characters, exceeding the Azure DevOps limit of 4000 characters.');
    expect(getStderr()).not.toContain('Azure DevOps request failed');
    expect(getExitCode()).toBe(1);
  });

  it('fails with the branch zero-match contract message when no PR matches', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([]);

    await run(['--title', 'X']);

    expect(getStderr()).toContain('No open pull request matches branch feature/test.');
    expect(getExitCode()).toBe(1);
  });

  it('fails with the branch multi-match contract message when several PRs match', async () => {
    vi.mocked(listPullRequests).mockResolvedValue([currentPr, { ...currentPr, id: 97 }]);

    await run(['--title', 'X']);

    expect(getStderr()).toContain('Multiple open pull requests match branch feature/test: #96, #97.');
    expect(getExitCode()).toBe(1);
  });
});
