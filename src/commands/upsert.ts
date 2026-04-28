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
import { requirePat } from '../services/auth.js';
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
  type?: string;
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
    fail('Title is required when creating a work item.');
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
  process.stdout.write(`${verb} ${result.workItemType} #${result.id}${suffix}\n`);
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

function resolveCreateType(id: number | undefined, options: UpsertOptions): string {
  if (options.type === undefined) {
    return 'Task';
  }

  if (id !== undefined) {
    fail('--type can only be used when creating a work item.');
  }

  const trimmedType = options.type.trim();
  if (trimmedType === '') {
    fail('--type must be a non-empty work item type.');
  }

  return trimmedType;
}

function buildUpsertResult(
  action: 'created' | 'updated',
  writeResult: WriteResult,
  fields: ParsedField[],
  fallbackWorkItemType: string,
): UpsertResult {
  const appliedFields = buildAppliedFields(fields);
  const workItemType = writeResult.fields['System.WorkItemType'];
  return {
    action,
    id: writeResult.id,
    workItemType: typeof workItemType === 'string' && workItemType.trim() !== ''
      ? workItemType
      : fallbackWorkItemType,
    fields: appliedFields,
  };
}

function isUpdateWriteError(err: Error): boolean {
  return (
    err.message === 'AUTH_FAILED' ||
    err.message === 'PERMISSION_DENIED' ||
    err.message.startsWith('NOT_FOUND') ||
    err.message === 'NETWORK_ERROR' ||
    err.message.startsWith('BAD_REQUEST:') ||
    err.message.startsWith('UPDATE_REJECTED:')
  );
}

function isCreateWriteError(err: Error): boolean {
  return (
    err.message === 'AUTH_FAILED' ||
    err.message === 'PERMISSION_DENIED' ||
    err.message === 'NETWORK_ERROR' ||
    err.message.startsWith('BAD_REQUEST:') ||
    err.message.startsWith('HTTP_')
  );
}

function handleUpsertError(err: unknown, id: number | undefined, context: AzdoContext | undefined): never | void {
  if (!(err instanceof Error)) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }

  if (id === undefined && err.message.startsWith('CREATE_REJECTED:')) {
    process.stderr.write(`Error: ${formatCreateError(err)}\n`);
    process.exit(1);
  }

  if (id !== undefined && isUpdateWriteError(err)) {
    handleCommandError(err, id, context, 'write');
    return;
  }

  if (id === undefined && isCreateWriteError(err)) {
    handleCommandError(err, 0, context, 'write');
    return;
  }

  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
}

export function createUpsertCommand(): Command {
  const command = new Command('upsert');

  command
    .description('Create or update a work item from a markdown document')
    .argument('[id]', 'work item ID to update; omit to create a new work item')
    .option('--content <markdown>', 'task document content')
    .option('--file <path>', 'read task document from file')
    .option('--type <workItemType>', 'create mode work item type (defaults to Task)')
    .option('--json', 'output result as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (idStr: string | undefined, options: UpsertOptions) => {
      validateOrgProjectPair(options);

      const id = idStr === undefined ? undefined : parseWorkItemId(idStr);
      const { content, sourceFile } = loadSourceContent(options);
      const createType = resolveCreateType(id, options);

      let context: AzdoContext | undefined;

      try {
        context = resolveContext(options);
        const document = parseTaskDocument(content);
        const action = id === undefined ? 'created' : 'updated';

        if (action === 'created') {
          ensureTitleForCreate(document.fields);
        }

        const operations = toPatchOperations(document.fields, action);
        const credential = await requirePat(context.org);
        let writeResult: WriteResult;
        if (action === 'created') {
          writeResult = await createWorkItem(context, createType, credential, operations);
        } else {
          if (id === undefined) {
            fail('Work item ID is required for updates.');
          }
          writeResult = await applyWorkItemPatch(context, id, credential, operations);
        }
        const result = buildUpsertResult(
          action,
          writeResult,
          document.fields,
          action === 'created' ? createType : 'Work item',
        );
        writeSuccess(result, options);
        cleanupSourceFile(sourceFile);
      } catch (err: unknown) {
        handleUpsertError(err, id, context);
      }
    });

  return command;
}
