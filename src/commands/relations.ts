import { Command } from 'commander';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import {
  getWorkItemRelationTypes,
  addWorkItemRelation,
  removeWorkItemRelation,
  listWorkItemRelations,
} from '../services/relations-client.js';
import type { WorkItemRelationType, WorkItemRelation } from '../types/relations.js';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatRelationTypes(types: WorkItemRelationType[]): string {
  if (types.length === 0) return 'No work item relation types found.';
  const nameWidth = Math.max(...types.map((t) => t.name.length), 4);
  const lines = ['Available work item relation types:', ''];
  for (const t of types) {
    lines.push(`${t.name.padEnd(nameWidth + 2)}${t.referenceName}`);
  }
  return lines.join('\n');
}

function formatRelationsList(workItemId: number, relations: WorkItemRelation[]): string {
  if (relations.length === 0) return `Work item #${workItemId} has no relations.`;
  const typeWidth = Math.max(...relations.map((r) => r.relName.length), 4) + 2;
  const idWidth = Math.max(...relations.map((r) => String(r.targetId).length), 4) + 1;
  const lines = [`Relations for work item #${workItemId}:`, ''];
  for (const r of relations) {
    const typeLabel = `[${r.relName}]`.padEnd(typeWidth);
    const idLabel = `#${r.targetId}`.padEnd(idWidth);
    lines.push(`${typeLabel}  ${idLabel}  ${r.targetTitle ?? '(unknown)'}`);
  }
  return lines.join('\n');
}

function handleRelationError(err: unknown, id1?: number): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'SELF_RELATION') {
    process.stderr.write(`Error: cannot relate a work item to itself (#${id1}).\n`);
  } else if (msg.startsWith('UNKNOWN_RELATION_TYPE:')) {
    const name = msg.replace('UNKNOWN_RELATION_TYPE:', '');
    process.stderr.write(
      `Error: unknown relation type "${name}". Run 'azdo relations types' to see valid names.\n`,
    );
  } else if (msg.startsWith('NOT_FOUND')) {
    const target = id1 !== undefined ? id1 : 'unknown';
    process.stderr.write(`Error: work item #${target} not found.\n`);
  } else if (msg === 'AUTH_FAILED') {
    process.stderr.write(
      `Error: authentication failed. Check your PAT has Work Items → Read & Write scope.\n`,
    );
  } else {
    process.stderr.write(`Error: ${msg}\n`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createRelationsCommand(): Command {
  const relations = new Command('relations').description('Manage work item relations');

  // ── types ──────────────────────────────────────────────────────────────
  relations
    .command('types')
    .description('List all available work item relation types')
    .option('--json', 'Output as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (opts: { json?: boolean; org?: string; project?: string }) => {
      try {
        const context = resolveContext(opts);
        const cred = await requireAuthCredential(context.org);
        const types = await getWorkItemRelationTypes(context, cred);
        if (opts.json) {
          process.stdout.write(JSON.stringify(types, null, 2) + '\n');
        } else {
          process.stdout.write(formatRelationTypes(types) + '\n');
        }
      } catch (err) {
        handleRelationError(err);
      }
    });

  // ── add ────────────────────────────────────────────────────────────────
  relations
    .command('add <type> <id1> <id2>')
    .description('Add a directed relation from work item <id1> to <id2>')
    .option('--json', 'Output result as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (type: string, id1Str: string, id2Str: string, opts: { json?: boolean; org?: string; project?: string }) => {
      const id1 = Number(id1Str);
      const id2 = Number(id2Str);
      if (!Number.isInteger(id1) || id1 <= 0 || !Number.isInteger(id2) || id2 <= 0) {
        process.stderr.write('Error: id1 and id2 must be positive integers.\n');
        process.exit(1);
      }
      try {
        const context = resolveContext(opts);
        const cred = await requireAuthCredential(context.org);
        const result = await addWorkItemRelation(context, cred, type, id1, id2);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else if (result.status === 'already_exists') {
          process.stdout.write(`Relation already exists: #${id1} --[${result.type}]--> #${id2}\n`);
        } else {
          process.stdout.write(`Added relation: #${id1} --[${result.type}]--> #${id2}\n`);
        }
      } catch (err) {
        handleRelationError(err, id1);
      }
    });

  // ── remove ─────────────────────────────────────────────────────────────
  relations
    .command('remove <type> <id1> <id2>')
    .description('Remove a directed relation of <type> from work item <id1> to <id2>')
    .option('--json', 'Output result as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (type: string, id1Str: string, id2Str: string, opts: { json?: boolean; org?: string; project?: string }) => {
      const id1 = Number(id1Str);
      const id2 = Number(id2Str);
      if (!Number.isInteger(id1) || id1 <= 0 || !Number.isInteger(id2) || id2 <= 0) {
        process.stderr.write('Error: id1 and id2 must be positive integers.\n');
        process.exit(1);
      }
      try {
        const context = resolveContext(opts);
        const cred = await requireAuthCredential(context.org);
        const result = await removeWorkItemRelation(context, cred, type, id1, id2);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else if (result.status === 'not_found') {
          process.stdout.write(`No relation of type '${result.type}' found between #${id1} and #${id2}\n`);
        } else {
          process.stdout.write(`Removed relation: #${id1} --[${result.type}]--> #${id2}\n`);
        }
      } catch (err) {
        handleRelationError(err, id1);
      }
    });

  // ── list ───────────────────────────────────────────────────────────────
  relations
    .command('list <id>')
    .description('List all work item link relations on a work item')
    .option('--json', 'Output as JSON')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(async (idStr: string, opts: { json?: boolean; org?: string; project?: string }) => {
      const id = Number(idStr);
      if (!Number.isInteger(id) || id <= 0) {
        process.stderr.write('Error: id must be a positive integer.\n');
        process.exit(1);
      }
      try {
        const context = resolveContext(opts);
        const cred = await requireAuthCredential(context.org);
        const result = await listWorkItemRelations(context, cred, id);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stdout.write(formatRelationsList(result.workItemId, result.relations) + '\n');
        }
      } catch (err) {
        handleRelationError(err, id);
      }
    });

  return relations;
}
