import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPipelineCommand } from '../../src/commands/pipeline.js';
import { createCommandRunner, getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';

vi.mock('../../src/services/pipeline-client.js', () => ({
  getPipelineDefinitions: vi.fn(),
  getPipelineRuns: vi.fn(),
  getBuildStatus: vi.fn(),
  getRunDetail: vi.fn(),
  getRunLogs: vi.fn(),
  getRunLog: vi.fn(),
  runPipeline: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

import {
  getBuildStatus,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunDetail,
  getRunLogs,
  runPipeline,
} from '../../src/services/pipeline-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createPipelineCommand);

beforeEach(() => {
  setupProcessSpies();
  vi.mocked(resolveContext).mockReturnValue({ org: 'test-org', project: 'test-project' });
  vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'test-pat', source: 'env', kind: 'pat' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pipeline list', () => {
  it('lists id and name', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([
      { id: 1, name: 'CI', folder: null },
      { id: 2, name: 'Release Train', folder: null },
    ]);
    await run(['list']);
    const out = getStdout();
    expect(out).toContain('1\tCI');
    expect(out).toContain('2\tRelease Train');
  });

  it('--filter narrows by case-insensitive substring', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([
      { id: 1, name: 'CI', folder: null },
      { id: 2, name: 'Release Train', folder: null },
    ]);
    await run(['list', '--filter', 'release']);
    const out = getStdout();
    expect(out).toContain('Release Train');
    expect(out).not.toContain('\tCI');
  });

  it('prints a no-pipelines message', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([]);
    await run(['list']);
    expect(getStdout()).toContain('No pipelines found.');
  });

  it('--json emits an array', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([{ id: 1, name: 'CI', folder: null }]);
    await run(['list', '--json']);
    expect(JSON.parse(getStdout())).toEqual([{ id: 1, name: 'CI', folder: null }]);
  });
});

describe('pipeline get-runs', () => {
  const runs = [
    { id: 100, name: 'a', state: 'completed' as const, result: 'succeeded' as const, createdDate: null, finishedDate: null, sourceBranch: 'refs/heads/develop' },
    { id: 99, name: 'b', state: 'completed' as const, result: 'failed' as const, createdDate: null, finishedDate: null, sourceBranch: 'refs/heads/feature/x' },
  ];

  it('rejects a non-numeric def id', async () => {
    await run(['get-runs', 'abc']);
    expect(getStderr()).toContain('Invalid definition id');
    expect(getExitCode()).toBe(1);
  });

  it('--limit caps the result', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue(runs);
    await run(['get-runs', '5', '--limit', '1', '--json']);
    expect(JSON.parse(getStdout())).toHaveLength(1);
  });

  it('--branch filters by source branch', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue(runs);
    await run(['get-runs', '5', '--branch', 'develop', '--json']);
    const out = JSON.parse(getStdout());
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(100);
  });
});

describe('pipeline wait — exit code reflects result', () => {
  it('exits 0 on success', async () => {
    vi.mocked(getBuildStatus).mockResolvedValue({ state: 'completed', result: 'succeeded' });
    await run(['wait', '100']);
    expect(getExitCode()).toBe(0);
  });

  it('exits 1 on failure', async () => {
    vi.mocked(getBuildStatus).mockResolvedValue({ state: 'completed', result: 'failed' });
    await run(['wait', '100']);
    expect(getExitCode()).toBe(1);
  });

  it('exits 2 on cancel', async () => {
    vi.mocked(getBuildStatus).mockResolvedValue({ state: 'completed', result: 'canceled' });
    await run(['wait', '100']);
    expect(getExitCode()).toBe(2);
  });

  it('exits 124 on timeout without canceling the run', async () => {
    vi.mocked(getBuildStatus).mockResolvedValue({ state: 'inProgress', result: null });
    await run(['wait', '100', '--timeout', '0']);
    expect(getExitCode()).toBe(124);
    expect(getStdout()).toContain('did not finish');
  });

  it('rejects a non-numeric run id', async () => {
    await run(['wait', 'nope']);
    expect(getStderr()).toContain('Invalid run id');
    expect(getExitCode()).toBe(1);
  });
});

describe('pipeline get-run-detail', () => {
  const base = {
    id: 100,
    name: 'a',
    state: 'completed' as const,
    result: 'failed' as const,
    createdDate: '2026-06-03T10:00:00Z',
    finishedDate: '2026-06-03T10:05:00Z',
    sourceBranch: 'refs/heads/develop',
    sourceCommit: 'abc123',
    webUrl: 'https://x/100',
    errors: [{ message: 'boom', source: 'Compile' }],
    errorsAvailable: true,
    stages: [{ name: 'Build', state: 'completed', result: 'failed' }],
  };

  it('shows errors and failing-test count', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, tests: { present: true, total: 10, failed: 2 }, testsAvailable: true });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('boom');
    expect(out).toContain('2 failing of 10');
  });

  it('distinguishes "no tests present" from zero failures', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, tests: { present: false, total: 0, failed: 0 }, testsAvailable: true });
    await run(['get-run-detail', '100']);
    expect(getStdout()).toContain('no tests present');
  });

  it('shows "unavailable" when a source degrades', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, errors: [], errorsAvailable: false, stages: [], tests: { present: false, total: 0, failed: 0 }, testsAvailable: false });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('unavailable');
  });
});

describe('pipeline logs / start', () => {
  it('lists logs', async () => {
    vi.mocked(getRunLogs).mockResolvedValue([{ id: 1, createdOn: null, lineCount: 5 }]);
    await run(['logs', '100', '--json']);
    expect(JSON.parse(getStdout())).toEqual([{ id: 1, createdOn: null, lineCount: 5 }]);
  });

  it('start parses repeated --parameter and --branch', async () => {
    vi.mocked(runPipeline).mockResolvedValue({ id: 200, state: 'inProgress', webUrl: null });
    await run(['start', '5', '--branch', 'develop', '--parameter', 'a=1', '--parameter', 'b=2', '--json']);
    expect(JSON.parse(getStdout())).toEqual({ id: 200, state: 'inProgress', webUrl: null });
    expect(vi.mocked(runPipeline)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      5,
      { branch: 'develop', parameters: { a: '1', b: '2' } },
    );
  });

  it('start rejects a malformed --parameter', async () => {
    await run(['start', '5', '--parameter', 'novalue']);
    expect(getStderr()).toContain('Invalid --parameter');
    expect(getExitCode()).toBe(1);
  });
});
