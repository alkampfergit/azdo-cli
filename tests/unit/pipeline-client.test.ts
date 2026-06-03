import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext, AuthCredential } from '../../src/types/work-item.js';
import {
  getBuildStatus,
  getBuildTimeline,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunLogs,
  getTestSummary,
  runPipeline,
} from '../../src/services/pipeline-client.js';

const context: AzdoContext = { org: 'test-org', project: 'test-project' };
const cred: AuthCredential = { pat: 'test-pat', source: 'env', kind: 'pat' };

function mockFetchJson(json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => json,
  } as unknown as Response);
}

describe('pipeline-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPipelineDefinitions maps id/name/folder', async () => {
    const fetchSpy = mockFetchJson({
      count: 2,
      value: [
        { id: 1, name: 'CI', folder: '\\team' },
        { id: 2, name: 'Release' },
      ],
    });
    const result = await getPipelineDefinitions(context, cred);
    expect(fetchSpy.mock.calls[0][0]).toContain('/test-org/test-project/_apis/pipelines');
    expect(fetchSpy.mock.calls[0][0]).toContain('api-version=7.1');
    expect(result).toEqual([
      { id: 1, name: 'CI', folder: '\\team' },
      { id: 2, name: 'Release', folder: null },
    ]);
  });

  it('getPipelineRuns maps state/result/branch newest-first', async () => {
    mockFetchJson({
      value: [
        {
          id: 100,
          name: '20260603.1',
          state: 'completed',
          result: 'succeeded',
          createdDate: '2026-06-03T10:00:00Z',
          finishedDate: '2026-06-03T10:05:00Z',
          resources: { repositories: { self: { refName: 'refs/heads/develop' } } },
        },
        { id: 99, state: 'inProgress' },
      ],
    });
    const result = await getPipelineRuns(context, cred, 5);
    expect(result[0]).toEqual({
      id: 100,
      name: '20260603.1',
      state: 'completed',
      result: 'succeeded',
      createdDate: '2026-06-03T10:00:00Z',
      finishedDate: '2026-06-03T10:05:00Z',
      sourceBranch: 'refs/heads/develop',
    });
    expect(result[1]).toMatchObject({ id: 99, state: 'inProgress', result: null, sourceBranch: null });
  });

  it('getBuildStatus maps build status/result to run vocabulary', async () => {
    mockFetchJson({ id: 100, status: 'completed', result: 'partiallySucceeded' });
    const result = await getBuildStatus(context, cred, 100);
    // partiallySucceeded collapses to failed so callers never treat it as clean
    expect(result).toEqual({ state: 'completed', result: 'failed' });
  });

  it('getBuildTimeline extracts errors and stage statuses', async () => {
    mockFetchJson({
      records: [
        { type: 'Stage', name: 'Build', state: 'completed', result: 'succeeded', issues: [] },
        {
          type: 'Task',
          name: 'Compile',
          issues: [
            { type: 'error', message: 'TS1005: ; expected' },
            { type: 'warning', message: 'noisy' },
          ],
        },
        { type: 'Stage', name: 'Test', state: 'completed', result: 'failed' },
      ],
    });
    const result = await getBuildTimeline(context, cred, 100);
    expect(result.errors).toEqual([{ message: 'TS1005: ; expected', source: 'Compile' }]);
    expect(result.stages).toEqual([
      { name: 'Build', state: 'completed', result: 'succeeded' },
      { name: 'Test', state: 'completed', result: 'failed' },
    ]);
  });

  it('getTestSummary reports present counts and the "no tests" case', async () => {
    mockFetchJson({ aggregatedResultsAnalysis: { totalTests: 10, resultsByOutcome: { Failed: { count: 3 } } } });
    expect(await getTestSummary(context, cred, 100)).toEqual({ present: true, total: 10, failed: 3 });

    mockFetchJson({});
    expect(await getTestSummary(context, cred, 100)).toEqual({ present: false, total: 0, failed: 0 });
  });

  it('runPipeline POSTs branch refName and template parameters', async () => {
    const fetchSpy = mockFetchJson({ id: 200, state: 'inProgress', _links: { web: { href: 'https://x/200' } } });
    const result = await runPipeline(context, cred, 5, { branch: 'feature/x', parameters: { env: 'staging' } });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      resources: { repositories: { self: { refName: 'refs/heads/feature/x' } } },
      templateParameters: { env: 'staging' },
    });
    expect(result).toEqual({ id: 200, state: 'inProgress', webUrl: 'https://x/200' });
  });

  it('getRunLogs maps the log list', async () => {
    mockFetchJson({ value: [{ id: 1, createdOn: '2026-06-03T10:00:00Z', lineCount: 42 }] });
    expect(await getRunLogs(context, cred, 100)).toEqual([
      { id: 1, createdOn: '2026-06-03T10:00:00Z', lineCount: 42 },
    ]);
  });

  it('propagates AUTH_FAILED from fetchWithErrors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, headers: { get: () => '' } } as unknown as Response);
    await expect(getPipelineDefinitions(context, cred)).rejects.toThrow('AUTH_FAILED');
  });
});
