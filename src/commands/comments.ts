import { Command } from 'commander';
import type { AzdoContext, WorkItemComment, WorkItemCommentsResult } from '../types/work-item.js';
import { addWorkItemComment, listWorkItemComments } from '../services/azdo-client.js';
import { requirePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { handleCommandError, parseWorkItemId, validateOrgProjectPair } from '../services/command-helpers.js';
import { toMarkdown } from '../services/md-convert.js';

interface CommentCommandOptions {
  org?: string;
  project?: string;
  json?: boolean;
  markdown?: boolean;
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
        const credential = await requirePat(context.org);
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
        const credential = await requirePat(context.org);
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

export function createCommentsCommand(): Command {
  const command = new Command('comments');
  command.description('Manage Azure DevOps work item comments');
  command.addCommand(createCommentsListCommand());
  command.addCommand(createCommentsAddCommand());
  return command;
}
