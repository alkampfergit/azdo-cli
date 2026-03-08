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

describe('getWorkItem', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns work item with System.Description only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'System.Description': '<p>Some description</p>',
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.id).toBe(42);
    expect(item.title).toBe('Test Item');
    expect(item.description).toBe('<p>Some description</p>');
  });

  it('returns work item with AcceptanceCriteria only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC here</p>',
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.description).toBe('<p>AC here</p>');
  });

  it('returns work item with ReproSteps only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'Microsoft.VSTS.TCM.ReproSteps': '<p>Steps to repro</p>',
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.description).toBe('<p>Steps to repro</p>');
  });

  it('concatenates multiple description fields with section headers', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'System.Description': '<p>Main desc</p>',
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC content</p>',
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.description).toContain('<h3>Description</h3>');
    expect(item.description).toContain('<p>Main desc</p>');
    expect(item.description).toContain('<h3>Acceptance Criteria</h3>');
    expect(item.description).toContain('<p>AC content</p>');
  });

  it('concatenates all three description fields', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'System.Description': '<p>Desc</p>',
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC</p>',
      'Microsoft.VSTS.TCM.ReproSteps': '<p>Repro</p>',
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.description).toContain('<h3>Description</h3>');
    expect(item.description).toContain('<h3>Acceptance Criteria</h3>');
    expect(item.description).toContain('<h3>Repro Steps</h3>');
  });

  it('returns null description when no description fields present', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.description).toBeNull();
  });

  it('maps assignedTo from displayName', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({
      'System.AssignedTo': { displayName: 'Alice' },
    }));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.assignedTo).toBe('Alice');
  });

  it('returns null assignedTo when not assigned', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemResponse({}));

    const item = await getWorkItem(ctx, 42, pat);
    expect(item.assignedTo).toBeNull();
  });

  it('throws AUTH_FAILED on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('AUTH_FAILED');
  });

  it('throws PERMISSION_DENIED on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(403));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('throws NOT_FOUND on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('NOT_FOUND');
  });

  it('throws NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('NETWORK_ERROR');
  });

  it('throws HTTP_500 on unexpected status', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500));
    await expect(getWorkItem(ctx, 42, pat)).rejects.toThrow('HTTP_500');
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
