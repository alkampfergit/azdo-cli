import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext, AuthCredential } from '../../src/types/work-item.js';
import {
  getBuildStatus,
  getBuildTimeline,
  getFailedTests,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunLogs,
  getTestSummary,
  runPipeline,
} from '../../src/services/pipeline-client.js';

const context: AzdoContext = { org: 'test-org', project: 'test-project' };
const cred: AuthCredential = { pat: 'test-pat', source: 'env', kind: 'pat' };

function mockFetchJson(json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('pipeline-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPipelineDefinitions maps id/name/folder', async () => {
    const fetchSpy = mockFetchJson({
      count: 2,
      value: [
        { id: 1, name: 'CI', folder: String.raw`\team` },
        { id: 2, name: 'Release' },
      ],
    });
    const result = await getPipelineDefinitions(context, cred);
    expect(fetchSpy.mock.calls[0][0]).toContain('/test-org/test-project/_apis/pipelines');
    expect(fetchSpy.mock.calls[0][0]).toContain('api-version=7.1');
    expect(result).toEqual([
      { id: 1, name: 'CI', folder: String.raw`\team` },
      { id: 2, name: 'Release', folder: null },
    ]);
  });

  it('getPipelineRuns lists builds with sourceBranch/sourceCommit populated', async () => {
    const fetchSpy = mockFetchJson({
      value: [
        {
          id: 100,
          buildNumber: '20260603.1',
          status: 'completed',
          result: 'succeeded',
          queueTime: '2026-06-03T10:00:00Z',
          finishTime: '2026-06-03T10:05:00Z',
          sourceBranch: 'refs/heads/develop',
          sourceVersion: 'abc123def456',
        },
        { id: 99, status: 'inProgress' },
      ],
    });
    const result = await getPipelineRuns(context, cred, { definitionId: 5, top: 10 });
    const url = fetchSpy.mock.calls[0][0] as string;
    // The Build API carries sourceBranch — the Pipelines runs list does not.
    expect(url).toContain('/_apis/build/builds');
    expect(url).toContain('definitions=5');
    expect(url).toContain('queryOrder=queueTimeDescending');
    expect(url).toContain('%24top=10');
    expect(result[0]).toEqual({
      id: 100,
      name: '20260603.1',
      state: 'completed',
      result: 'succeeded',
      createdDate: '2026-06-03T10:00:00Z',
      finishedDate: '2026-06-03T10:05:00Z',
      sourceBranch: 'refs/heads/develop',
      sourceCommit: 'abc123def456',
    });
    expect(result[1]).toMatchObject({ id: 99, state: 'inProgress', result: null, sourceBranch: null, sourceCommit: null });
  });

  it('getPipelineRuns filters by branch server-side (normalized to a ref)', async () => {
    const fetchSpy = mockFetchJson({ value: [] });
    await getPipelineRuns(context, cred, { definitionId: 5, branch: 'develop', top: 10 });
    expect(fetchSpy.mock.calls[0][0]).toContain(`branchName=${encodeURIComponent('refs/heads/develop')}`);
  });

  it('getPipelineRuns maps --pr to the PR merge ref and allows no definition', async () => {
    const fetchSpy = mockFetchJson({ value: [] });
    await getPipelineRuns(context, cred, { prNumber: 4664, top: 10 });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(`branchName=${encodeURIComponent('refs/pull/4664/merge')}`);
    expect(url).not.toContain('definitions=');
  });

  it('getPipelineRuns matches commits client-side by SHA prefix over a wider window', async () => {
    const fetchSpy = mockFetchJson({
      value: [
        { id: 100, status: 'completed', sourceVersion: 'ABC123def456' },
        { id: 99, status: 'completed', sourceVersion: 'fff000fff000' },
      ],
    });
    const result = await getPipelineRuns(context, cred, { commit: 'abc123', top: 10 });
    // No sourceVersion filter exists server-side — a 200-build window is scanned.
    expect(fetchSpy.mock.calls[0][0]).toContain('%24top=200');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(100);
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
    expect(await getTestSummary(context, cred, 100)).toEqual({ present: true, total: 10, failed: 3, failedTests: [] });

    mockFetchJson({});
    expect(await getTestSummary(context, cred, 100)).toEqual({ present: false, total: 0, failed: 0, failedTests: [] });
  });

  it('getFailedTests walks build test runs and returns Failed-outcome results', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: 7 }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [
              { testCaseTitle: 'should map runs', errorMessage: 'expected 1 to be 2\nstack...' },
              { automatedTestName: 'Suite.testX' },
            ],
          }),
          { status: 200 },
        ),
      );
    const result = await getFailedTests(context, cred, 100);
    expect(fetchSpy.mock.calls[0][0]).toContain(`buildUri=${encodeURIComponent('vstfs:///Build/Build/100')}`);
    expect(fetchSpy.mock.calls[1][0]).toContain('/_apis/test/runs/7/results');
    expect(fetchSpy.mock.calls[1][0]).toContain('outcomes=Failed');
    expect(result).toEqual([
      { name: 'should map runs', errorMessage: 'expected 1 to be 2\nstack...' },
      { name: 'Suite.testX', errorMessage: null },
    ]);
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    await expect(getPipelineDefinitions(context, cred)).rejects.toThrow('AUTH_FAILED');
  });

  it('throws HTTP_<status> on non-OK responses instead of parsing the error payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'boom' }), { status: 500 }),
    );
    await expect(getPipelineDefinitions(context, cred)).rejects.toThrow('HTTP_500');
  });
});
