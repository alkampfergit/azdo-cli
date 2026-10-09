import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteWorkItemComment, updateWorkItemComment } from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

const COMMENT_URL = 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/42/comments/77?api-version=7.1-preview.4';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateWorkItemComment', () => {
  it('PATCHes the comment URL and returns the normalized result', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({
      workItemId: 42,
      commentId: 77,
      text: 'Edited.',
      createdBy: { displayName: 'Alice', uniqueName: 'alice@contoso.com', id: 'a-1' },
      createdDate: '2026-03-28T10:20:00Z',
      modifiedDate: '2026-03-28T11:00:00Z',
      url: 'https://example.test/comments/77',
    }));

    const result = await updateWorkItemComment(ctx, 42, 77, pat, 'Edited.');

    expect(result).toEqual({
      workItemId: 42,
      commentId: 77,
      text: 'Edited.',
      author: 'Alice',
      authorUniqueName: 'alice@contoso.com',
      authorId: 'a-1',
      createdAt: '2026-03-28T10:20:00Z',
      modifiedAt: '2026-03-28T11:00:00Z',
      url: 'https://example.test/comments/77',
    });
    expect(fetch).toHaveBeenCalledWith(
      `${COMMENT_URL}&format=html`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ text: 'Edited.' }) }),
    );
  });

  it('sends format=markdown when requested', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ commentId: 77, text: '**x**' }));
    await updateWorkItemComment(ctx, 42, 77, pat, '**x**', 'markdown');
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('format=markdown');
  });

  it('maps 400 to BAD_REQUEST with the server message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(400, JSON.stringify({ message: 'Text is too long' })));
    await expect(updateWorkItemComment(ctx, 42, 77, pat, 'x')).rejects.toThrow('BAD_REQUEST: Text is too long');
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
  ])('maps %i to %s', async (status, sentinel) => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(status));
    await expect(updateWorkItemComment(ctx, 42, 77, pat, 'x')).rejects.toThrow(sentinel);
  });
});

describe('deleteWorkItemComment', () => {
  it('DELETEs the comment URL and reports success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({}, 200));

    const result = await deleteWorkItemComment(ctx, 42, 77, pat);

    expect(result).toEqual({ workItemId: 42, commentId: 77, deleted: true });
    expect(fetch).toHaveBeenCalledWith(COMMENT_URL, expect.objectContaining({ method: 'DELETE' }));
  });

  it('accepts an empty 204 response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(null, 204));
    await expect(deleteWorkItemComment(ctx, 42, 77, pat)).resolves.toMatchObject({ deleted: true });
  });

  it('maps 400 to BAD_REQUEST with the server message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(400, JSON.stringify({ message: 'Nope' })));
    await expect(deleteWorkItemComment(ctx, 42, 77, pat)).rejects.toThrow('BAD_REQUEST: Nope');
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
  ])('maps %i to %s', async (status, sentinel) => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(status));
    await expect(deleteWorkItemComment(ctx, 42, 77, pat)).rejects.toThrow(sentinel);
  });
});
