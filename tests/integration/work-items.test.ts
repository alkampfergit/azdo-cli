/**
 * Integration tests — Work Item CRUD operations.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Lifecycle:
 *   beforeAll — creates one Task work item tagged "[azdo-cli-test]"
 *   afterAll  — attempts to close/resolve the created item (best-effort)
 *
 * Covered service functions:
 *   createWorkItem, getWorkItem, getWorkItemFieldValue,
 *   getWorkItemFields, applyWorkItemPatch, updateWorkItem
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createWorkItem,
  getWorkItem,
  getWorkItemFieldValue,
  getWorkItemFields,
  updateWorkItem,
} from '../../src/services/azdo-client.js';
import {
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('work items integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const title = testItemTitle('work-items: CRUD operations on Task work items');
  let createdId: number;

  // ── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const result = await createWorkItem(context, 'Task', pat, [
      { op: 'add', path: '/fields/System.Title', value: title },
    ]);
    createdId = result.id;
  });

  // ── Teardown ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    if (!createdId) return;

    // Try common "done" state names across Scrum / Agile / CMMI templates.
    for (const state of ['Done', 'Closed', 'Resolved']) {
      try {
        await applyWorkItemPatch(context, createdId, pat, [
          { op: 'add', path: '/fields/System.State', value: state },
        ]);
        break;
      } catch {
        // Try next state name.
      }
    }
  });

  // ── createWorkItem ───────────────────────────────────────────────────────

  describe('createWorkItem', () => {
    it('returns a positive numeric work item ID', () => {
      expect(createdId).toBeTypeOf('number');
      expect(createdId).toBeGreaterThan(0);
    });

    it('returns the revision number starting at 1', async () => {
      const result = await createWorkItem(context, 'Task', pat, [
        { op: 'add', path: '/fields/System.Title', value: testItemTitle('work-items: verify revision starts at 1 on create') },
      ]);
      expect(result.rev).toBeGreaterThanOrEqual(1);
      // Best-effort cleanup
      try {
        await applyWorkItemPatch(context, result.id, pat, [
          { op: 'add', path: '/fields/System.State', value: 'Done' },
        ]);
      } catch { /* ignore */ }
    });

    it('stores the provided title in the fields map', async () => {
      const uniqueTitle = testItemTitle('work-items: verify title stored in fields map');
      const result = await createWorkItem(context, 'Task', pat, [
        { op: 'add', path: '/fields/System.Title', value: uniqueTitle },
      ]);
      expect(result.fields['System.Title']).toBe(uniqueTitle);
      // Best-effort cleanup
      try {
        await applyWorkItemPatch(context, result.id, pat, [
          { op: 'add', path: '/fields/System.State', value: 'Done' },
        ]);
      } catch { /* ignore */ }
    });
  });

  // ── getWorkItem ──────────────────────────────────────────────────────────

  describe('getWorkItem', () => {
    it('returns the work item with the correct ID', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.id).toBe(createdId);
    });

    it('returns the correct title', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.title).toBe(title);
    });

    it('returns "Task" as the work item type', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.type).toBe('Task');
    });

    it('returns a non-empty state string', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.state).toBeTypeOf('string');
      expect(item.state.length).toBeGreaterThan(0);
    });

    it('returns a non-empty areaPath string', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.areaPath).toBeTypeOf('string');
      expect(item.areaPath.length).toBeGreaterThan(0);
    });

    it('returns a non-empty iterationPath string', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.iterationPath).toBeTypeOf('string');
      expect(item.iterationPath.length).toBeGreaterThan(0);
    });

    it('returns a URL pointing to the Azure DevOps web UI', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.url).toMatch(/^https:\/\/dev\.azure\.com\//);
    });

    it('returns null for assignedTo on an unassigned item', async () => {
      const item = await getWorkItem(context, createdId, pat);
      expect(item.assignedTo).toBeNull();
    });

    it('throws NOT_FOUND for a non-existent work item ID', async () => {
      await expect(getWorkItem(context, 999999999, pat)).rejects.toThrow('NOT_FOUND');
    });

    it('returns extra fields when requested', async () => {
      const item = await getWorkItem(context, createdId, pat, ['System.AreaPath']);
      expect(item.extraFields).not.toBeNull();
      expect(Object.keys(item.extraFields!).some((k) => k.toLowerCase().includes('areapath'))).toBe(true);
    });
  });

  // ── getWorkItemFieldValue ────────────────────────────────────────────────

  describe('getWorkItemFieldValue', () => {
    it('returns the correct title for System.Title', async () => {
      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Title');
      expect(value).toBe(title);
    });

    it('returns null for an empty field (System.Description on a new item)', async () => {
      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      expect(value).toBeNull();
    });

    it('throws NOT_FOUND for a non-existent work item ID', async () => {
      await expect(
        getWorkItemFieldValue(context, 999999999, pat, 'System.Title'),
      ).rejects.toThrow('NOT_FOUND');
    });
  });

  // ── getWorkItemFields ────────────────────────────────────────────────────

  describe('getWorkItemFields', () => {
    it('returns a non-empty fields map', async () => {
      const fields = await getWorkItemFields(context, createdId, pat);
      expect(Object.keys(fields).length).toBeGreaterThan(0);
    });

    it('includes System.Title in the fields map', async () => {
      const fields = await getWorkItemFields(context, createdId, pat);
      expect(fields['System.Title']).toBe(title);
    });

    it('includes System.WorkItemType in the fields map', async () => {
      const fields = await getWorkItemFields(context, createdId, pat);
      expect(fields['System.WorkItemType']).toBe('Task');
    });

    it('includes System.State in the fields map', async () => {
      const fields = await getWorkItemFields(context, createdId, pat);
      expect(fields['System.State']).toBeTypeOf('string');
    });
  });

  // ── applyWorkItemPatch / updateWorkItem ──────────────────────────────────

  describe('applyWorkItemPatch', () => {
    it('updates System.Title and returns the new revision', async () => {
      const newTitle = testItemTitle('work-items: applyWorkItemPatch updates title');
      const result = await applyWorkItemPatch(context, createdId, pat, [
        { op: 'add', path: '/fields/System.Title', value: newTitle },
      ]);
      expect(result.id).toBe(createdId);
      expect(result.rev).toBeGreaterThan(1);
      expect(result.fields['System.Title']).toBe(newTitle);

      // Restore the original title for subsequent tests.
      await applyWorkItemPatch(context, createdId, pat, [
        { op: 'add', path: '/fields/System.Title', value: title },
      ]);
    });

    it('throws NOT_FOUND when patching a non-existent item', async () => {
      await expect(
        applyWorkItemPatch(context, 999999999, pat, [
          { op: 'add', path: '/fields/System.Title', value: 'ghost' },
        ]),
      ).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('updateWorkItem', () => {
    it('returns an UpdateResult with the correct field name and updated value', async () => {
      const updatedTitle = testItemTitle('work-items: updateWorkItem returns UpdateResult');
      const result = await updateWorkItem(context, createdId, pat, 'System.Title', [
        { op: 'add', path: '/fields/System.Title', value: updatedTitle },
      ]);
      expect(result.id).toBe(createdId);
      expect(result.fieldName).toBe('System.Title');
      expect(result.fieldValue).toBe(updatedTitle);

      // Restore the original title.
      await updateWorkItem(context, createdId, pat, 'System.Title', [
        { op: 'add', path: '/fields/System.Title', value: title },
      ]);
    });
  });

  // ── Auth failures ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('throws an error when using an invalid PAT', async () => {
      // AzDo may respond with a 401 (→ AUTH_FAILED) or redirect to a login
      // page (→ a JSON parse error). Either way it must not succeed.
      await expect(
        getWorkItem(context, createdId, 'invalid-pat-that-will-fail'),
      ).rejects.toThrow();
    });
  });
});
