import { Command } from 'commander';
import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import type {
  FailedTest,
  PipelineLog,
  PipelineRunDetail,
  PipelineRunSummary,
  PipelineStageStatus,
  PipelineWaitResult,
} from '../types/pipeline.js';
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
} from '../services/pipeline-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { validateOrgProjectPair } from '../services/command-helpers.js';

interface PipelineCommonOptions {
  org?: string;
  project?: string;
  json?: boolean;
}

// Exit codes for `wait` (the AI-agent contract):
const EXIT_FAILED = 1;
const EXIT_CANCELED = 2;
const EXIT_TIMEOUT = 124;

function writeError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}

function handlePipelineError(err: unknown, context?: AzdoContext): void {
  const error = err instanceof Error ? err : new Error(String(err));
  if (error.message === 'AUTH_FAILED') {
    writeError('Authentication failed. Check that your credential is valid and has the "Build (Read)" scope.');
    return;
  }
  if (error.message === 'PERMISSION_DENIED') {
    writeError(`Access denied. Your credential may lack pipeline permissions for project "${context?.project}".`);
    return;
  }
  if (error.message === 'NETWORK_ERROR') {
    writeError('Could not connect to Azure DevOps. Check your network connection.');
    return;
  }
  if (error.message.startsWith('NOT_FOUND')) {
    writeError(`Resource not found in ${context?.org}/${context?.project}.`);
    return;
  }
  if (error.message.startsWith('HTTP_')) {
    writeError(`Azure DevOps request failed with ${error.message}.`);
    return;
  }
  writeError(error.message);
}

// Parses a positive-integer id argument (definition or run id). Returns null on
// any invalid input — mirrors the --pr-number validation in pr.ts.
function parsePositiveId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Parses an optional positive-integer flag. Returns undefined when the flag
// was not given; writes the error and returns null on invalid input.
function parseOptionalCount(value: string | undefined, flag: string): number | undefined | null {
  if (value === undefined) return undefined;
  const parsed = parsePositiveId(value);
  if (parsed === null) {
    writeError(`Invalid ${flag} "${value}"; expected a positive integer.`);
    return null;
  }
  return parsed;
}

function formatBranchName(refName: string | null): string {
  if (!refName) return '—';
  return refName.startsWith('refs/heads/') ? refName.slice('refs/heads/'.length) : refName;
}

