import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkItem, downloadAttachment } from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

function makeWorkItemWithRelationsResponse(relations: unknown[] = [], status = 200) {
  return makeFetchResponse({
    id: 42,
    rev: 1,
    fields: {
      'System.Title': 'Test Item',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': String.raw`testproject\Area`,
      'System.IterationPath': String.raw`testproject\Sprint 1`,
    },
    relations,
    _links: { html: { href: 'https://dev.azure.com/testorg/testproject/_workitems/edit/42' } },
  }, status);
}

describe('getWorkItem attachments', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns attachments from AttachedFile relations', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemWithRelationsResponse([
      {
        rel: 'AttachedFile',
        url: 'https://dev.azure.com/testorg/_apis/wit/attachments/guid1',
        attributes: { name: 'design.png', resourceSize: 102400 },
      },
      {
        rel: 'AttachedFile',
        url: 'https://dev.azure.com/testorg/_apis/wit/attachments/guid2',
        attributes: { name: 'spec.docx', resourceSize: 46285 },
      },
    ]));

    const item = await getWorkItem(ctx, 42, pat);

    expect(item.attachments).toEqual([
      { name: 'design.png', size: 102400, url: 'https://dev.azure.com/testorg/_apis/wit/attachments/guid1' },
      { name: 'spec.docx', size: 46285, url: 'https://dev.azure.com/testorg/_apis/wit/attachments/guid2' },
    ]);
  });

  it('returns null attachments when no AttachedFile relations', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemWithRelationsResponse([
      {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: 'https://dev.azure.com/testorg/_apis/wit/workitems/10',
        attributes: {},
      },
    ]));

    const item = await getWorkItem(ctx, 42, pat);

    expect(item.attachments).toBeNull();
  });

  it('returns null attachments when relations is undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({
      id: 42,
      rev: 1,
      fields: {
        'System.Title': 'Test Item',
        'System.State': 'Active',
        'System.WorkItemType': 'User Story',
        'System.AreaPath': String.raw`testproject\Area`,
        'System.IterationPath': String.raw`testproject\Sprint 1`,
      },
      _links: { html: { href: 'https://dev.azure.com/testorg/testproject/_workitems/edit/42' } },
    }));

    const item = await getWorkItem(ctx, 42, pat);

    expect(item.attachments).toBeNull();
  });

  it('requests $expand=relations in the API URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeWorkItemWithRelationsResponse());

    await getWorkItem(ctx, 42, pat);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('%24expand=relations');
  });
});

describe('downloadAttachment', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads binary content from the attachment URL', async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => binaryData,
    } as unknown as Response);

    const result = await downloadAttachment('https://dev.azure.com/org/_apis/wit/attachments/guid1', pat);

    expect(result).toBe(binaryData);
    const expectedToken = Buffer.from(`:${pat}`).toString('base64');
    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/org/_apis/wit/attachments/guid1',
      expect.objectContaining({
        headers: { Authorization: `Basic ${expectedToken}` },
      }),
    );
  });

  it('throws on 404 response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404));

    await expect(
      downloadAttachment('https://dev.azure.com/org/_apis/wit/attachments/bad-guid', pat),
    ).rejects.toThrow('NOT_FOUND');
  });
});
