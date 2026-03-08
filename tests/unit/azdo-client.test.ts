import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkItem, updateWorkItem } from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

function makeWorkItemResponse(fields: Record<string, unknown>, status = 200) {
  return makeFetchResponse({
    id: 42,
    rev: 1,
    fields: {
      'System.Title': 'Test Item',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': 'testproject\\Area',
      'System.IterationPath': 'testproject\\Sprint 1',
      ...fields,
    },
    _links: { html: { href: 'https://dev.azure.com/testorg/testproject/_workitems/edit/42' } },
  }, status);
}

async function fetchWorkItem(fields: Record<string, unknown>) {
  vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse(fields));
  return getWorkItem(ctx, 42, pat);
}

describe('getWorkItem', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns work item with System.Description only', async () => {
    const item = await fetchWorkItem({ 'System.Description': '<p>Some description</p>' });
    expect(item.id).toBe(42);
    expect(item.title).toBe('Test Item');
    expect(item.description).toBe('<p>Some description</p>');
  });

  const singleDescFieldCases: [string, string, string][] = [
    ['AcceptanceCriteria', 'Microsoft.VSTS.Common.AcceptanceCriteria', '<p>AC here</p>'],
    ['ReproSteps', 'Microsoft.VSTS.TCM.ReproSteps', '<p>Steps to repro</p>'],
  ];

  it.each(singleDescFieldCases)(
    'returns work item with %s only',
    async (_label, fieldName, fieldValue) => {
      const item = await fetchWorkItem({ [fieldName]: fieldValue });
      expect(item.description).toBe(fieldValue);
    },
  );

  it('concatenates multiple description fields with section headers', async () => {
    const item = await fetchWorkItem({
      'System.Description': '<p>Main desc</p>',
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC content</p>',
    });
    expect(item.description).toContain('<h3>Description</h3>');
    expect(item.description).toContain('<p>Main desc</p>');
    expect(item.description).toContain('<h3>Acceptance Criteria</h3>');
    expect(item.description).toContain('<p>AC content</p>');
  });

  it('concatenates all three description fields', async () => {
    const item = await fetchWorkItem({
      'System.Description': '<p>Desc</p>',
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC</p>',
      'Microsoft.VSTS.TCM.ReproSteps': '<p>Repro</p>',
    });
    expect(item.description).toContain('<h3>Description</h3>');
    expect(item.description).toContain('<h3>Acceptance Criteria</h3>');
    expect(item.description).toContain('<h3>Repro Steps</h3>');
  });

  it('returns null description when no description fields present', async () => {
    const item = await fetchWorkItem({});
    expect(item.description).toBeNull();
  });

  it('maps assignedTo from displayName', async () => {
    const item = await fetchWorkItem({ 'System.AssignedTo': { displayName: 'Alice' } });
    expect(item.assignedTo).toBe('Alice');
  });

  it('returns null assignedTo when not assigned', async () => {
    const item = await fetchWorkItem({});
    expect(item.assignedTo).toBeNull();
  });

  const httpErrorCases: [number, string][] = [
    [401, 'AUTH_FAILED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
    [500, 'HTTP_500'],
  ];

  it.each(httpErrorCases)('throws %s on HTTP %i', async (status, expectedError) => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(status));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow(expectedError);
  });

  it('throws NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('NETWORK_ERROR');
  });

  it('sends correct Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));
    await getWorkItem(ctx, 42, pat);

    const expectedToken = Buffer.from(`:${pat}`).toString('base64');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('dev.azure.com/testorg/testproject'),
      expect.objectContaining({
        headers: { Authorization: `Basic ${expectedToken}` },
      }),
    );
  });

  it('builds correct API URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));
    await getWorkItem(ctx, 99, pat);

    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/testorg/testproject/_apis/wit/workitems/99?api-version=7.1',
      expect.any(Object),
    );
  });

  it('URL-encodes organization and project in API URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));

    await getWorkItem({ org: 'my org', project: 'My Project' }, 99, pat);

    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/my%20org/My%20Project/_apis/wit/workitems/99?api-version=7.1',
      expect.any(Object),
    );
  });

  it('URL-encodes fields query parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));

    await getWorkItem(ctx, 99, pat, ['Custom.Field Name']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('fields='),
      expect.any(Object),
    );
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('Custom.Field+Name');
  });
});

describe('updateWorkItem', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('URL-encodes organization and project in update URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));

    await updateWorkItem(
      { org: 'my org', project: 'My Project' },
      42,
      pat,
      'System.State',
      [{ op: 'add', path: '/fields/System.State', value: 'Active' }],
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/my%20org/My%20Project/_apis/wit/workitems/42?api-version=7.1',
      expect.any(Object),
    );
  });
});
