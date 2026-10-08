import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { createGetItemCommand } from '../../src/commands/get-item.js';
import { getStdout, getStderr, getExitCode, setupProcessSpies, createCommandRunner } from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', async (orig) => ({
  ...(await orig<typeof import('../../src/services/azdo-client.js')>()),
  getWorkItem: vi.fn(),
  downloadAttachment: vi.fn(),
}));
vi.mock('../../src/services/auth.js', () => ({
  requireAuthCredential: vi.fn(),
  describeResolvedCredential: vi.fn(() => null),
}));
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));
vi.mock('../../src/services/config-store.js', () => ({
  loadConfig: vi.fn(() => ({})),
  resolveScopedConfig: vi.fn(() => ({})),
}));
import { getWorkItem } from '../../src/services/azdo-client.js';
import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

const run = createCommandRunner(createGetItemCommand);
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

describe('get-item --json command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
    vi.mocked(requireAuthCredential).mockResolvedValue({ pat: 'p', source: 'env', kind: 'pat' });
    vi.mocked(getWorkItem).mockResolvedValue({
      id: 42, rev: 1, title: 'T', state: 'Active', type: 'Bug', assignedTo: null,
      description: null, areaPath: 'a', iterationPath: 'i', url: 'u',
      extraFields: null, attachments: null,
    } as WorkItem);
    setupProcessSpies();
  });
  afterEach(() => vi.restoreAllMocks());

  it('emits only the JSON document on stdout', async () => {
    await run(['42', '--json']);
    const parsed = JSON.parse(getStdout());
    expect(parsed.id).toBe(42);
    expect(getStdout().trim().split('\n')).toHaveLength(1);
  });

  it.each([
    [['--download-images']],
    [['--resize-images', '512']],
    [['--images-path', tmpdir()]],
  ])('rejects %j before getWorkItem', async (extra) => {
    await run(['42', '--json', ...extra]);
    expect(getExitCode()).toBe(1);
    expect(getStderr()).toContain('--json cannot be combined');
    expect(getWorkItem).not.toHaveBeenCalled();
  });
});
