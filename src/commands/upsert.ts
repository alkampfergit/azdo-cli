import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { Command } from 'commander';
import type {
  AzdoContext,
  JsonPatchOperation,
  ParsedField,
  UpsertResult,
  WriteResult,
} from '../types/work-item.js';
import { applyWorkItemPatch, createWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import {
  formatCreateError,
  handleCommandError,
  parseWorkItemId,
  validateOrgProjectPair,
  validateSource,
} from '../services/command-helpers.js';
import { parseTaskDocument } from '../services/task-document.js';

interface UpsertOptions {
  content?: string;
  file?: string;
  json?: boolean;
  org?: string;
  project?: string;
}

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function loadSourceContent(options: UpsertOptions): { content: string; sourceFile?: string } {
  validateSource(options);

  if (options.content !== undefined) {
    return { content: options.content };
  }

  const filePath = options.file!;
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }

  try {
    return {
      content: readFileSync(filePath, 'utf-8'),
      sourceFile: filePath,
    };
  } catch {
    fail(`Cannot read file: ${filePath}`);
  }
}

function toPatchOperations(fields: ParsedField[], action: 'created' | 'updated'): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = [];

  for (const field of fields) {
    if (field.op === 'clear') {
      if (action === 'updated') {
        operations.push({ op: 'remove', path: `/fields/${field.refName}` });
      }
      continue;
    }

    operations.push({ op: 'add', path: `/fields/${field.refName}`, value: field.value ?? '' });

    if (field.kind === 'rich-text') {
      operations.push({
        op: 'add',
        path: `/multilineFieldsFormat/${field.refName}`,
        value: 'Markdown',
      });
    }
  }

  return operations;
}

function buildAppliedFields(fields: ParsedField[]): Record<string, unknown> {
  const applied: Record<string, unknown> = {};
  for (const field of fields) {
    applied[field.refName] = field.value;
  }
  return applied;
}

function ensureTitleForCreate(fields: ParsedField[]): void {
  const titleField = fields.find((field) => field.refName === 'System.Title');
  if (!titleField || titleField.op === 'clear' || titleField.value === null || titleField.value.trim() === '') {
    fail('Title is required when creating a task.');
  }
}

function writeSuccess(result: UpsertResult, options: UpsertOptions): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const verb = result.action === 'created' ? 'Created' : 'Updated';
  const fields = Object.keys(result.fields).join(', ');
  const suffix = fields ? ` (${fields})` : '';
  process.stdout.write(`${verb} task #${result.id}${suffix}\n`);
}

function cleanupSourceFile(sourceFile: string | undefined): void {
  if (!sourceFile) {
    return;
  }

  try {
    unlinkSync(sourceFile);
  } catch {
    process.stderr.write(`Warning: upsert succeeded but could not delete source file: ${sourceFile}\n`);
  }
}

function buildUpsertResult(action: 'created' | 'updated', writeResult: WriteResult, fields: ParsedField[]): UpsertResult {
  const appliedFields = buildAppliedFields(fields);
  return {
    action,
    id: writeResult.id,
    fields: appliedFields,
  };
}

export function createUpsertCommand(): Command {
  const command = new Command('upsert');

  command
    .description('Create or update a Task from a markdown document')
    .argument('[id]', 'work item ID to update; omit to create a new Task')
    .option('--content <markdown>', 'task document content')
    .option('--file <path>', 'read task document from file')
    .option('--json', 'output result as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (idStr: string | undefined, options: UpsertOptions) => {
      validateOrgProjectPair(options);

      const id = idStr !== undefined ? parseWorkItemId(idStr) : undefined;
      const { content, sourceFile } = loadSourceContent(options);

      let context: AzdoContext | undefined;

      try {
        const document = parseTaskDocument(content);
        const action = id === undefined ? 'created' : 'updated';

        if (action === 'created') {
          ensureTitleForCreate(document.fields);
        }

        const operations = toPatchOperations(document.fields, action);
        context = resolveContext(options);
        const credential = await resolvePat();

        const writeResult = action === 'created'
          ? await createWorkItem(context, 'Task', credential.pat, operations)
          : await applyWorkItemPatch(context, id!, credential.pat, operations);

        const result = buildUpsertResult(action, writeResult, document.fields);
        writeSuccess(result, options);
        cleanupSourceFile(sourceFile);
      } catch (err: unknown) {
        if (id === undefined && err instanceof Error && err.message.startsWith('CREATE_REJECTED:')) {
          process.stderr.write(`Error: ${formatCreateError(err)}\n`);
          process.exit(1);
        }

        if (id !== undefined && err instanceof Error && (
          err.message === 'AUTH_FAILED' ||
          err.message === 'PERMISSION_DENIED' ||
          err.message === 'NOT_FOUND' ||
          err.message === 'NETWORK_ERROR' ||
          err.message.startsWith('BAD_REQUEST:') ||
          err.message.startsWith('UPDATE_REJECTED:')
        )) {
          handleCommandError(err, id, context, 'write');
          return;
        }

        if (id === undefined && err instanceof Error && (
          err.message === 'AUTH_FAILED' ||
          err.message === 'PERMISSION_DENIED' ||
          err.message === 'NETWORK_ERROR' ||
          err.message.startsWith('BAD_REQUEST:') ||
          err.message.startsWith('HTTP_')
        )) {
          handleCommandError(err, 0, context, 'write');
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  return command;
}
