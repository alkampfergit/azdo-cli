/**
 * Integration tests — Work Item Relations.
 *
 * Required: AZDO_PAT, AZDO_ORG, AZDO_PROJECT
 * Optional:
 *   AZDO_WI_WITH_RELATIONS       — work item with at least one existing relation
 *                                  (read-only; the add/remove round-trip creates
 *                                  its own scratch pair, see below)
 *
 * PAT scope required: vso.work (read), vso.work_write (add/remove)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getWorkItemRelationTypes,
  addWorkItemRelation,
  removeWorkItemRelation,
  listWorkItemRelations,
} from '../../src/services/relations-client.js';
import { applyWorkItemPatch, createWorkItem } from '../../src/services/azdo-client.js';
import {
  AZDO_PAT,
  AZDO_WI_WITH_RELATIONS,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';
import type { AuthCredential } from '../../src/types/work-item.js';

const SKIP_LIST = SKIP_AZDO || !AZDO_WI_WITH_RELATIONS;

describe.skipIf(SKIP_AZDO)('getWorkItemRelationTypes', () => {
  const context = makeContext();
  const cred: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };

  it('returns a non-empty array of relation types', async () => {
    const types = await getWorkItemRelationTypes(context, cred);
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it('includes Child, Parent and Related by display name', async () => {
    const types = await getWorkItemRelationTypes(context, cred);
    const names = types.map((t) => t.name);
    expect(names).toContain('Child');
    expect(names).toContain('Parent');
    expect(names).toContain('Related');
  });

  it('all returned types have usage workItemLink', async () => {
    const types = await getWorkItemRelationTypes(context, cred);
    for (const t of types) {
      expect(t.usage).toBe('workItemLink');
    }
  });

  it('throws AUTH_FAILED on bad PAT', async () => {
    const badCred: AuthCredential = { pat: 'bad-pat-value', source: 'env', kind: 'pat' };
    await expect(getWorkItemRelationTypes(context, badCred)).rejects.toThrow('AUTH_FAILED');
  });
});

/**
 * The round-trip mutates the work items it links, so it creates its own pair
 * rather than sharing a fixture: a push to a pull-request branch starts two CI
 * runs (one from `push`, one from `pull_request`) against the same Azure DevOps
 * organization, and with a shared pair those two runs add and remove the same
 * relation concurrently — each then observes the other's writes and both fail
 * ("expected 'added' to be 'already_exists'" in one, the mirror image in the
 * other). Scratch items make every run's link graph private to that run.
 */
describe.skipIf(SKIP_AZDO)('addWorkItemRelation + removeWorkItemRelation (round-trip)', () => {
  const context = makeContext();
  const cred: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };
  let src: number;
  let tgt: number;

  beforeAll(async () => {
    const [source, target] = await Promise.all([
      createWorkItem(context, 'Task', cred, [
        { op: 'add', path: '/fields/System.Title', value: testItemTitle('relations: round-trip source') },
      ]),
      createWorkItem(context, 'Task', cred, [
        { op: 'add', path: '/fields/System.Title', value: testItemTitle('relations: round-trip target') },
      ]),
    ]);
    src = source.id;
    tgt = target.id;
  }, 30_000);

  afterAll(async () => {
    // Best-effort close, mirroring work-item-attachments.test.ts: the scratch
    // items stay identifiable by their "[azdo-cli-test]" title prefix.
    for (const id of [src, tgt]) {
      if (!id) continue;
      for (const state of ['Done', 'Closed', 'Resolved']) {
        try {
          await applyWorkItemPatch(context, id, cred, [
            { op: 'add', path: '/fields/System.State', value: state },
          ]);
          break;
        } catch {
          // Try next state name.
        }
      }
    }
  });

  it('add → idempotent-add → remove → not_found', async () => {
    const addResult = await addWorkItemRelation(context, cred, 'Related', src, tgt);
    expect(addResult.status).toBe('added');
    expect(addResult.type).toBe('Related');
    expect(addResult.id1).toBe(src);
    expect(addResult.id2).toBe(tgt);

    const idempotentResult = await addWorkItemRelation(context, cred, 'Related', src, tgt);
    expect(idempotentResult.status).toBe('already_exists');

    const removeResult = await removeWorkItemRelation(context, cred, 'Related', src, tgt);
    expect(removeResult.status).toBe('removed');

    const notFoundResult = await removeWorkItemRelation(context, cred, 'Related', src, tgt);
    expect(notFoundResult.status).toBe('not_found');
  });

  it('throws SELF_RELATION for same IDs', async () => {
    await expect(addWorkItemRelation(context, cred, 'Related', src, src)).rejects.toThrow('SELF_RELATION');
  });

  it('throws UNKNOWN_RELATION_TYPE for unrecognised type', async () => {
    await expect(addWorkItemRelation(context, cred, 'nonexistenttype', src, tgt)).rejects.toThrow(
      'UNKNOWN_RELATION_TYPE',
    );
  });
});

describe.skipIf(SKIP_LIST)('listWorkItemRelations', () => {
  const context = makeContext();
  const cred: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };

  it('returns WorkItemRelationsResult with correct workItemId', async () => {
    const result = await listWorkItemRelations(context, cred, AZDO_WI_WITH_RELATIONS!);
    expect(result.workItemId).toBe(AZDO_WI_WITH_RELATIONS!);
    expect(Array.isArray(result.relations)).toBe(true);
  });

  it('each relation has required fields', async () => {
    const result = await listWorkItemRelations(context, cred, AZDO_WI_WITH_RELATIONS!);
    for (const r of result.relations) {
      expect(typeof r.rel).toBe('string');
      expect(typeof r.relName).toBe('string');
      expect(typeof r.targetId).toBe('number');
      expect(r.targetId).toBeGreaterThan(0);
      expect(typeof r.targetUrl).toBe('string');
    }
  });

  it('throws NOT_FOUND for non-existent work item', async () => {
    await expect(listWorkItemRelations(context, cred, 999999999)).rejects.toThrow('NOT_FOUND');
  });
});
