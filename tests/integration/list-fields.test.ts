/**
 * Integration tests — List all fields of a work item.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Lifecycle:
 *   beforeAll — creates one Task work item tagged "[azdo-cli-test]"
 *   afterAll  — attempts to close the created item (best-effort)
 *
 * Covered service functions:
 *   getWorkItemFields  — returns the complete field map for a work item
 *
 * Also exercises:
 *   formatFieldList (list-fields command helper) — formatting of the field map
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createWorkItem,
  getWorkItemFields,
} from '../../src/services/azdo-client.js';
import { formatFieldList } from '../../src/commands/list-fields.js';
import {
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('list-fields integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const title = testItemTitle('list-fields suite');
  let createdId: number;
  let fields: Record<string, unknown>;

  // ── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const result = await createWorkItem(context, 'Task', pat, [
      { op: 'add', path: '/fields/System.Title', value: title },
    ]);
    createdId = result.id;
    fields = await getWorkItemFields(context, createdId, pat);
  });

  // ── Teardown ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    if (!createdId) return;
    for (const state of ['Done', 'Closed', 'Resolved']) {
      try {
        await applyWorkItemPatch(context, createdId, pat, [
          { op: 'add', path: '/fields/System.State', value: state },
        ]);
        break;
      } catch { /* try next */ }
    }
  });

  // ── getWorkItemFields ────────────────────────────────────────────────────

  describe('getWorkItemFields', () => {
    it('returns a non-empty fields object', () => {
      expect(Object.keys(fields).length).toBeGreaterThan(0);
    });

    it('includes System.Title with the correct value', () => {
      expect(fields['System.Title']).toBe(title);
    });

    it('includes System.WorkItemType set to "Task"', () => {
      expect(fields['System.WorkItemType']).toBe('Task');
    });

    it('includes System.State as a non-empty string', () => {
      expect(fields['System.State']).toBeTypeOf('string');
      expect((fields['System.State'] as string).length).toBeGreaterThan(0);
    });

    it('includes System.AreaPath as a non-empty string', () => {
      expect(fields['System.AreaPath']).toBeTypeOf('string');
      expect((fields['System.AreaPath'] as string).length).toBeGreaterThan(0);
    });

    it('includes System.IterationPath as a non-empty string', () => {
      expect(fields['System.IterationPath']).toBeTypeOf('string');
      expect((fields['System.IterationPath'] as string).length).toBeGreaterThan(0);
    });

    it('includes System.Id matching the created item ID', () => {
      expect(fields['System.Id']).toBe(createdId);
    });

    it('includes System.Rev as a positive integer', () => {
      expect(typeof fields['System.Rev']).toBe('number');
      expect(fields['System.Rev'] as number).toBeGreaterThan(0);
    });

    it('includes at least 10 distinct fields', () => {
      expect(Object.keys(fields).length).toBeGreaterThanOrEqual(10);
    });

    it('all field keys follow the Namespace.FieldName pattern', () => {
      const keys = Object.keys(fields);
      const invalid = keys.filter((k) => !k.includes('.'));
      expect(invalid).toHaveLength(0);
    });

    it('throws NOT_FOUND for a non-existent work item', async () => {
      await expect(getWorkItemFields(context, 999999999, pat)).rejects.toThrow('NOT_FOUND');
    });
  });

  // ── formatFieldList (command-layer helper) ───────────────────────────────

  describe('formatFieldList', () => {
    it('returns a non-empty formatted string', () => {
      const output = formatFieldList(fields);
      expect(output).toBeTypeOf('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('contains the work item title in the output', () => {
      const output = formatFieldList(fields);
      expect(output).toContain(title);
    });

    it('contains "System.Title" as a field key', () => {
      const output = formatFieldList(fields);
      expect(output).toContain('System.Title');
    });

    it('contains "System.State" as a field key', () => {
      const output = formatFieldList(fields);
      expect(output).toContain('System.State');
    });

    it('does not include raw "null" or "undefined" strings in the output', () => {
      // Azure DevOps omits unset fields from the response entirely,
      // so formatFieldList should never render literal null/undefined.
      const output = formatFieldList(fields);
      expect(output).not.toContain('null');
      expect(output).not.toContain('undefined');
    });
  });
});
