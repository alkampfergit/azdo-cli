import { Command } from 'commander';
import type { AzdoContext, WorkItemComment, WorkItemCommentsResult } from '../types/work-item.js';
import {
  addWorkItemComment,
  deleteWorkItemComment,
  listWorkItemComments,
  updateWorkItemComment,
} from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import {
  handleCommandError,
  parseWorkItemId,
  readTextSource,
  validateOrgProjectPair,
} from '../services/command-helpers.js';
import { toMarkdown } from '../services/md-convert.js';

interface CommentCommandOptions {
  org?: string;
  project?: string;
  json?: boolean;
  markdown?: boolean;
  file?: string;
}

function writeError(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function formatCommentHeader(comment: WorkItemComment): string {
  const author = comment.author ?? 'Unknown';
  const timestamp = comment.modifiedAt ?? comment.createdAt ?? 'Unknown time';
  return `Comment #${comment.id} by ${author} at ${timestamp}`;
}

function formatComments(result: WorkItemCommentsResult, convertMarkdown: boolean): string {
  const lines = [`Comments for work item #${result.workItemId}`];

  for (const comment of result.comments) {
    const text = convertMarkdown ? toMarkdown(comment.text) : comment.text;
    lines.push('', formatCommentHeader(comment), text);
  }

  return lines.join('\n');
}

export function createCommentsListCommand(): Command {
  const command = new Command('list');

  command
    .description('List visible comments for a work item')
    .argument('<id>', 'work item ID')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .option('--markdown', 'convert HTML comment bodies to markdown')
    .action(async (idStr: string, options: CommentCommandOptions) => {
      validateOrgProjectPair(options);
      const id = parseWorkItemId(idStr);

      let context: AzdoContext | undefined;

      try {
        context = resolveContext(options);
        const credential = await requireAuthCredential(context.org);
        const result = await listWorkItemComments(context, id, credential);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (result.comments.length === 0) {
          process.stdout.write(`Work item #${id} has no comments.\n`);
          return;
        }

        process.stdout.write(`${formatComments(result, options.markdown === true)}\n`);
      } catch (err: unknown) {
        handleCommandError(err, id, context, 'read');
      }
    });

  return command;
}

export function createCommentsAddCommand(): Command {
  const command = new Command('add');

  command
    .description('Add a comment to a work item')
    .argument('<id>', 'work item ID')
    .argument('<text>', 'comment text')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .option('--markdown', 'post comment as markdown')
    .action(async (idStr: string, text: string, options: CommentCommandOptions) => {
      validateOrgProjectPair(options);
      const id = parseWorkItemId(idStr);

      if (text.trim() === '') {
        writeError('Comment text must be a non-empty string.');
      }

      let context: AzdoContext | undefined;

      try {
        context = resolveContext(options);
        const credential = await requireAuthCredential(context.org);
        const format = options.markdown === true ? 'markdown' : 'html';
        const result = await addWorkItemComment(context, id, credential, text, format);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        process.stdout.write(`Added comment #${result.commentId} to work item #${result.workItemId}\n`);
      } catch (err: unknown) {
        handleCommandError(err, id, context, 'write');
      }
    });

  return command;
}

function parseCommentId(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    writeError(`Invalid comment ID "${value}". Expected a positive integer.`);
  }
  return Number(value);
}

// Edit takes its text inline or from --file (`-` = stdin), never both. Exits
// before any request when the text is unusable.
function resolveEditText(inline: string | undefined, file: string | undefined): string {
  if (inline !== undefined && file !== undefined) {
    writeError('Cannot specify both inline text and --file.');
  }

  let body = inline;
  if (file !== undefined) {
    try {
      body = readTextSource(file);
    } catch (err: unknown) {
      writeError((err as Error).message);
    }
  }

  if (body === undefined || body.trim() === '') {
    writeError('Comment text must be a non-empty string. Pass the text inline or use --file <path>.');
  }
  return body;
}

// A 404 on a comment URL means the comment (or its work item) does not exist;
// say so instead of the generic "work item not found".
function handleCommentWriteError(
  err: unknown,
  id: number,
  commentId: number,
  context: AzdoContext | undefined,
): void {
  if (err instanceof Error && err.message.startsWith('NOT_FOUND')) {
    writeError(
      `Comment ${commentId} not found on work item ${id} in ${context?.org}/${context?.project}.`,
    );
  }
  handleCommandError(err, id, context, 'write');
}

export function createCommentsEditCommand(): Command {
  const command = new Command('edit');

  command
    .description('Edit an existing comment on a work item')
    .argument('<id>', 'work item ID')
    .argument('<commentId>', 'comment ID')
    .argument('[text]', 'new comment text (or use --file)')
    .option('--file <path>', 'read the new comment text from a file ("-" for stdin)')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .option('--markdown', 'post comment as markdown')
    .action(async (idStr: string, commentIdStr: string, text: string | undefined, options: CommentCommandOptions) => {
      validateOrgProjectPair(options);
      const id = parseWorkItemId(idStr);
      const commentId = parseCommentId(commentIdStr);
      const body = resolveEditText(text, options.file);

      let context: AzdoContext | undefined;

      try {
        context = resolveContext(options);
        const credential = await requireAuthCredential(context.org);
        const format = options.markdown === true ? 'markdown' : 'html';
        const result = await updateWorkItemComment(context, id, commentId, credential, body, format);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        process.stdout.write(`Updated comment #${result.commentId} on work item #${result.workItemId}\n`);
      } catch (err: unknown) {
        handleCommentWriteError(err, id, commentId, context);
      }
    });

  return command;
}

export function createCommentsDeleteCommand(): Command {
  const command = new Command('delete');

  command
    .description('Delete a comment from a work item (no confirmation prompt)')
    .argument('<id>', 'work item ID')
    .argument('<commentId>', 'comment ID')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .action(async (idStr: string, commentIdStr: string, options: CommentCommandOptions) => {
      validateOrgProjectPair(options);
      const id = parseWorkItemId(idStr);
      const commentId = parseCommentId(commentIdStr);

      let context: AzdoContext | undefined;

      try {
        context = resolveContext(options);
        const credential = await requireAuthCredential(context.org);
        const result = await deleteWorkItemComment(context, id, commentId, credential);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        process.stdout.write(`Deleted comment #${result.commentId} from work item #${result.workItemId}\n`);
      } catch (err: unknown) {
        handleCommentWriteError(err, id, commentId, context);
      }
    });

  return command;
}

export function createCommentsCommand(): Command {
  const command = new Command('comments');
  command.description('Manage Azure DevOps work item comments');
  command.addCommand(createCommentsListCommand());
  command.addCommand(createCommentsAddCommand());
  command.addCommand(createCommentsEditCommand());
  command.addCommand(createCommentsDeleteCommand());
  return command;
}
