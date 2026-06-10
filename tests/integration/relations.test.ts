/**
 * Integration tests — Work Item Relations.
 *
 * Required: AZDO_PAT, AZDO_ORG, AZDO_PROJECT
 * Optional:
 *   AZDO_WI_WITH_RELATIONS       — work item with at least one existing relation
 *   AZDO_WI_RELATION_SOURCE      — source work item for add/remove round-trip
 *   AZDO_WI_RELATION_TARGET      — target work item for add/remove round-trip
 *
 * PAT scope required: vso.work (read), vso.work_write (add/remove)
 */

import { describe, expect, it } from 'vitest';
import {
  getWorkItemRelationTypes,
  addWorkItemRelation,
  removeWorkItemRelation,
  listWorkItemRelations,
} from '../../src/services/relations-client.js';
import {
  AZDO_PAT,
  AZDO_WI_WITH_RELATIONS,
  AZDO_WI_RELATION_SOURCE,
  AZDO_WI_RELATION_TARGET,
  SKIP_AZDO,
  makeContext,
} from './helpers/integration-utils.js';
import type { AuthCredential } from '../../src/types/work-item.js';

const SKIP_ADD_REMOVE = SKIP_AZDO || !AZDO_WI_RELATION_SOURCE || !AZDO_WI_RELATION_TARGET;
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

describe.skipIf(SKIP_ADD_REMOVE)('addWorkItemRelation + removeWorkItemRelation (round-trip)', () => {
  const context = makeContext();
  const cred: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };

  it('add → idempotent-add → remove → not_found', async () => {
    const src = AZDO_WI_RELATION_SOURCE!;
    const tgt = AZDO_WI_RELATION_TARGET!;

    // Ensure clean state: remove first in case a previous run left it
    await removeWorkItemRelation(context, cred, 'Related', src, tgt);

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
    const src = AZDO_WI_RELATION_SOURCE!;
    await expect(addWorkItemRelation(context, cred, 'Related', src, src)).rejects.toThrow('SELF_RELATION');
  });

  it('throws UNKNOWN_RELATION_TYPE for unrecognised type', async () => {
    const src = AZDO_WI_RELATION_SOURCE!;
    const tgt = AZDO_WI_RELATION_TARGET!;
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
