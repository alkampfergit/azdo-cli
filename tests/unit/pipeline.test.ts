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
  getTestSummary: vi.fn(),
  getFailedTests: vi.fn(),
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
  getFailedTests,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunDetail,
  getRunLog,
  getRunLogs,
  getTestSummary,
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
  it('lists id and name in aligned (tab-free) columns', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([
      { id: 1, name: 'CI', folder: null },
      { id: 200, name: 'Release Train', folder: null },
    ]);
    await run(['list']);
    const out = getStdout();
    expect(out).toContain('CI');
    expect(out).toContain('Release Train');
    // No tab characters — columns are space-padded so they align in a terminal.
    expect(out).not.toContain('\t');
    // Right-aligned numeric id column: the shorter id is space-padded to width.
    const lines = out.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^\s+1 /);
    expect(lines[1]).toMatch(/^200 /);
  });

  it('--filter narrows by case-insensitive substring', async () => {
    vi.mocked(getPipelineDefinitions).mockResolvedValue([
      { id: 1, name: 'CI', folder: null },
      { id: 2, name: 'Release Train', folder: null },
    ]);
    await run(['list', '--filter', 'release']);
    const out = getStdout();
    expect(out).toContain('Release Train');
    expect(out).not.toContain('CI');
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
    { id: 100, name: 'a', state: 'completed' as const, result: 'succeeded' as const, createdDate: null, finishedDate: null, sourceBranch: 'refs/heads/develop', sourceCommit: 'abc123def456' },
    { id: 99, name: 'b', state: 'completed' as const, result: 'failed' as const, createdDate: null, finishedDate: null, sourceBranch: 'refs/heads/feature/x', sourceCommit: null },
  ];

  it('rejects a non-numeric def id', async () => {
    await run(['get-runs', 'abc']);
    expect(getStderr()).toContain('Invalid definition id');
    expect(getExitCode()).toBe(1);
  });

  it('requires a def id when no --commit/--pr filter is given', async () => {
    await run(['get-runs']);
    expect(getStderr()).toContain('Definition id is required');
    expect(getExitCode()).toBe(1);
  });

  it('passes --limit and --branch through to the runs query', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue([runs[0]]);
    await run(['get-runs', '5', '--limit', '1', '--branch', 'develop', '--json']);
    expect(vi.mocked(getPipelineRuns)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { definitionId: 5, branch: 'develop', prNumber: undefined, commit: undefined, top: 1 },
    );
    expect(JSON.parse(getStdout())).toHaveLength(1);
  });

  it('--pr works without a def id and maps to the query', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue(runs);
    await run(['get-runs', '--pr', '4664', '--json']);
    expect(vi.mocked(getPipelineRuns)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ definitionId: undefined, prNumber: 4664 }),
    );
  });

  it('--commit works without a def id and rejects a non-SHA value', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue([runs[0]]);
    await run(['get-runs', '--commit', 'abc123', '--json']);
    expect(vi.mocked(getPipelineRuns)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ commit: 'abc123' }),
    );

    await run(['get-runs', '--commit', 'not-a-sha']);
    expect(getStderr()).toContain('Invalid --commit');
    expect(getExitCode()).toBe(1);
  });

  it('rejects --branch combined with --pr', async () => {
    await run(['get-runs', '5', '--branch', 'develop', '--pr', '1']);
    expect(getStderr()).toContain('Use either --branch or --pr');
    expect(getExitCode()).toBe(1);
  });

  it('shows the abbreviated commit in the table output', async () => {
    vi.mocked(getPipelineRuns).mockResolvedValue(runs);
    await run(['get-runs', '5']);
    const out = getStdout();
    expect(out).toContain('abc123de');
    expect(out).not.toContain('abc123def456');
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
    startedDate: '2026-06-03T10:00:30Z',
    finishedDate: '2026-06-03T10:05:00Z',
    durationSeconds: 270,
    reason: 'individualCI',
    requestedFor: 'Gian Maria',
    sourceBranch: 'refs/heads/develop',
    sourceCommit: 'abc123',
    webUrl: 'https://x/100',
    errors: [{ message: 'boom', source: 'Compile' }],
    errorsAvailable: true,
    stages: [{ name: 'Build', state: 'completed', result: 'failed' }],
    jobs: [
      { name: 'build', state: 'completed', result: 'succeeded' },
      { name: 'integration-tests', state: 'completed', result: 'failed' },
    ],
  };

  it('shows errors and failing-test count', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, tests: { present: true, total: 10, failed: 2, failedTests: [] }, testsAvailable: true });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('boom');
    expect(out).toContain('2 failing of 10');
  });

  it('shows queue/start times, duration, reason, requestor, and per-job breakdown', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, tests: { present: false, total: 0, failed: 0, failedTests: [] }, testsAvailable: true });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('Queued: 2026-06-03T10:00:00Z');
    expect(out).toContain('Started: 2026-06-03T10:00:30Z');
    expect(out).toContain('Duration: 4m30s');
    expect(out).toContain('Reason: individualCI');
    expect(out).toContain('Requested for: Gian Maria');
    expect(out).toContain('Jobs:');
    expect(out).toContain('- build [succeeded]');
    expect(out).toContain('- integration-tests [failed]');
  });

  it('lists failing tests with the first line of the error message', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({
      ...base,
      tests: {
        present: true,
        total: 10,
        failed: 2,
        failedTests: [
          { name: 'Suite.testX', errorMessage: 'expected 1 to be 2\nlong stack trace' },
          { name: 'Suite.testY', errorMessage: null },
        ],
      },
      testsAvailable: true,
    });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('- Suite.testX: expected 1 to be 2');
    expect(out).not.toContain('long stack trace');
    expect(out).toContain('- Suite.testY');
  });

  it('distinguishes "no tests present" from zero failures', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, tests: { present: false, total: 0, failed: 0, failedTests: [] }, testsAvailable: true });
    await run(['get-run-detail', '100']);
    expect(getStdout()).toContain('no tests present');
  });

  it('shows "unavailable" when a source degrades', async () => {
    vi.mocked(getRunDetail).mockResolvedValue({ ...base, errors: [], errorsAvailable: false, stages: [], tests: { present: false, total: 0, failed: 0, failedTests: [] }, testsAvailable: false });
    await run(['get-run-detail', '100']);
    const out = getStdout();
    expect(out).toContain('unavailable');
  });
});

