import { describe, it, expect } from 'vitest';
import { toJsonDocument } from '../../src/commands/get-item.js';
import { mapRelations } from '../../src/services/azdo-client.js';
import type { WorkItem } from '../../src/types/work-item.js';

const PR_URL = 'vstfs:///Git/PullRequestId/proj-guid%2Frepo-guid%2F77';

describe('mapRelations', () => {
  it('surfaces a pull request ArtifactLink with its id and repository', () => {
    const [rel] = mapRelations([{ rel: 'ArtifactLink', url: PR_URL, attributes: { name: 'Pull Request' } }]);
    expect(rel).toEqual({
      rel: 'ArtifactLink',
      name: 'Pull Request',
      url: PR_URL,
      pullRequest: { id: 77, repositoryId: 'repo-guid', projectId: 'proj-guid' },
    });
  });

  it('accepts literal slashes in the artifact URI', () => {
    const [rel] = mapRelations([{ rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/p/r/9', attributes: {} }]);
    expect(rel.pullRequest).toEqual({ id: 9, repositoryId: 'r', projectId: 'p' });
  });

  it('keeps work item links, attachments and other artifacts without a pullRequest', () => {
    const rels = mapRelations([
      { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/o/_apis/wit/workItems/12', attributes: { name: 'Child' } },
      { rel: 'AttachedFile', url: 'https://dev.azure.com/o/_apis/wit/attachments/abc', attributes: { name: 'a.png' } },
      { rel: 'ArtifactLink', url: 'vstfs:///Git/Commit/p%2Fr%2Fdeadbeef', attributes: { name: 'Fixed in Commit' } },
    ]);
    expect(rels[0].workItemId).toBe(12);
    expect(rels[1].pullRequest).toBeUndefined();
    expect(rels[2].pullRequest).toBeUndefined();
    expect(rels).toHaveLength(3);
  });

  it('returns [] when there are no relations', () => {
    expect(mapRelations(undefined)).toEqual([]);
  });
});

describe('toJsonDocument', () => {
  const base: WorkItem = {
    id: 5, rev: 1, title: 'T', state: 'Active', type: 'Bug', assignedTo: 'Alice',
    description: '<p>Hello <b>world</b></p>', areaPath: 'a', iterationPath: 'i',
    url: 'https://dev.azure.com/o/p/_workitems/edit/5', extraFields: null, attachments: null,
    tags: ['ready', 'x'],
    assignedToIdentity: { displayName: 'Alice', uniqueName: 'alice@x.com', id: 'guid-a' },
    createdBy: { displayName: 'Bob', uniqueName: 'bob@x.com', id: 'guid-b' },
    createdDate: '2026-01-01T00:00:00Z',
    relations: [{ rel: 'ArtifactLink', name: 'Pull Request', url: PR_URL, pullRequest: { id: 77, repositoryId: 'r', projectId: 'p' } }],
  };

  it('has exactly the documented keys with markdown description', () => {
    const doc = toJsonDocument(base);
    expect(Object.keys(doc)).toEqual(['id', 'title', 'description', 'state', 'tags', 'assignedTo', 'createdBy', 'createdDate', 'url', 'relations']);
    expect(doc.description).toBe('Hello **world**');
    expect(doc.assignedTo).toEqual({ displayName: 'Alice', uniqueName: 'alice@x.com', id: 'guid-a' });
    expect((doc.relations as unknown[]).length).toBe(1);
  });

  it('uses null / empty values when the item has none', () => {
    const doc = toJsonDocument({ ...base, description: null, assignedToIdentity: null, createdBy: null, createdDate: null, tags: [], relations: [] });
    expect(doc).toMatchObject({ description: '', assignedTo: null, createdBy: null, createdDate: null, tags: [], relations: [] });
  });
});
