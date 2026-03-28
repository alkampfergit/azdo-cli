/**
 * Integration tests — Upsert flow (create & update via task documents).
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Work items are created as **User Story** to validate multi-type support.
 * Each work item title describes the specific test being executed.
 *
 * Covered service / helper functions:
 *   parseTaskDocument  — parse YAML front-matter + markdown sections
 *   resolveFieldName   — alias resolution (title → System.Title, etc.)
 *   createWorkItem     — create a User Story from patch operations
 *   applyWorkItemPatch — update an existing work item from patch operations
 *   getWorkItem        — verify round-trip of created/updated items
 *   getWorkItemFieldValue — verify individual field values after upsert
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createWorkItem,
  getWorkItem,
  getWorkItemFieldValue,
} from '../../src/services/azdo-client.js';
import { parseTaskDocument, resolveFieldName } from '../../src/services/task-document.js';
import type { JsonPatchOperation, ParsedField } from '../../src/types/work-item.js';
import {
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Replicate the toPatchOperations logic from the upsert command. */
function toPatchOperations(fields: ParsedField[], action: 'created' | 'updated'): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  for (const field of fields) {
    if (field.op === 'clear') {
      if (action === 'updated') {
        ops.push({ op: 'remove', path: `/fields/${field.refName}` });
      }
      continue;
    }
    ops.push({ op: 'add', path: `/fields/${field.refName}`, value: field.value ?? '' });
    if (field.kind === 'rich-text') {
      ops.push({ op: 'add', path: `/multilineFieldsFormat/${field.refName}`, value: 'Markdown' });
    }
  }
  return ops;
}

