// Domain + raw Azure DevOps shapes for the `azdo pipeline` command group.
// Raw `Azdo*` interfaces mirror the REST responses (api-version 7.1); the
// remaining types are what the command layer renders / serialises.

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface PipelineDefinition {
  id: number;
  name: string;
  folder: string | null;
}

export type PipelineRunState = 'inProgress' | 'completed' | 'unknown';
export type PipelineRunResult = 'succeeded' | 'failed' | 'canceled' | null;

export interface PipelineRunSummary {
  id: number;
  name: string | null;
  state: PipelineRunState;
  result: PipelineRunResult;
  createdDate: string | null;
  finishedDate: string | null;
  sourceBranch: string | null;
  sourceCommit: string | null;
}

// Filters for listing runs. `prNumber` maps to the PR's synthetic merge ref;
// `commit` is matched client-side (the Build API has no sourceVersion filter)
// and accepts an abbreviated SHA prefix.
export interface PipelineRunsQuery {
  definitionId?: number;
  branch?: string;
  prNumber?: number;
  commit?: string;
  top: number;
}

export interface PipelineRunError {
  message: string;
  source: string | null;
}

export interface PipelineStageStatus {
  name: string;
  state: string;
  result: string | null;
}

export interface FailedTest {
  name: string;
  errorMessage: string | null;
}

export interface TestSummary {
  present: boolean;
  total: number;
  failed: number;
  // Populated only when failures exist and the Test Results API is reachable.
  failedTests: FailedTest[];
}

export interface PipelineRunDetail extends PipelineRunSummary {
  webUrl: string | null;
  errors: PipelineRunError[];
  errorsAvailable: boolean;
  stages: PipelineStageStatus[];
  tests: TestSummary;
  testsAvailable: boolean;
}

export interface PipelineWaitResult {
  id: number;
  state: PipelineRunState;
  result: PipelineRunResult;
  timedOut: boolean;
}

export interface PipelineLog {
  id: number;
  createdOn: string | null;
  lineCount: number | null;
}

export interface PipelineStartResult {
  id: number;
  state: PipelineRunState;
  webUrl: string | null;
}

// ---------------------------------------------------------------------------
// Raw Azure DevOps REST shapes
// ---------------------------------------------------------------------------

export interface AzdoPipeline {
  id: number;
  name: string;
  folder?: string;
}

export interface AzdoPipelineListResponse {
  count?: number;
  value: AzdoPipeline[];
}

export interface AzdoRun {
  id: number;
  name?: string;
  state?: string;
  result?: string;
  createdDate?: string;
  finishedDate?: string;
  _links?: { web?: { href?: string } };
}

// Build API (api-version 7.1) — used for wait/detail/logs, keyed by build id
// (== pipeline run id for YAML pipelines).
export interface AzdoBuild {
  id: number;
  buildNumber?: string;
  status?: string; // notStarted | inProgress | completed | ...
  result?: string; // succeeded | failed | canceled | partiallySucceeded
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  _links?: { web?: { href?: string } };
}

export interface AzdoBuildListResponse {
  count?: number;
  value: AzdoBuild[];
}

export interface AzdoTimelineIssue {
  type?: string; // error | warning
  message?: string;
}

export interface AzdoTimelineRecord {
  type?: string; // Stage | Phase | Job | Task | ...
  name?: string;
  state?: string;
  result?: string;
  issues?: AzdoTimelineIssue[];
}

export interface AzdoTimeline {
  records?: AzdoTimelineRecord[];
}

// Test Results API — used to list individual failing tests for a build.
export interface AzdoTestRun {
  id: number;
}

export interface AzdoTestRunListResponse {
  count?: number;
  value: AzdoTestRun[];
}

export interface AzdoTestCaseResult {
  testCaseTitle?: string;
  automatedTestName?: string;
  errorMessage?: string;
}

export interface AzdoTestResultListResponse {
  count?: number;
  value: AzdoTestCaseResult[];
}

export interface AzdoTestResultSummary {
  aggregatedResultsAnalysis?: {
    totalTests?: number;
    resultsByOutcome?: {
      Failed?: { count?: number };
    };
  };
}

export interface AzdoBuildLog {
  id: number;
  createdOn?: string;
  lineCount?: number;
}

export interface AzdoBuildLogListResponse {
  count?: number;
  value: AzdoBuildLog[];
}
