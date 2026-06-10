import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzdoContext, AuthCredential } from '../../src/types/work-item.js';
import {
  getWorkItemRelationTypes,
  resolveRelationType,
  addWorkItemRelation,
  removeWorkItemRelation,
  listWorkItemRelations,
} from '../../src/services/relations-client.js';

const context: AzdoContext = { org: 'test-org', project: 'test-project' };
const cred: AuthCredential = { pat: 'test-pat', source: 'env', kind: 'pat' };

function mockFetch(responses: unknown[]) {
  let call = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const json = responses[call++] ?? {};
    return Promise.resolve(
      new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

const TYPES_RESPONSE = {
  value: [
    { referenceName: 'System.LinkTypes.Hierarchy-Forward', name: 'Child', attributes: { usage: 'workItemLink', enabled: true, directional: true } },
    { referenceName: 'System.LinkTypes.Hierarchy-Reverse', name: 'Parent', attributes: { usage: 'workItemLink', enabled: true, directional: true } },
    { referenceName: 'System.LinkTypes.Related', name: 'Related', attributes: { usage: 'workItemLink', enabled: true, directional: false } },
    { referenceName: 'Hyperlink', name: 'Hyperlink', attributes: { usage: 'resourceLink', enabled: true } },
  ],
};

describe('relations-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWorkItemRelationTypes', () => {
    it('maps and filters to workItemLink types only', async () => {
      mockFetch([TYPES_RESPONSE]);
      const result = await getWorkItemRelationTypes(context, cred);
      expect(result).toHaveLength(3);
      expect(result.map((t) => t.name)).toEqual(['Child', 'Parent', 'Related']);
    });

    it('sets directional to null when attribute absent', async () => {
      mockFetch([{ value: [{ referenceName: 'Foo.Bar', name: 'Foo', attributes: { usage: 'workItemLink' } }] }]);
      const result = await getWorkItemRelationTypes(context, cred);
      expect(result[0].directional).toBeNull();
    });

    it('filters out disabled types', async () => {
      mockFetch([{
        value: [
          { referenceName: 'A', name: 'A', attributes: { usage: 'workItemLink', enabled: false } },
          { referenceName: 'B', name: 'B', attributes: { usage: 'workItemLink', enabled: true } },
        ],
      }]);
      const result = await getWorkItemRelationTypes(context, cred);
      expect(result.map((t) => t.name)).toEqual(['B']);
    });
  });

  describe('resolveRelationType', () => {
    it('matches case-insensitively', async () => {
      mockFetch([TYPES_RESPONSE]);
      const result = await resolveRelationType(context, cred, 'CHILD');
      expect(result.referenceName).toBe('System.LinkTypes.Hierarchy-Forward');
    });

    it('throws UNKNOWN_RELATION_TYPE for unrecognised alias', async () => {
      mockFetch([TYPES_RESPONSE]);
      await expect(resolveRelationType(context, cred, 'bogus')).rejects.toThrow('UNKNOWN_RELATION_TYPE:bogus');
    });
  });

  describe('addWorkItemRelation', () => {
    it('throws SELF_RELATION when id1 === id2', async () => {
      await expect(addWorkItemRelation(context, cred, 'child', 100, 100)).rejects.toThrow('SELF_RELATION');
    });

    it('returns already_exists when relation present', async () => {
      const org = encodeURIComponent('test-org');
      mockFetch([
        TYPES_RESPONSE,
        {
          id: 1000,
          relations: [
            { rel: 'System.LinkTypes.Hierarchy-Forward', url: `https://dev.azure.com/${org}/_apis/wit/workItems/2000` },
          ],
        },
      ]);
      const result = await addWorkItemRelation(context, cred, 'child', 1000, 2000);
      expect(result.status).toBe('already_exists');
    });

    it('returns added and PATCHes when relation absent', async () => {
      const fetchSpy = mockFetch([
        TYPES_RESPONSE,
        { id: 1000, relations: [] },
        { id: 1000, relations: [{ rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/2000' }] },
      ]);
      const result = await addWorkItemRelation(context, cred, 'child', 1000, 2000);
      expect(result.status).toBe('added');
      const patchCall = fetchSpy.mock.calls[2];
      expect(patchCall[1]?.method).toBe('PATCH');
    });
  });

  describe('removeWorkItemRelation', () => {
    it('throws SELF_RELATION when id1 === id2', async () => {
      await expect(removeWorkItemRelation(context, cred, 'child', 100, 100)).rejects.toThrow('SELF_RELATION');
    });

    it('returns not_found when relation absent', async () => {
      mockFetch([TYPES_RESPONSE, { id: 1000, relations: [] }]);
      const result = await removeWorkItemRelation(context, cred, 'child', 1000, 2000);
      expect(result.status).toBe('not_found');
    });

    it('PATCHes with op:remove at correct index', async () => {
      const fetchSpy = mockFetch([
        TYPES_RESPONSE,
        {
          id: 1000,
          relations: [
            { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/999' },
            { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/2000' },
          ],
        },
        { id: 1000, relations: [] },
      ]);
      const result = await removeWorkItemRelation(context, cred, 'child', 1000, 2000);
      expect(result.status).toBe('removed');
      const patchBody = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
      expect(patchBody[0]).toEqual({ op: 'remove', path: '/relations/1' });
    });
  });

  describe('listWorkItemRelations', () => {
    it('returns empty array when work item has no relations', async () => {
      mockFetch([{ id: 500, relations: [] }]);
      const result = await listWorkItemRelations(context, cred, 500);
      expect(result.workItemId).toBe(500);
      expect(result.relations).toHaveLength(0);
    });

    it('filters out non-workItemLink relations', async () => {
      mockFetch([
        {
          id: 500,
          relations: [
            { rel: 'AttachedFile', url: 'https://dev.azure.com/test-org/_apis/wit/attachments/abc' },
            { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/300' },
          ],
        },
        TYPES_RESPONSE,
        { value: [{ id: 300, fields: { 'System.Title': 'Related Item' } }] },
      ]);
      const result = await listWorkItemRelations(context, cred, 500);
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].relName).toBe('Related');
      expect(result.relations[0].targetId).toBe(300);
      expect(result.relations[0].targetTitle).toBe('Related Item');
    });
  });
});
