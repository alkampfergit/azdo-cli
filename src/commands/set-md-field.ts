import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { updateWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function resolveContent(
  inlineContent: string | undefined,
  options: { file?: string },
): string | null {
  if (inlineContent && options.file) {
    fail('Cannot specify both inline content and --file.');
  }

  if (options.file) {
    return readFileContent(options.file);
  }

  if (inlineContent) {
    return inlineContent;
  }

  return null;
}

function readFileContent(filePath: string): string {
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    fail(`Cannot read file: ${filePath}`);
  }
}

async function readStdinContent(): Promise<string> {
  if (process.stdin.isTTY) {
    fail(
      'No content provided. Pass markdown content as the third argument, use --file, or pipe via stdin.',
    );
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const stdinContent = Buffer.concat(chunks).toString('utf-8').trimEnd();

  if (!stdinContent) {
    fail(
      'No content provided via stdin. Pipe markdown content or use inline content or --file.',
    );
  }

  return stdinContent;
}

function formatOutput(
  result: { id: number; rev: number; fieldName: string; fieldValue: string | null },
  options: { json?: boolean },
  field: string,
): void {
  if (options.json) {
    process.stdout.write(
      JSON.stringify({
        id: result.id,
        rev: result.rev,
        field: result.fieldName,
        value: result.fieldValue,
      }) + '\n',
    );
  } else {
    process.stdout.write(`Updated work item ${result.id}: ${field} set with markdown content\n`);
  }
}

export function createSetMdFieldCommand(): Command {
  const command = new Command('set-md-field');

  command
    .description('Set a work item field with markdown content')
    .argument('<id>', 'work item ID')
    .argument('<field>', 'field reference name (e.g., System.Description)')
    .argument('[content]', 'markdown content to set')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output result as JSON')
    .option('--file <path>', 'read markdown content from file')
    .action(
      async (
        idStr: string,
        field: string,
        inlineContent: string | undefined,
        options: { org?: string; project?: string; json?: boolean; file?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        const content = resolveContent(inlineContent, options) ?? await readStdinContent();
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;
        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const operations = [
            { op: 'add' as const, path: `/fields/${field}`, value: content },
            { op: 'add' as const, path: `/multilineFieldsFormat/${field}`, value: 'Markdown' },
          ];

          const result = await updateWorkItem(context, id, credential.pat, field, operations);
          formatOutput(result, options, field);
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
