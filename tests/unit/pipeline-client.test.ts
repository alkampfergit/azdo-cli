import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext, AuthCredential } from '../../src/types/work-item.js';
import {
  getBuildStatus,
  getBuildTimeline,
  getFailedTests,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunLogs,
  listBuildArtifacts,
  collectBody,
  downloadArtifactZip,
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

  it('getBuildTimeline extracts errors, stages, jobs, and log→step mapping', async () => {
    mockFetchJson({
      records: [
        { type: 'Stage', name: 'Build', state: 'completed', result: 'succeeded', issues: [] },
        {
          type: 'Task',
          name: 'Compile',
          log: { id: 7 },
          issues: [
            { type: 'error', message: 'TS1005: ; expected' },
            { type: 'warning', message: 'noisy' },
          ],
        },
        // Jobs arrive unordered — sorted by startTime in the result.
        { type: 'Job', name: 'integration-tests', state: 'completed', result: 'failed', startTime: '2026-06-03T10:02:00Z', log: { id: 9 } },
        { type: 'Job', name: 'build', state: 'completed', result: 'succeeded', startTime: '2026-06-03T10:01:00Z', log: { id: 8 } },
        { type: 'Stage', name: 'Test', state: 'completed', result: 'failed' },
      ],
    });
    const result = await getBuildTimeline(context, cred, 100);
    expect(result.errors).toEqual([{ message: 'TS1005: ; expected', source: 'Compile' }]);
    expect(result.stages).toEqual([
      { name: 'Build', state: 'completed', result: 'succeeded' },
      { name: 'Test', state: 'completed', result: 'failed' },
    ]);
    expect(result.jobs).toEqual([
      { name: 'build', state: 'completed', result: 'succeeded' },
      { name: 'integration-tests', state: 'completed', result: 'failed' },
    ]);
    expect(result.logSteps.get(7)).toBe('Compile');
    expect(result.logSteps.get(8)).toBe('build');
  });

  it('getRunLogs labels each log with its record type and parent name', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    fetchSpy
      .mockResolvedValueOnce(json({ value: [{ id: 5, lineCount: 73 }, { id: 9, lineCount: 1707 }] }))
      .mockResolvedValueOnce(
        json({
          records: [
            { id: 'stage', type: 'Stage', name: 'Scan' },
            { id: 'job', parentId: 'stage', type: 'Job', name: 'Trivy', log: { id: 5 } },
            { id: 'task', parentId: 'job', type: 'Task', name: 'Trivy', log: { id: 9 } },
          ],
        }),
      );
    const logs = await getRunLogs(context, cred, 100);
    expect(logs[0]).toMatchObject({ id: 5, step: 'Trivy', type: 'Job', parent: 'Scan' });
    expect(logs[1]).toMatchObject({ id: 9, step: 'Trivy', type: 'Task', parent: 'Trivy' });
  });

  it('listBuildArtifacts maps name, type, size and download url', async () => {
    const fetchSpy = mockFetchJson({
      value: [
        {
          id: 1,
          name: 'scan',
          resource: { type: 'Container', downloadUrl: 'https://x/dl', properties: { artifactsize: '2048' } },
        },
        { id: 2, name: 'bare' },
      ],
    });
    const result = await listBuildArtifacts(context, cred, 100);
    expect(fetchSpy.mock.calls[0][0]).toContain('/_apis/build/builds/100/artifacts');
    expect(result).toEqual([
      { id: 1, name: 'scan', type: 'Container', sizeBytes: 2048, downloadUrl: 'https://x/dl' },
      { id: 2, name: 'bare', type: null, sizeBytes: null, downloadUrl: null },
    ]);
  });

  it('downloadArtifactZip survives accurate, short, inflated and malformed Content-Length', async () => {
    const art = { id: 1, name: 's', type: null, sizeBytes: null, downloadUrl: 'https://x/dl' };
    const mk = (len: string) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2]));
          c.enqueue(new Uint8Array([3, 4]));
          c.close();
        },
      });
      return new Response(body, { headers: { 'content-length': len } });
    };
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const len of ['4', '3', '9', 'abc', '-5', '0', '99999999999999999999', '9999999999']) {
      spy.mockResolvedValueOnce(mk(len));
      expect(Array.from(await downloadArtifactZip(cred, art))).toEqual([1, 2, 3, 4]);
    }
  });

  it('collectBody grows past its initial capacity and never reserves the inflated header', async () => {
    async function* chunks() {
      yield new Uint8Array([1, 2, 3]);
      yield new Uint8Array([4, 5]);
      yield new Uint8Array([6, 7, 8, 9]);
    }
    const seen: number[] = [];
    const out = await collectBody(chunks(), 2_000_000_000, (n) => seen.push(n), 2);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seen).toEqual([3, 5, 9]);
    expect(Array.from(await collectBody(chunks(), 9, undefined, 2))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('downloadArtifactZip requests $format=zip and reports progress', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const seen: number[] = [];
    const bytes = await downloadArtifactZip(
      cred,
      { id: 1, name: 'scan', type: 'Container', sizeBytes: null, downloadUrl: 'https://x/dl?artifactName=scan' },
      (n) => seen.push(n),
    );
    expect(String(fetchSpy.mock.calls[0][0])).toContain('%24format=zip');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(seen.at(-1)).toBe(3);
    await expect(
      downloadArtifactZip(cred, { id: 2, name: 'x', type: null, sizeBytes: null, downloadUrl: null }),
    ).rejects.toThrow(/no download URL/);
  });

  it('getTestSummary aggregates per-run statistics from the stable test-runs list', async () => {
    // ResultSummaryByBuild is preview-only and rejected by some collections —
    // counts come from the runs list instead.
    const fetchSpy = mockFetchJson({
      value: [
        { id: 1, totalTests: 8, passedTests: 6, notApplicableTests: 1, incompleteTests: 0 },
        { id: 2, totalTests: 2, passedTests: 0 },
      ],
    });
    expect(await getTestSummary(context, cred, 100)).toEqual({ present: true, total: 10, failed: 3, failedTests: [] });
    expect(fetchSpy.mock.calls[0][0]).toContain(`buildUri=${encodeURIComponent('vstfs:///Build/Build/100')}`);

    mockFetchJson({ value: [] });
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

  it('getRunLogs maps the log list and labels each log with its timeline step', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ value: [{ id: 1, createdOn: '2026-06-03T10:00:00Z', lineCount: 42 }, { id: 2 }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ records: [{ type: 'Task', name: 'Run tests', log: { id: 1 } }] }),
          { status: 200 },
        ),
      );
    expect(await getRunLogs(context, cred, 100)).toEqual([
      { id: 1, createdOn: '2026-06-03T10:00:00Z', lineCount: 42, step: 'Run tests', type: 'Task', parent: null },
      { id: 2, createdOn: null, lineCount: null, step: null, type: null, parent: null },
    ]);
  });

  it('getRunLogs degrades to unlabelled logs when the timeline fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: 1 }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await getRunLogs(context, cred, 100)).toEqual([
      { id: 1, createdOn: null, lineCount: null, step: null, type: null, parent: null },
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
