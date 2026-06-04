import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import { authHeaders, fetchWithErrors } from './azdo-client.js';
import type {
  AzdoBuild,
  AzdoBuildListResponse,
  AzdoBuildLogListResponse,
  AzdoPipeline,
  AzdoPipelineListResponse,
  AzdoRun,
  AzdoTestResultListResponse,
  AzdoTestResultSummary,
  AzdoTestRunListResponse,
  AzdoTimeline,
  FailedTest,
  PipelineDefinition,
  PipelineLog,
  PipelineRunDetail,
  PipelineRunError,
  PipelineRunResult,
  PipelineRunsQuery,
  PipelineRunState,
  PipelineRunSummary,
  PipelineStageStatus,
  PipelineStartResult,
  TestSummary,
} from '../types/pipeline.js';

const API_VERSION = '7.1';

function orgProjectBase(context: AzdoContext): string {
  return `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}`;
}

function withApiVersion(url: URL): URL {
  url.searchParams.set('api-version', API_VERSION);
  return url;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  // fetchWithErrors maps 401/403/404 and network failures; any other non-OK
  // status (e.g. 400/500) must not be JSON-parsed as a success payload —
  // mirror pr-client and fail fast with an HTTP_<status> error.
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapPipeline(pipeline: AzdoPipeline): PipelineDefinition {
  return {
    id: pipeline.id,
    name: pipeline.name,
    folder: pipeline.folder?.trim() ? pipeline.folder : null,
  };
}

function mapRunState(state: string | undefined): PipelineRunState {
  if (state === 'inProgress' || state === 'completed') {
    return state;
  }
  return 'unknown';
}

function mapRunResult(result: string | undefined): PipelineRunResult {
  if (result === 'succeeded' || result === 'failed' || result === 'canceled') {
    return result;
  }
  // partiallySucceeded and unknown future values collapse to failed so callers
  // never treat a non-clean run as success.
  if (result === 'partiallySucceeded') {
    return 'failed';
  }
  return null;
}

// Build status maps onto the same run state/result vocabulary so `wait` can
// share the run-result → exit-code logic.
function mapBuildState(status: string | undefined): PipelineRunState {
  if (status === 'completed') return 'completed';
  if (status === undefined || status === 'none') return 'unknown';
  return 'inProgress'; // notStarted | inProgress | postponed | cancelling
}

function mapBuildSummary(build: AzdoBuild): PipelineRunSummary {
  return {
    id: build.id,
    name: build.buildNumber ?? null,
    state: mapBuildState(build.status),
    result: mapRunResult(build.result),
    createdDate: build.queueTime ?? build.startTime ?? null,
    finishedDate: build.finishTime ?? null,
    sourceBranch: build.sourceBranch ?? null,
    sourceCommit: build.sourceVersion ?? null,
  };
}

function normalizeRef(branch: string): string {
  return branch.startsWith('refs/') ? branch : `refs/heads/${branch}`;
}

// ---------------------------------------------------------------------------
// Pipelines API
// ---------------------------------------------------------------------------

export async function getPipelineDefinitions(
  context: AzdoContext,
  cred: AuthCredential,
): Promise<PipelineDefinition[]> {
  const url = withApiVersion(new URL(`${orgProjectBase(context)}/_apis/pipelines`));
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoPipelineListResponse>(response);
  return data.value.map(mapPipeline);
}

// How many recent builds to scan when filtering by commit: the Build API has
// no sourceVersion query parameter, so the match happens client-side over a
// recent window.
const COMMIT_LOOKBACK = 200;

export async function getPipelineRuns(
  context: AzdoContext,
  cred: AuthCredential,
  query: PipelineRunsQuery,
): Promise<PipelineRunSummary[]> {
  // Listed through the Build API rather than the Pipelines runs endpoint: the
  // latter omits resources/repositories in list responses (sourceBranch would
  // always be null), while builds carry sourceBranch/sourceVersion and filter
  // by branch server-side. Build id == run id for YAML pipelines.
  const url = withApiVersion(new URL(`${orgProjectBase(context)}/_apis/build/builds`));
  if (query.definitionId !== undefined) {
    url.searchParams.set('definitions', String(query.definitionId));
  }
  if (query.prNumber !== undefined) {
    // PR validation builds run on the PR's synthetic merge ref.
    url.searchParams.set('branchName', `refs/pull/${query.prNumber}/merge`);
  } else if (query.branch) {
    url.searchParams.set('branchName', normalizeRef(query.branch));
  }
  url.searchParams.set('queryOrder', 'queueTimeDescending');
  url.searchParams.set('$top', String(query.commit ? COMMIT_LOOKBACK : query.top));
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoBuildListResponse>(response);
  let runs = data.value.map(mapBuildSummary);
  if (query.commit) {
    const needle = query.commit.toLowerCase();
    runs = runs.filter((run) => run.sourceCommit?.toLowerCase().startsWith(needle));
  }
  return runs.slice(0, query.top);
}

export async function runPipeline(
  context: AzdoContext,
  cred: AuthCredential,
  pipelineId: number,
  opts: { branch?: string; parameters?: Record<string, string> },
): Promise<PipelineStartResult> {
  const url = withApiVersion(
    new URL(`${orgProjectBase(context)}/_apis/pipelines/${pipelineId}/runs`),
  );
  const body: {
    resources?: { repositories: { self: { refName: string } } };
    templateParameters?: Record<string, string>;
  } = {};
  if (opts.branch) {
    const refName = opts.branch.startsWith('refs/') ? opts.branch : `refs/heads/${opts.branch}`;
    body.resources = { repositories: { self: { refName } } };
  }
  if (opts.parameters && Object.keys(opts.parameters).length > 0) {
    body.templateParameters = opts.parameters;
  }
  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: { ...authHeaders(cred), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJsonResponse<AzdoRun>(response);
  return {
    id: data.id,
    state: mapRunState(data.state),
    webUrl: data._links?.web?.href ?? null,
  };
}

// ---------------------------------------------------------------------------
// Build API (keyed by build id == run id) — wait / detail / logs
// ---------------------------------------------------------------------------

function buildUrl(context: AzdoContext, buildId: number): URL {
  return withApiVersion(new URL(`${orgProjectBase(context)}/_apis/build/builds/${buildId}`));
}

export async function getBuild(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<AzdoBuild> {
  const response = await fetchWithErrors(buildUrl(context, buildId).toString(), {
    headers: authHeaders(cred),
  });
  return readJsonResponse<AzdoBuild>(response);
}

// Lightweight status used by `wait`: state + result only.
export async function getBuildStatus(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<{ state: PipelineRunState; result: PipelineRunResult }> {
  const build = await getBuild(context, cred, buildId);
  return { state: mapBuildState(build.status), result: mapRunResult(build.result) };
}

export async function getBuildTimeline(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<{ errors: PipelineRunError[]; stages: PipelineStageStatus[] }> {
  const url = withApiVersion(
    new URL(`${orgProjectBase(context)}/_apis/build/builds/${buildId}/timeline`),
  );
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoTimeline>(response);
  const records = data.records ?? [];

  const errors: PipelineRunError[] = [];
  const stages: PipelineStageStatus[] = [];
  for (const record of records) {
    for (const issue of record.issues ?? []) {
      if (issue.type === 'error' && issue.message) {
        errors.push({ message: issue.message, source: record.name ?? null });
      }
    }
    if (record.type === 'Stage' && record.name) {
      stages.push({
        name: record.name,
        state: record.state ?? 'unknown',
        result: record.result ?? null,
      });
    }
  }
  return { errors, stages };
}

export async function getTestSummary(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<TestSummary> {
  const url = withApiVersion(
    new URL(`${orgProjectBase(context)}/_apis/test/ResultSummaryByBuild`),
  );
  url.searchParams.set('buildId', String(buildId));
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoTestResultSummary>(response);
  const analysis = data.aggregatedResultsAnalysis;
  const total = analysis?.totalTests ?? 0;
  if (!analysis || total === 0) {
    return { present: false, total: 0, failed: 0, failedTests: [] };
  }
  return {
    present: true,
    total,
    failed: analysis.resultsByOutcome?.Failed?.count ?? 0,
    failedTests: [],
  };
}

// Caps the failing-test list so a catastrophic run doesn't flood the output.
const MAX_FAILED_TESTS = 50;

export async function getFailedTests(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<FailedTest[]> {
  // Two-step Test Results API walk: build → its test runs → each run's
  // Failed-outcome results. ResultSummaryByBuild only carries counts.
  const runsUrl = withApiVersion(new URL(`${orgProjectBase(context)}/_apis/test/runs`));
  runsUrl.searchParams.set('buildUri', `vstfs:///Build/Build/${buildId}`);
  const runsResponse = await fetchWithErrors(runsUrl.toString(), { headers: authHeaders(cred) });
  const runsData = await readJsonResponse<AzdoTestRunListResponse>(runsResponse);

  const failed: FailedTest[] = [];
  for (const testRun of runsData.value) {
    if (failed.length >= MAX_FAILED_TESTS) break;
    const resultsUrl = withApiVersion(
      new URL(`${orgProjectBase(context)}/_apis/test/runs/${testRun.id}/results`),
    );
    resultsUrl.searchParams.set('outcomes', 'Failed');
    resultsUrl.searchParams.set('$top', String(MAX_FAILED_TESTS - failed.length));
    const resultsResponse = await fetchWithErrors(resultsUrl.toString(), {
      headers: authHeaders(cred),
    });
    const resultsData = await readJsonResponse<AzdoTestResultListResponse>(resultsResponse);
    for (const result of resultsData.value) {
      failed.push({
        name: result.testCaseTitle ?? result.automatedTestName ?? '(unnamed test)',
        errorMessage: result.errorMessage ?? null,
      });
    }
  }
  return failed;
}

export async function getRunDetail(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<PipelineRunDetail> {
  const build = await getBuild(context, cred, buildId);

  let errors: PipelineRunError[] = [];
  let stages: PipelineStageStatus[] = [];
  let errorsAvailable = true;
  try {
    const timeline = await getBuildTimeline(context, cred, buildId);
    errors = timeline.errors;
    stages = timeline.stages;
  } catch {
    errorsAvailable = false;
  }

  let tests: TestSummary = { present: false, total: 0, failed: 0, failedTests: [] };
  let testsAvailable = true;
  try {
    tests = await getTestSummary(context, cred, buildId);
    if (tests.failed > 0) {
      try {
        tests = { ...tests, failedTests: await getFailedTests(context, cred, buildId) };
      } catch {
        // The failing count alone is still useful — degrade to counts-only.
      }
    }
  } catch {
    testsAvailable = false;
  }

  return {
    id: build.id,
    name: build.buildNumber ?? null,
    state: mapBuildState(build.status),
    result: mapRunResult(build.result),
    createdDate: build.startTime ?? null,
    finishedDate: build.finishTime ?? null,
    sourceBranch: build.sourceBranch ?? null,
    sourceCommit: build.sourceVersion ?? null,
    webUrl: build._links?.web?.href ?? null,
    errors,
    errorsAvailable,
    stages,
    tests,
    testsAvailable,
  };
}

export async function getRunLogs(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
): Promise<PipelineLog[]> {
  const url = withApiVersion(
    new URL(`${orgProjectBase(context)}/_apis/build/builds/${buildId}/logs`),
  );
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoBuildLogListResponse>(response);
  return data.value.map((log) => ({
    id: log.id,
    createdOn: log.createdOn ?? null,
    lineCount: log.lineCount ?? null,
  }));
}

export async function getRunLog(
  context: AzdoContext,
  cred: AuthCredential,
  buildId: number,
  logId: number,
): Promise<string> {
  const url = withApiVersion(
    new URL(`${orgProjectBase(context)}/_apis/build/builds/${buildId}/logs/${logId}`),
  );
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  // Same non-OK guard as readJsonResponse: never print an error payload to
  // stdout as if it were log content.
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
  return response.text();
}
