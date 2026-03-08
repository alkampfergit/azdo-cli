import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkItemFieldValue } from '../../src/services/azdo-client.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

function makeFieldResponse(fieldName: string, value: unknown, status = 200) {
  return makeFetchResponse({ fields: { [fieldName]: value } }, status);
}

describe('getWorkItemFieldValue', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns string value for a field that exists', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('System.Description', '<p>Hello</p>'),
    );
    const result = await getWorkItemFieldValue(ctx, 42, pat, 'System.Description');
    expect(result).toBe('<p>Hello</p>');
  });

  it('returns null when field value is null', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('System.Description', null),
    );
    const result = await getWorkItemFieldValue(ctx, 42, pat, 'System.Description');
    expect(result).toBeNull();
  });

  it('returns null when field value is undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ fields: {} }),
    );
    const result = await getWorkItemFieldValue(ctx, 42, pat, 'System.Description');
    expect(result).toBeNull();
  });

  it('returns null when field value is empty string', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('System.Description', ''),
    );
    const result = await getWorkItemFieldValue(ctx, 42, pat, 'System.Description');
    expect(result).toBeNull();
  });

  it('converts non-string values to string', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('Custom.Number', 42),
    );
    const result = await getWorkItemFieldValue(ctx, 42, pat, 'Custom.Number');
    expect(result).toBe('42');
  });

  it('builds correct API URL with fields query parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('System.Title', 'Test'),
    );
    await getWorkItemFieldValue(ctx, 99, pat, 'System.Description');
    expect(fetch).toHaveBeenCalledWith(
      'https://dev.azure.com/testorg/testproject/_apis/wit/workitems/99?api-version=7.1&fields=System.Description',
      expect.any(Object),
    );
  });

  it('sends correct Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFieldResponse('System.Title', 'Test'),
    );
    await getWorkItemFieldValue(ctx, 42, pat, 'System.Title');
    const expectedToken = Buffer.from(`:${pat}`).toString('base64');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: `Basic ${expectedToken}` },
      }),
    );
  });

  const httpErrorCases: [number, string][] = [
    [401, 'AUTH_FAILED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
    [500, 'HTTP_500'],
  ];

  it.each(httpErrorCases)('throws %s on HTTP %i', async (status, expectedError) => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(status));
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow(expectedError);
  });

  it('throws NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('NETWORK_ERROR');
  });
});