describe('pipeline logs / start', () => {
  it('lists logs with their step names', async () => {
    vi.mocked(getRunLogs).mockResolvedValue([{ id: 1, createdOn: null, lineCount: 5, step: 'Run tests' }]);
    await run(['logs', '100', '--json']);
    expect(JSON.parse(getStdout())).toEqual([{ id: 1, createdOn: null, lineCount: 5, step: 'Run tests' }]);

    await run(['logs', '100']);
    expect(getStdout()).toContain('Run tests');
  });

  it('--tail prints only the last N lines of a log', async () => {
    vi.mocked(getRunLog).mockResolvedValue('one\ntwo\nthree\nfour\n');
    await run(['logs', '100', '--log-id', '7', '--tail', '2']);
    expect(getStdout()).toBe('three\nfour\n');
  });

  it('--grep filters lines by regex and combines with --tail', async () => {
    vi.mocked(getRunLog).mockResolvedValue('ok step\nERROR: a\nok again\nERROR: b\nERROR: c\n');
    await run(['logs', '100', '--log-id', '7', '--grep', '^ERROR', '--tail', '2']);
    expect(getStdout()).toBe('ERROR: b\nERROR: c\n');
  });

  it('--grep with no matches prints nothing', async () => {
    vi.mocked(getRunLog).mockResolvedValue('one\ntwo\n');
    await run(['logs', '100', '--log-id', '7', '--grep', 'nothing-matches']);
    expect(getStdout()).toBe('');
    expect(getExitCode()).toBe(0);
  });

  it('rejects --tail/--grep without --log-id/--step and invalid values', async () => {
    await run(['logs', '100', '--tail', '5']);
    expect(getStderr()).toContain('require --log-id or --step');
    expect(getExitCode()).toBe(1);

    await run(['logs', '100', '--log-id', '7', '--grep', '[unclosed']);
    expect(getStderr()).toContain('Invalid --grep');

    await run(['logs', '100', '--log-id', '7', '--tail', 'zero']);
    expect(getStderr()).toContain('Invalid --tail');

    await run(['logs', '100', '--log-id', '7', '--context', '3']);
    expect(getStderr()).toContain('--context requires --grep');
  });

  it('--grep --context prints surrounding lines with grep-style separators', async () => {
    vi.mocked(getRunLog).mockResolvedValue('a\nb\nERROR one\nc\nd\ne\nf\nERROR two\ng\n');
    await run(['logs', '100', '--log-id', '7', '--grep', '^ERROR', '--context', '1']);
    expect(getStdout()).toBe('b\nERROR one\nc\n--\nf\nERROR two\ng\n');
  });

  it('--step resolves the log id by step name', async () => {
    vi.mocked(getRunLogs).mockResolvedValue([
      { id: 24, createdOn: null, lineCount: 10, step: 'Run IN-PROCESS test for NET core' },
      { id: 25, createdOn: null, lineCount: 5, step: 'Publish artifacts' },
    ]);
    vi.mocked(getRunLog).mockResolvedValue('the log content\n');
    await run(['logs', '100', '--step', 'in-process']);
    expect(vi.mocked(getRunLog)).toHaveBeenCalledWith(expect.anything(), expect.anything(), 100, 24);
    expect(getStdout()).toBe('the log content\n');
  });

  it('--step errors on no match and on ambiguous matches', async () => {
    vi.mocked(getRunLogs).mockResolvedValue([
      { id: 1, createdOn: null, lineCount: 1, step: 'build' },
      { id: 2, createdOn: null, lineCount: 1, step: 'build docs' },
    ]);
    await run(['logs', '100', '--step', 'nothing']);
    expect(getStderr()).toContain('No log matches step');

    await run(['logs', '100', '--step', 'buil']);
    expect(getStderr()).toContain('matches multiple logs');

    // An exact name wins even when it is a substring of another step.
    vi.mocked(getRunLog).mockResolvedValue('x\n');
    await run(['logs', '100', '--step', 'build']);
    expect(vi.mocked(getRunLog)).toHaveBeenCalledWith(expect.anything(), expect.anything(), 100, 1);
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

describe('pipeline tests', () => {
  it('prints summary and failing tests with messages', async () => {
    vi.mocked(getTestSummary).mockResolvedValue({ present: true, total: 815, failed: 2, failedTests: [] });
    vi.mocked(getFailedTests).mockResolvedValue([
      { name: 'Suite.testX', errorMessage: 'expected 1 to be 2\nstack' },
      { name: 'Suite.testY', errorMessage: null },
    ]);
    await run(['tests', '100']);
    const out = getStdout();
    expect(out).toContain('2 failing of 815');
    expect(out).toContain('- Suite.testX: expected 1 to be 2');
    expect(out).toContain('- Suite.testY');
  });

  it('--failed lists only failing tests, and reports none cleanly', async () => {
    vi.mocked(getTestSummary).mockResolvedValue({ present: true, total: 10, failed: 1, failedTests: [] });
    vi.mocked(getFailedTests).mockResolvedValue([{ name: 'Suite.testX', errorMessage: null }]);
    await run(['tests', '100', '--failed']);
    expect(getStdout()).toBe('  - Suite.testX\n');

    vi.mocked(getTestSummary).mockResolvedValue({ present: true, total: 10, failed: 0, failedTests: [] });
    await run(['tests', '100', '--failed']);
    expect(getStdout()).toContain('No failing tests.');
  });

  it('reports when no test results are published', async () => {
    vi.mocked(getTestSummary).mockResolvedValue({ present: false, total: 0, failed: 0, failedTests: [] });
    await run(['tests', '100']);
    expect(getStdout()).toContain('No test results published for run 100.');
  });

  it('--json emits the summary with the failing-test list', async () => {
    vi.mocked(getTestSummary).mockResolvedValue({ present: true, total: 5, failed: 1, failedTests: [] });
    vi.mocked(getFailedTests).mockResolvedValue([{ name: 't', errorMessage: 'boom' }]);
    await run(['tests', '100', '--json']);
    expect(JSON.parse(getStdout())).toEqual({
      present: true,
      total: 5,
      failed: 1,
      failedTests: [{ name: 't', errorMessage: 'boom' }],
    });
  });
});
