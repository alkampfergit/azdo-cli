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

export interface TestSummary {
  present: boolean;
  total: number;
  failed: number;
}

export interface PipelineRunDetail extends PipelineRunSummary {
  sourceCommit: string | null;
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

export interface AzdoRunRepositoryResource {
  refName?: string;
  version?: string;
}

export interface AzdoRun {
  id: number;
  name?: string;
  state?: string;
  result?: string;
  createdDate?: string;
  finishedDate?: string;
  resources?: {
    repositories?: Record<string, AzdoRunRepositoryResource>;
  };
  _links?: { web?: { href?: string } };
}

export interface AzdoRunListResponse {
  count?: number;
  value: AzdoRun[];
}

// Build API (api-version 7.1) — used for wait/detail/logs, keyed by build id
// (== pipeline run id for YAML pipelines).
export interface AzdoBuild {
  id: number;
  buildNumber?: string;
  status?: string; // notStarted | inProgress | completed | ...
  result?: string; // succeeded | failed | canceled | partiallySucceeded
  startTime?: string;
  finishTime?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  _links?: { web?: { href?: string } };
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
