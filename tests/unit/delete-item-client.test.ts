import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteWorkItem } from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

const BASE = 'https://dev.azure.com/testorg/testproject/_apis/wit/workitems/42';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deleteWorkItem', () => {
  it('DELETEs without destroy by default (Recycle Bin)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ id: 42 }, 200));

    const result = await deleteWorkItem(ctx, 42, pat);

    expect(result).toEqual({ id: 42, permanent: false });
    expect(fetch).toHaveBeenCalledWith(`${BASE}?api-version=7.1`, expect.objectContaining({ method: 'DELETE' }));
  });

  it('adds destroy=true when permanent', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ id: 42 }, 200));

    const result = await deleteWorkItem(ctx, 42, pat, true);

    expect(result).toEqual({ id: 42, permanent: true });
    expect(fetch).toHaveBeenCalledWith(`${BASE}?destroy=true&api-version=7.1`, expect.objectContaining({ method: 'DELETE' }));
  });

  it('maps 400 to BAD_REQUEST with the server message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(400, JSON.stringify({ message: 'Nope' })));
    await expect(deleteWorkItem(ctx, 42, pat)).rejects.toThrow('BAD_REQUEST: Nope');
  });

  it('maps 403 to PERMISSION_DENIED and 404 to NOT_FOUND', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(403, ''));
    await expect(deleteWorkItem(ctx, 42, pat)).rejects.toThrow('PERMISSION_DENIED');
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404, ''));
    await expect(deleteWorkItem(ctx, 42, pat)).rejects.toThrow('NOT_FOUND');
  });
});