/** Best-effort close for test cleanup. */
async function closeItem(id: number): Promise<void> {
  const context = makeContext();
  const pat = AZDO_PAT;
  for (const state of ['Done', 'Closed', 'Resolved', 'Removed']) {
    try {
      await applyWorkItemPatch(context, id, pat, [
        { op: 'add', path: '/fields/System.State', value: state },
      ]);
      return;
    } catch { /* try next */ }
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe.skipIf(SKIP_AZDO)('upsert integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const cleanupIds: number[] = [];

  afterAll(async () => {
    for (const id of cleanupIds) {
      await closeItem(id);
    }
  });

  // ── resolveFieldName ─────────────────────────────────────────────────────

  describe('resolveFieldName', () => {
    it('resolves "title" alias to System.Title', () => {
      expect(resolveFieldName('title')).toBe('System.Title');
    });

    it('resolves "description" alias to System.Description', () => {
      expect(resolveFieldName('description')).toBe('System.Description');
    });

    it('resolves "acceptance criteria" alias to Microsoft.VSTS.Common.AcceptanceCriteria', () => {
      expect(resolveFieldName('acceptance criteria')).toBe('Microsoft.VSTS.Common.AcceptanceCriteria');
    });

    it('resolves "priority" alias to Microsoft.VSTS.Common.Priority', () => {
      expect(resolveFieldName('priority')).toBe('Microsoft.VSTS.Common.Priority');
    });

    it('resolves "tags" alias to System.Tags', () => {
      expect(resolveFieldName('tags')).toBe('System.Tags');
    });

    it('passes through a fully-qualified reference name', () => {
      expect(resolveFieldName('System.AreaPath')).toBe('System.AreaPath');
    });

    it('returns null for an unknown alias without dots', () => {
      expect(resolveFieldName('nonexistent')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(resolveFieldName('')).toBeNull();
    });
  });

  // ── parseTaskDocument ────────────────────────────────────────────────────

  describe('parseTaskDocument', () => {
    it('parses a YAML front-matter with scalar fields', () => {
      const content = [
        '---',
        'title: Test User Story',
        'priority: 2',
        '---',
      ].join('\n');

      const doc = parseTaskDocument(content);
      expect(doc.fields).toHaveLength(2);
      expect(doc.fields[0]).toMatchObject({ refName: 'System.Title', value: 'Test User Story', op: 'set', kind: 'scalar' });
      expect(doc.fields[1]).toMatchObject({ refName: 'Microsoft.VSTS.Common.Priority', value: '2', op: 'set', kind: 'scalar' });
    });

    it('parses rich-text sections (Description and Acceptance Criteria)', () => {
      const content = [
        '## Description',
        '',
        'Story description here.',
        '',
        '## Acceptance Criteria',
        '',
        '- Criterion A',
        '- Criterion B',
      ].join('\n');

      const doc = parseTaskDocument(content);
      expect(doc.fields).toHaveLength(2);
      expect(doc.fields[0].refName).toBe('System.Description');
      expect(doc.fields[0].kind).toBe('rich-text');
      expect(doc.fields[0].value).toContain('Story description here.');
      expect(doc.fields[1].refName).toBe('Microsoft.VSTS.Common.AcceptanceCriteria');
      expect(doc.fields[1].value).toContain('Criterion A');
    });

    it('parses a combined front-matter + rich-text document', () => {
      const content = [
        '---',
        'title: Full Document Test',
        'priority: 1',
        '---',
        '',
        '## Description',
        '',
        'Full description.',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const fieldNames = doc.fields.map((f) => f.refName);
      expect(fieldNames).toContain('System.Title');
      expect(fieldNames).toContain('Microsoft.VSTS.Common.Priority');
      expect(fieldNames).toContain('System.Description');
    });

    it('treats null/empty/tilde values as clear operations', () => {
      const content = [
        '---',
        'title: Clear Test',
        'tags: ~',
        '---',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const tags = doc.fields.find((f) => f.refName === 'System.Tags');
      expect(tags).toBeDefined();
      expect(tags!.op).toBe('clear');
      expect(tags!.value).toBeNull();
    });

    it('throws on duplicate fields', () => {
      const content = [
        '---',
        'title: First',
        'title: Second',
        '---',
      ].join('\n');

      expect(() => parseTaskDocument(content)).toThrow('Duplicate field');
    });

    it('throws on malformed front-matter (missing closing ---)', () => {
      const content = '---\ntitle: Broken\n';
      expect(() => parseTaskDocument(content)).toThrow('Malformed YAML');
    });
  });

  // ── Create User Story via upsert flow ────────────────────────────────────

  describe('create User Story via upsert flow', () => {
    let storyId: number;

    it('creates a User Story from a parsed task document', async () => {
      const content = [
        '---',
        `title: "${testItemTitle('upsert: create User Story from task document')}"`,
        'priority: 2',
        '---',
        '',
        '## Description',
        '',
        'As a developer, I want to verify that the upsert flow creates a User Story',
        'with the correct fields set from a parsed task document.',
        '',
        '## Acceptance Criteria',
        '',
        '- User Story is created with correct title',
        '- Priority is set to 2',
        '- Description and Acceptance Criteria are populated',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const ops = toPatchOperations(doc.fields, 'created');
      const result = await createWorkItem(context, 'User Story', pat, ops);

      storyId = result.id;
      cleanupIds.push(storyId);

      expect(result.id).toBeGreaterThan(0);
      expect(result.fields['System.Title']).toContain('upsert: create User Story from task document');
    });

    it('created User Story has WorkItemType "User Story"', async () => {
      const item = await getWorkItem(context, storyId, pat);
      expect(item.type).toBe('User Story');
    });

    it('created User Story has priority 2', async () => {
      const value = await getWorkItemFieldValue(context, storyId, pat, 'Microsoft.VSTS.Common.Priority');
      expect(value).toBe('2');
    });

    it('created User Story has a non-empty description', async () => {
      const value = await getWorkItemFieldValue(context, storyId, pat, 'System.Description');
      expect(value).not.toBeNull();
      expect(value!).toContain('upsert flow creates a User Story');
    });

    it('created User Story has acceptance criteria', async () => {
      const value = await getWorkItemFieldValue(context, storyId, pat, 'Microsoft.VSTS.Common.AcceptanceCriteria');
      expect(value).not.toBeNull();
      expect(value!).toContain('Priority is set to 2');
    });
  });

  // ── Update User Story via upsert flow ────────────────────────────────────

  describe('update User Story via upsert flow', () => {
    let storyId: number;

    beforeAll(async () => {
      const result = await createWorkItem(context, 'User Story', pat, [
        { op: 'add', path: '/fields/System.Title', value: testItemTitle('upsert: update target — initial state') },
        { op: 'add', path: '/fields/System.Description', value: '<p>Original description</p>' },
      ]);
      storyId = result.id;
      cleanupIds.push(storyId);
    });

    it('updates title and description from a task document', async () => {
      const content = [
        '---',
        `title: "${testItemTitle('upsert: update target — after update')}"`,
        '---',
        '',
        '## Description',
        '',
        'Updated description via upsert flow.',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const ops = toPatchOperations(doc.fields, 'updated');
      const result = await applyWorkItemPatch(context, storyId, pat, ops);

      expect(result.id).toBe(storyId);
      expect(result.rev).toBeGreaterThan(1);
    });

    it('updated User Story reflects the new title', async () => {
      const item = await getWorkItem(context, storyId, pat);
      expect(item.title).toContain('upsert: update target — after update');
    });

    it('updated User Story reflects the new description', async () => {
      const value = await getWorkItemFieldValue(context, storyId, pat, 'System.Description');
      expect(value).not.toBeNull();
      expect(value!).toContain('Updated description via upsert flow');
    });
  });

  // ── Clear fields via upsert flow ─────────────────────────────────────────

  describe('clear fields via upsert flow', () => {
    let storyId: number;

    beforeAll(async () => {
      const result = await createWorkItem(context, 'User Story', pat, [
        { op: 'add', path: '/fields/System.Title', value: testItemTitle('upsert: clear fields test') },
        { op: 'add', path: '/fields/System.Description', value: '<p>To be cleared</p>' },
      ]);
      storyId = result.id;
      cleanupIds.push(storyId);
    });

    it('removes a field when the task document sets it to null', async () => {
      const content = [
        '---',
        `title: "${testItemTitle('upsert: clear fields test — after clear')}"`,
        'description: ~',
        '---',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const ops = toPatchOperations(doc.fields, 'updated');
      await applyWorkItemPatch(context, storyId, pat, ops);

      const value = await getWorkItemFieldValue(context, storyId, pat, 'System.Description');
      expect(value).toBeNull();
    });
  });

  // ── User Story with tags ─────────────────────────────────────────────────

  describe('User Story with tags', () => {
    it('creates a User Story with tags set from a task document', async () => {
      const content = [
        '---',
        `title: "${testItemTitle('upsert: User Story with tags')}"`,
        'tags: integration-test; azdo-cli',
        '---',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const ops = toPatchOperations(doc.fields, 'created');
      const result = await createWorkItem(context, 'User Story', pat, ops);
      cleanupIds.push(result.id);

      const value = await getWorkItemFieldValue(context, result.id, pat, 'System.Tags');
      expect(value).not.toBeNull();
      expect(value!).toContain('integration-test');
      expect(value!).toContain('azdo-cli');
    });
  });

  // ── Markdown format hint for rich-text ───────────────────────────────────

  describe('markdown format hint in rich-text fields', () => {
    it('sets multilineFieldsFormat for Description when using markdown', async () => {
      const content = [
        '---',
        `title: "${testItemTitle('upsert: multilineFieldsFormat for Description when using markdown')}"`,
        '---',
        '',
        '## Description',
        '',
        '**Bold** and _italic_ in a User Story.',
      ].join('\n');

      const doc = parseTaskDocument(content);
      const ops = toPatchOperations(doc.fields, 'created');

      // Verify the operations include the markdown format hint
      const formatOp = ops.find((o) => o.path.includes('multilineFieldsFormat'));
      expect(formatOp).toBeDefined();
      expect(formatOp!.value).toBe('Markdown');

      const result = await createWorkItem(context, 'User Story', pat, ops);
      console.log(`>>> CREATED WORK ITEM ID: ${result.id}`);
      cleanupIds.push(result.id);

      const value = await getWorkItemFieldValue(context, result.id, pat, 'System.Description');
      expect(value).not.toBeNull();
    });
  });
});
