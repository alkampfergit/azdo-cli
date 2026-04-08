import { Command } from 'commander';
import type { AzdoContext, WorkItem, WorkItemAttachment } from '../types/work-item.js';
import { getWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { loadConfig } from '../services/config-store.js';
import { toMarkdown } from '../services/md-convert.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

export function parseRequestedFields(raw?: string | string[]): string[] | undefined {
  if (raw === undefined) return undefined;

  const source = Array.isArray(raw) ? raw : [raw];
  const tokens = source
    .flatMap((entry) => entry.split(/[,\s]+/))
    .map((field) => field.trim())
    .filter((field) => field.length > 0);

  if (tokens.length === 0) return undefined;

  return Array.from(new Set(tokens));
}

export function stripHtml(html: string): string {
  let text = html;

  // Replace headings with labeled newlines
  text = text.replaceAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n--- $1 ---\n');

  // Replace block-level and line-breaking tags with newlines first
  text = text.replaceAll(/<br\s*\/?>/gi, '\n');
  text = text.replaceAll(/<\/?(p|div)>/gi, '\n');
  text = text.replaceAll(/<li>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replaceAll(/<[^>]*>/g, '');

  // Decode common HTML entities
  text = text.replaceAll('&amp;', '&');
  text = text.replaceAll('&lt;', '<');
  text = text.replaceAll('&gt;', '>');
  text = text.replaceAll('&quot;', '"');
  text = text.replaceAll('&#39;', "'");
  text = text.replaceAll('&nbsp;', ' ');

  // Collapse multiple consecutive newlines into double newline
  text = text.replaceAll(/\n{3,}/g, '\n\n');

  return text.trim();
}

function convertRichText(html: string | null, markdown: boolean): string {
  if (!html) return '';
  return markdown ? toMarkdown(html) : stripHtml(html);
}

export function formatMarkdownField(fieldLabel: string, value: string): string {
  if (value.includes('\n')) {
    return `${fieldLabel}:\n${value}`;
  }
  return `${fieldLabel}: ${value}`;
}

function formatExtraFields(extraFields: Record<string, string>, markdown: boolean): string[] {
  return Object.entries(extraFields).map(([refName, value]) => {
    const fieldLabel = refName.includes('.') ? refName.split('.').pop()! : refName;
    if (markdown) {
      const displayValue = toMarkdown(value);
      return formatMarkdownField(fieldLabel, displayValue);
    }
    return formatMarkdownField(fieldLabel, value);
  });
}

function summarizeDescription(text: string, label: (name: string) => string, markdown: boolean): string[] {
  const descLines = text.split('\n').filter((l) => l.trim() !== '');
  const firstThree = descLines.slice(0, 3);
  const suffix = descLines.length > 3 ? '\n...' : '';
  const content = `${firstThree.join('\n')}${suffix}`;
  if (markdown) {
    return [formatMarkdownField('Description', content)];
  }
  return [`${label('Description:')}${content}`];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatAttachments(attachments: WorkItemAttachment[], short: boolean): string[] {
  if (short) {
    return [`Attachments: ${attachments.length}`];
  }
  const lines = ['', 'Attachments:'];
  for (const att of attachments) {
    lines.push(`  ${att.name} (${formatFileSize(att.size)})`);
  }
  return lines;
}

export function formatWorkItem(workItem: WorkItem, short: boolean, markdown: boolean = false): string {
  const label = (name: string): string => name.padEnd(13);
  const lines: string[] = [
    `${label('ID:')}${workItem.id}`,
    `${label('Type:')}${workItem.type}`,
    `${label('Title:')}${workItem.title}`,
    `${label('State:')}${workItem.state}`,
    `${label('Assigned To:')}${workItem.assignedTo ?? 'Unassigned'}`,
  ];

  if (!short) {
    lines.push(
      `${label('Area:')}${workItem.areaPath}`,
      `${label('Iteration:')}${workItem.iterationPath}`,
    );
  }

  lines.push(`${label('URL:')}${workItem.url}`);

  if (workItem.extraFields) {
    lines.push(...formatExtraFields(workItem.extraFields, markdown));
  }

  lines.push('');

  const descriptionText = convertRichText(workItem.description, markdown);

  if (short) {
    lines.push(...summarizeDescription(descriptionText, label, markdown));
  } else {
    lines.push('Description:', descriptionText);
  }

  if (workItem.attachments) {
    lines.push(...formatAttachments(workItem.attachments, short));
  }

  return lines.join('\n');
}

export function createGetItemCommand(): Command {
  const command = new Command('get-item');

  command
    .description('Retrieve an Azure DevOps work item by ID')
    .argument('<id>', 'work item ID')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--short', 'show abbreviated output')
    .option('--fields <fields>', 'comma-separated additional field reference names')
    .option('--markdown', 'convert rich text fields to markdown')
    .action(
      async (
        idStr: string,
        options: { org?: string; project?: string; short?: boolean; fields?: string; markdown?: boolean },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const fieldsList = options.fields === undefined
            ? parseRequestedFields(loadConfig().fields)
            : parseRequestedFields(options.fields);

          const workItem = await getWorkItem(context, id, credential.pat, fieldsList);

          const markdownEnabled = options.markdown ?? loadConfig().markdown ?? false;
          const output = formatWorkItem(workItem, options.short ?? false, markdownEnabled);
          process.stdout.write(output + '\n');
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read', false);
        }
      },
    );

  return command;
}
