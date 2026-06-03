import { Command } from 'commander';
import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import type {
  PipelineRunDetail,
  PipelineRunSummary,
  PipelineWaitResult,
} from '../types/pipeline.js';
import {
  getBuildStatus,
  getPipelineDefinitions,
  getPipelineRuns,
  getRunDetail,
  getRunLog,
  getRunLogs,
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
  writeError(error.message);
}

// Parses a positive-integer id argument (definition or run id). Returns null on
// any invalid input — mirrors the --pr-number validation in pr.ts.
function parsePositiveId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = parsePositiveId(raw);
  return n;
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
  return [String(run.id), `[${status}]`, run.createdDate ?? '—', formatBranchName(run.sourceBranch)];
}

function createPipelineGetRunsCommand(): Command {
  const command = new Command('get-runs');
  command
    .description('List recent runs for a pipeline definition (newest first)')
    .argument('<def_id>', 'pipeline definition id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--limit <n>', 'maximum number of runs to show (default 10)')
    .option('--branch <branch>', 'only show runs for this source branch')
    .option('--json', 'output JSON')
    .action(async (defIdRaw: string, options: PipelineCommonOptions & { limit?: string; branch?: string }) => {
      validateOrgProjectPair(options);
      const defId = parsePositiveId(defIdRaw);
      if (defId === null) {
        writeError(`Invalid definition id "${defIdRaw}"; expected a positive integer.`);
        return;
      }
      let limit = 10;
      if (options.limit !== undefined) {
        const parsed = parseLimit(options.limit);
        if (parsed === null) {
          writeError(`Invalid --limit "${options.limit}"; expected a positive integer.`);
          return;
        }
        limit = parsed;
      }
      let context: AzdoContext | undefined;
      try {
        const resolved = await resolvePipelineContext(options);
        context = resolved.context;
        let runs = await getPipelineRuns(resolved.context, resolved.cred, defId);
        if (options.branch) {
          const target = options.branch.startsWith('refs/') ? options.branch : `refs/heads/${options.branch}`;
          runs = runs.filter((r) => r.sourceBranch === target || formatBranchName(r.sourceBranch) === options.branch);
        }
        runs = runs.slice(0, limit);
        if (options.json) {
          process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`);
          return;
        }
        if (runs.length === 0) {
          process.stdout.write(`No runs found for pipeline ${defId}.\n`);
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
      const timeoutSec = options.timeout !== undefined ? Number(options.timeout) : 1800;
      const pollSec = options.pollInterval !== undefined ? Number(options.pollInterval) : 5;
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

function formatRunDetail(detail: PipelineRunDetail): string {
  const lines: string[] = [];
  const status = detail.result ? `${detail.state}/${detail.result}` : detail.state;
  lines.push(`Run #${detail.id} [${status}]${detail.name ? ` ${detail.name}` : ''}`);
  lines.push(`Started: ${detail.createdDate ?? '—'}    Finished: ${detail.finishedDate ?? '—'}`);
  lines.push(`Branch: ${formatBranchName(detail.sourceBranch)}    Commit: ${detail.sourceCommit ?? 'unavailable'}`);
  if (detail.webUrl) lines.push(`Link: ${detail.webUrl}`);

  lines.push('', 'Stages:');
  if (!detail.errorsAvailable) {
    lines.push('  unavailable');
  } else if (detail.stages.length === 0) {
    lines.push('  (none)');
  } else {
    for (const stage of detail.stages) {
      lines.push(`  - ${stage.name} [${stage.result ?? stage.state}]`);
    }
  }

  lines.push('', 'Errors:');
  if (!detail.errorsAvailable) {
    lines.push('  unavailable');
  } else if (detail.errors.length === 0) {
    lines.push('  (none)');
  } else {
    for (const error of detail.errors) {
      lines.push(`  - ${error.source ? `[${error.source}] ` : ''}${error.message}`);
    }
  }

  lines.push('', 'Tests:');
  if (!detail.testsAvailable) {
    lines.push('  unavailable');
  } else if (!detail.tests.present) {
    lines.push('  no tests present');
  } else {
    lines.push(`  ${detail.tests.failed} failing of ${detail.tests.total}`);
  }

  return lines.join('\n');
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

function createPipelineLogsCommand(): Command {
  const command = new Command('logs');
  command
    .description('List a pipeline run\'s logs, or print a specific log with --log-id')
    .argument('<run_id>', 'pipeline run id')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--log-id <id>', 'print the content of this log id')
    .option('--json', 'output JSON')
    .action(async (runIdRaw: string, options: PipelineCommonOptions & { logId?: string }) => {
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
        if (options.logId !== undefined) {
          const logId = parsePositiveId(options.logId);
          if (logId === null) {
            writeError(`Invalid --log-id "${options.logId}"; expected a positive integer.`);
            return;
          }
          const content = await getRunLog(resolved.context, resolved.cred, runId, logId);
          process.stdout.write(content.endsWith('\n') ? content : `${content}\n`);
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
          l.lineCount != null ? `${l.lineCount} lines` : '',
        ]);
        process.stdout.write(`${formatTable(rows, new Set([0]))}\n`);
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
  command.addCommand(createPipelineStartCommand());
  return command;
}