async function resolvePipelineContext(
  options: PipelineCommonOptions,
): Promise<{ context: AzdoContext; cred: AuthCredential }> {
  const context = resolveContext(options);
  const cred = await requireAuthCredential(context.org);
  return { context, cred };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Renders rows as space-padded columns that line up in a monospace terminal
// (tabs don't align — they jump to fixed tab stops). Columns in `rightAlign`
// are right-justified (used for numeric ids); a two-space gutter separates
// columns and trailing whitespace is trimmed per line.
function formatTable(rows: string[][], rightAlign: ReadonlySet<number> = new Set()): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, i) => (rightAlign.has(i) ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// pipeline list
// ---------------------------------------------------------------------------

function createPipelineListCommand(): Command {
  const command = new Command('list');
  command
    .description('List Azure DevOps pipeline definitions')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--filter <name>', 'filter definitions by name (case-insensitive substring)')
    .option('--json', 'output JSON')
    .action(async (options: PipelineCommonOptions & { filter?: string }) => {
      validateOrgProjectPair(options);
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        let definitions = await getPipelineDefinitions(resolved.context, resolved.cred);
        if (options.filter) {
          const needle = options.filter.toLowerCase();
          definitions = definitions.filter((d) => d.name.toLowerCase().includes(needle));
        }
        if (options.json) {
          process.stdout.write(`${JSON.stringify(definitions, null, 2)}\n`);
          return;
        }
        if (definitions.length === 0) {
          process.stdout.write('No pipelines found.\n');
          return;
        }
        const hasFolder = definitions.some((d) => d.folder);
        const rows = definitions.map((d) =>
          hasFolder ? [String(d.id), d.name, d.folder ?? ''] : [String(d.id), d.name],
        );
        process.stdout.write(`${formatTable(rows, new Set([0]))}\n`);
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline get-runs <def_id>
// ---------------------------------------------------------------------------

function runRow(run: PipelineRunSummary): string[] {
  const status = run.result ? `${run.state}/${run.result}` : run.state;
  return [
    String(run.id),
    `[${status}]`,
    run.createdDate ?? '—',
    formatBranchName(run.sourceBranch),
    run.sourceCommit ? run.sourceCommit.slice(0, 8) : '—',
  ];
}

interface GetRunsOptions extends PipelineCommonOptions {
  limit?: string;
  branch?: string;
  commit?: string;
  pr?: string;
}

// Abbreviated or full SHA-1; six hex chars is git's practical lower bound.
const COMMIT_SHA_PATTERN = /^[0-9a-f]{6,40}$/i;

interface GetRunsInputs {
  defId?: number;
  limit: number;
  prNumber?: number;
}

// Validates get-runs arguments; writes the error and returns null on bad input.
function parseGetRunsInputs(
  defIdRaw: string | undefined,
  options: GetRunsOptions,
): GetRunsInputs | null {
  let defId: number | undefined;
  if (defIdRaw !== undefined) {
    const parsed = parsePositiveId(defIdRaw);
    if (parsed === null) {
      writeError(`Invalid definition id "${defIdRaw}"; expected a positive integer.`);
      return null;
    }
    defId = parsed;
  } else if (options.commit === undefined && options.pr === undefined) {
    writeError('Definition id is required unless --commit or --pr is given.');
    return null;
  }
  const limit = parseOptionalCount(options.limit, '--limit');
  if (limit === null) return null;
  const prNumber = parseOptionalCount(options.pr, '--pr');
  if (prNumber === null) return null;
  if (options.commit !== undefined && !COMMIT_SHA_PATTERN.test(options.commit)) {
    writeError(`Invalid --commit "${options.commit}"; expected 6-40 hex characters.`);
    return null;
  }
  if (options.branch !== undefined && prNumber !== undefined) {
    writeError('Use either --branch or --pr, not both.');
    return null;
  }
  return { defId, limit: limit ?? 10, prNumber };
}

function createPipelineGetRunsCommand(): Command {
  const command = new Command('get-runs');
  command
    .description('List recent runs for a pipeline definition (newest first)')
    .argument('[def_id]', 'pipeline definition id (optional with --commit or --pr)')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--limit <n>', 'maximum number of runs to show (default 10)')
    .option('--branch <branch>', 'only show runs for this source branch')
    .option('--commit <sha>', 'only show runs that built this commit (full or abbreviated SHA)')
    .option('--pr <number>', 'only show runs for this pull request')
    .option('--json', 'output JSON')
    .action(async (defIdRaw: string | undefined, options: GetRunsOptions) => {
      validateOrgProjectPair(options);
      const inputs = parseGetRunsInputs(defIdRaw, options);
      if (inputs === null) {
        return;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const runs = await getPipelineRuns(resolved.context, resolved.cred, {
          definitionId: inputs.defId,
          branch: options.branch,
          prNumber: inputs.prNumber,
          commit: options.commit,
          top: inputs.limit,
        });
        if (options.json) {
          process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
          return;
        }
        if (runs.length === 0) {
          process.stdout.write(
            inputs.defId === undefined
              ? 'No runs found matching the filters.\n'
              : `No runs found for pipeline ${inputs.defId}.\n`,
          );
          return;
        }
        process.stdout.write(`${formatTable(runs.map(runRow), new Set([0]))}\n`);
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline wait <run_id>
// ---------------------------------------------------------------------------

function applyWaitExitCode(result: PipelineWaitResult): void {
  if (result.timedOut) {
    process.exitCode = EXIT_TIMEOUT;
    return;
  }
  switch (result.result) {
    case 'succeeded':
      // exit 0 — leave process.exitCode untouched
      return;
    case 'canceled':
      process.exitCode = EXIT_CANCELED;
      return;
    case 'failed':
    default:
      process.exitCode = EXIT_FAILED;
  }
}

function createPipelineWaitCommand(): Command {
  const command = new Command('wait');
  command
    .description('Wait for a pipeline run to finish; exit code reflects the result (0 success, non-zero otherwise)')
    .argument('<run_id>', 'pipeline run id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--timeout <seconds>', 'maximum seconds to wait (default 1800)')
    .option('--poll-interval <seconds>', 'seconds between status checks (default 5)')
    .option('--json', 'output JSON')
    .action(async (runIdRaw: string, options: PipelineCommonOptions & { timeout?: string; pollInterval?: string }) => {
      validateOrgProjectPair(options);
      const runId = parsePositiveId(runIdRaw);
      if (runId === null) {
        writeError(`Invalid run id "${runIdRaw}"; expected a positive integer.`);
        return;
      }
      const timeoutSec = options.timeout === undefined ? 1800 : Number(options.timeout);
      const pollSec = options.pollInterval === undefined ? 5 : Number(options.pollInterval);
      if (!Number.isFinite(timeoutSec) || timeoutSec < 0) {
        writeError(`Invalid --timeout "${options.timeout}"; expected a non-negative number.`);
        return;
      }
      if (!Number.isFinite(pollSec) || pollSec <= 0) {
        writeError(`Invalid --poll-interval "${options.pollInterval}"; expected a positive number.`);
        return;
      }

      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const deadline = Date.now() + timeoutSec * 1000;
        let waitResult: PipelineWaitResult | null = null;
        for (;;) {
          const status = await getBuildStatus(resolved.context, resolved.cred, runId);
          if (status.state === 'completed') {
            waitResult = { id: runId, state: status.state, result: status.result, timedOut: false };
            break;
          }
          if (Date.now() >= deadline) {
            waitResult = { id: runId, state: status.state, result: status.result, timedOut: true };
            break;
          }
          await sleep(pollSec * 1000);
        }

        applyWaitExitCode(waitResult);
        if (options.json) {
          process.stdout.write(`${JSON.stringify(waitResult, null, 2)}\n`);
          return;
        }
        if (waitResult.timedOut) {
          process.stdout.write(`Run ${runId} did not finish within ${timeoutSec}s (still ${waitResult.state}).\n`);
        } else {
          process.stdout.write(`Run ${runId} finished: ${waitResult.result ?? waitResult.state}.\n`);
        }
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline get-run-detail <run_id>
// ---------------------------------------------------------------------------

// Shared by the Stages and Jobs sections — both render timeline records.
function timelineRows(items: PipelineStageStatus[], available: boolean): string[] {
  if (!available) {
    return ['  unavailable'];
  }
  if (items.length === 0) {
    return ['  (none)'];
  }
  return items.map((item) => `  - ${item.name} [${item.result ?? item.state}]`);
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function errorRows(detail: PipelineRunDetail): string[] {
  if (!detail.errorsAvailable) {
    return ['  unavailable'];
  }
  if (detail.errors.length === 0) {
    return ['  (none)'];
  }
  return detail.errors.map((error) => {
    const source = error.source ? `[${error.source}] ` : '';
    return `  - ${source}${error.message}`;
  });
}

// One row per failing test: name plus the first line of its error message.
function failedTestRow(test: FailedTest): string {
  if (!test.errorMessage) {
    return `  - ${test.name}`;
  }
  const firstLine = test.errorMessage.split('\n', 1)[0].trim();
  return `  - ${test.name}: ${firstLine}`;
}

function testRows(detail: PipelineRunDetail): string[] {
  if (!detail.testsAvailable) {
    return ['  unavailable'];
  }
  if (detail.tests.present) {
    return [
      `  ${detail.tests.failed} failing of ${detail.tests.total}`,
      ...detail.tests.failedTests.map(failedTestRow),
    ];
  }
  return ['  no tests present'];
}

function formatRunDetail(detail: PipelineRunDetail): string {
  const status = detail.result ? `${detail.state}/${detail.result}` : detail.state;
  const name = detail.name ? ` ${detail.name}` : '';
  const duration = detail.durationSeconds == null ? '—' : formatDuration(detail.durationSeconds);
  return [
    `Run #${detail.id} [${status}]${name}`,
    `Queued: ${detail.createdDate ?? '—'}    Started: ${detail.startedDate ?? '—'}    Finished: ${detail.finishedDate ?? '—'}`,
    `Duration: ${duration}    Reason: ${detail.reason ?? '—'}    Requested for: ${detail.requestedFor ?? '—'}`,
    `Branch: ${formatBranchName(detail.sourceBranch)}    Commit: ${detail.sourceCommit ?? 'unavailable'}`,
    ...(detail.webUrl ? [`Link: ${detail.webUrl}`] : []),
    '',
    'Stages:',
    ...timelineRows(detail.stages, detail.errorsAvailable),
    '',
    'Jobs:',
    ...timelineRows(detail.jobs, detail.errorsAvailable),
    '',
    'Errors:',
    ...errorRows(detail),
    '',
    'Tests:',
    ...testRows(detail),
  ].join('\n');
}

function createPipelineGetRunDetailCommand(): Command {
  const command = new Command('get-run-detail');
  command
    .description('Show a detailed summary of a single pipeline run (errors, failing tests, stages)')
    .argument('<run_id>', 'pipeline run id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .action(async (runIdRaw: string, options: PipelineCommonOptions) => {
      validateOrgProjectPair(options);
      const runId = parsePositiveId(runIdRaw);
      if (runId === null) {
        writeError(`Invalid run id "${runIdRaw}"; expected a positive integer.`);
        return;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const detail = await getRunDetail(resolved.context, resolved.cred, runId);
        if (options.json) {
          process.stdout.write(`${JSON.stringify(detail, null, 2)}\n`);
          return;
        }
        process.stdout.write(`${formatRunDetail(detail)}\n`);
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline logs <run_id>
// ---------------------------------------------------------------------------

// grep -C semantics: every line within `context` lines of a match is included;
// non-contiguous chunks are separated by a `--` line, like grep.
function grepWithContext(lines: string[], grep: RegExp, context: number): string[] {
  const include = new Set<number>();
  lines.forEach((line, i) => {
    if (grep.test(line)) {
      for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
        include.add(j);
      }
    }
  });
  const selected: string[] = [];
  let prev = -1;
  for (const i of [...include].sort((a, b) => a - b)) {
    if (selected.length > 0 && i > prev + 1) {
      selected.push('--');
    }
    selected.push(lines[i]);
    prev = i;
  }
  return selected;
}

// Applies --grep (with optional --context) then --tail to a raw log payload.
// Returns the lines to print; an empty array means "print nothing".
function filterLogLines(
  content: string,
  grep: RegExp | undefined,
  tail: number | undefined,
  context: number,
): string[] {
  let lines = content.split('\n');
  // A trailing newline yields one empty final element — not a real line.
  if (lines.at(-1) === '') {
    lines.pop();
  }
  if (grep) {
    lines = context > 0 ? grepWithContext(lines, grep, context) : lines.filter((line) => grep.test(line));
  }
  if (tail !== undefined && lines.length > tail) {
    lines = lines.slice(-tail);
  }
  return lines;
}

interface LogsOptions extends PipelineCommonOptions {
  logId?: string;
  step?: string;
  tail?: string;
  grep?: string;
  context?: string;
}

interface LogFilterValues {
  tail?: number;
  contextLines: number;
  grep?: RegExp;
}

// Validates the log-slicing flags; writes the error and returns null on bad input.
function parseLogFilters(options: LogsOptions): LogFilterValues | null {
  if (options.logId !== undefined && options.step !== undefined) {
    writeError('Use either --log-id or --step, not both.');
    return null;
  }
  const selectsSingleLog = options.logId !== undefined || options.step !== undefined;
  const slices =
    options.tail !== undefined || options.grep !== undefined || options.context !== undefined;
  if (slices && !selectsSingleLog) {
    writeError('--tail, --grep, and --context require --log-id or --step.');
    return null;
  }
  if (options.context !== undefined && options.grep === undefined) {
    writeError('--context requires --grep.');
    return null;
  }
  const tail = parseOptionalCount(options.tail, '--tail');
  if (tail === null) return null;
  const contextLines = parseOptionalCount(options.context, '--context');
  if (contextLines === null) return null;
  let grep: RegExp | undefined;
  if (options.grep !== undefined) {
    try {
      grep = new RegExp(options.grep);
    } catch {
      writeError(`Invalid --grep "${options.grep}"; expected a valid regular expression.`);
      return null;
    }
  }
  return { tail, contextLines: contextLines ?? 0, grep };
}

// Resolves --step to a log id via the timeline step names; writes the error
// and returns null when no unambiguous match exists.
function chooseStepLog(logs: PipelineLog[], step: string, runId: number): number | null {
  const needle = step.toLowerCase();
  const matches = logs.filter((l) => l.step?.toLowerCase().includes(needle));
  const exact = matches.filter((l) => l.step?.toLowerCase() === needle);
  const chosen = exact.length === 1 ? exact : matches;
  if (chosen.length === 0) {
    writeError(`No log matches step "${step}" in run ${runId}.`);
    return null;
  }
  if (chosen.length > 1) {
    const candidates = chosen.map((l) => `${l.id} (${l.step})`).join(', ');
    writeError(`Step "${step}" matches multiple logs: ${candidates}. Be more specific or use --log-id.`);
    return null;
  }
  return chosen[0].id;
}

// Returns the selected log id, undefined when neither --log-id nor --step was
// given, or null after writing an error.
async function resolveRequestedLogId(
  resolved: { context: AzdoContext; cred: AuthCredential },
  runId: number,
  options: LogsOptions,
): Promise<number | undefined | null> {
  if (options.logId !== undefined) {
    const parsed = parsePositiveId(options.logId);
    if (parsed === null) {
      writeError(`Invalid --log-id "${options.logId}"; expected a positive integer.`);
      return null;
    }
    return parsed;
  }
  if (options.step === undefined) {
    return undefined;
  }
  // Resolve the log id from the step/job name — ids shift when jobs are
  // skipped, so names are the stable selector.
  const allLogs = await getRunLogs(resolved.context, resolved.cred, runId);
  return chooseStepLog(allLogs, options.step, runId);
}

function printSingleLog(content: string, filters: LogFilterValues): void {
  if (filters.grep !== undefined || filters.tail !== undefined) {
    const lines = filterLogLines(content, filters.grep, filters.tail, filters.contextLines);
    if (lines.length > 0) {
      process.stdout.write(`${lines.join('\n')}\n`);
    }
    return;
  }
  process.stdout.write(content.endsWith('\n') ? content : `${content}\n`);
}

function createPipelineLogsCommand(): Command {
  const command = new Command('logs');
  command
    .description('List a pipeline run\'s logs, or print a specific log with --log-id')
    .argument('<run_id>', 'pipeline run id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--log-id <id>', 'print the content of this log id')
    .option('--step <name>', 'print the log of the step/job matching this name (case-insensitive substring)')
    .option('--tail <n>', 'with --log-id/--step, print only the last N lines')
    .option('--grep <pattern>', 'with --log-id/--step, print only lines matching this regular expression')
    .option('--context <n>', 'with --grep, also print N lines around each match (grep -C)')
    .option('--json', 'output JSON')
    .action(async (runIdRaw: string, options: LogsOptions) => {
      validateOrgProjectPair(options);
      const runId = parsePositiveId(runIdRaw);
      if (runId === null) {
        writeError(`Invalid run id "${runIdRaw}"; expected a positive integer.`);
        return;
      }
      const filters = parseLogFilters(options);
      if (filters === null) {
        return;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const logId = await resolveRequestedLogId(resolved, runId, options);
        if (logId === null) {
          return;
        }
        if (logId !== undefined) {
          const content = await getRunLog(resolved.context, resolved.cred, runId, logId);
          printSingleLog(content, filters);
          return;
        }
        const logs = await getRunLogs(resolved.context, resolved.cred, runId);
        if (options.json) {
          process.stdout.write(`${JSON.stringify(logs, null, 2)}\n`);
          return;
        }
        if (logs.length === 0) {
          process.stdout.write(`No logs found for run ${runId}.\n`);
          return;
        }
        const rows = logs.map((l) => [
          String(l.id),
          l.createdOn ?? '—',
          l.lineCount == null ? '' : `${l.lineCount} lines`,
          l.step ?? '',
        ]);
        process.stdout.write(`${formatTable(rows, new Set([0]))}\n`);
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline tests <run_id>
// ---------------------------------------------------------------------------

function createPipelineTestsCommand(): Command {
  const command = new Command('tests');
  command
    .description('Show a run\'s test results: summary plus failing tests by name (no log grepping needed)')
    .argument('<run_id>', 'pipeline run id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--failed', 'list only the failing tests')
    .option('--json', 'output JSON')
    .action(async (runIdRaw: string, options: PipelineCommonOptions & { failed?: boolean }) => {
      validateOrgProjectPair(options);
      const runId = parsePositiveId(runIdRaw);
      if (runId === null) {
        writeError(`Invalid run id "${runIdRaw}"; expected a positive integer.`);
        return;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const summary = await getTestSummary(resolved.context, resolved.cred, runId);
        const failedTests =
          summary.failed > 0 ? await getFailedTests(resolved.context, resolved.cred, runId) : [];
        if (options.json) {
          process.stdout.write(`${JSON.stringify({ ...summary, failedTests }, null, 2)}\n`);
          return;
        }
        if (!summary.present) {
          process.stdout.write(`No test results published for run ${runId}.\n`);
          return;
        }
        if (!options.failed) {
          process.stdout.write(`Run #${runId}: ${summary.failed} failing of ${summary.total} tests\n`);
        }
        if (failedTests.length > 0) {
          process.stdout.write(`${failedTests.map(failedTestRow).join('\n')}\n`);
        } else if (options.failed) {
          process.stdout.write('No failing tests.\n');
        }
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

// ---------------------------------------------------------------------------
// pipeline start <def_id>
// ---------------------------------------------------------------------------

function parseParameters(values: string[] | undefined): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const entry of values ?? []) {
    const eq = entry.indexOf('=');
    if (eq <= 0) {
      return null;
    }
    const key = entry.slice(0, eq);
    const value = entry.slice(eq + 1);
    result[key] = value;
  }
  return result;
}

function collectParameter(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function createPipelineStartCommand(): Command {
  const command = new Command('start');
  command
    .description('Queue a new run of a pipeline definition')
    .argument('<def_id>', 'pipeline definition id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--branch <branch>', 'branch to run against (default: pipeline default branch)')
    .option('--parameter <key=value>', 'template parameter (repeatable)', collectParameter, [])
    .option('--json', 'output JSON')
    .action(async (defIdRaw: string, options: PipelineCommonOptions & { branch?: string; parameter?: string[] }) => {
      validateOrgProjectPair(options);
      const defId = parsePositiveId(defIdRaw);
      if (defId === null) {
        writeError(`Invalid definition id "${defIdRaw}"; expected a positive integer.`);
        return;
      }
      const parameters = parseParameters(options.parameter);
      if (parameters === null) {
        writeError('Invalid --parameter; expected key=value.');
        return;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        const result = await runPipeline(resolved.context, resolved.cred, defId, {
          branch: options.branch,
          parameters,
        });
        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }
        process.stdout.write(`Queued run #${result.id} [${result.state}]\n${result.webUrl ?? '—'}\n`);
      } catch (err) {
        handlePipelineError(err, context);
      }
    });
  return command;
}

export function createPipelineCommand(): Command {
  const command = new Command('pipeline');
  command.description('Manage Azure DevOps pipelines');
  command.addCommand(createPipelineListCommand());
  command.addCommand(createPipelineGetRunsCommand());
  command.addCommand(createPipelineWaitCommand());
  command.addCommand(createPipelineGetRunDetailCommand());
  command.addCommand(createPipelineLogsCommand());
  command.addCommand(createPipelineTestsCommand());
  command.addCommand(createPipelineStartCommand());
  return command;
}
