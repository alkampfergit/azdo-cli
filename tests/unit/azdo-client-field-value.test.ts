import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkItemFieldValue } from '../../src/services/azdo-client.js';
import type { AzdoContext } from '../../src/types/work-item.js';

const ctx: AzdoContext = { org: 'testorg', project: 'testproject' };
const pat = 'fake-pat';

function makeFieldResponse(fieldName: string, value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      fields: { [fieldName]: value },
    }),
  } as unknown as Response;
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
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fields: {} }),
    } as unknown as Response);
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

  it('throws AUTH_FAILED on 401', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('AUTH_FAILED');
  });

  it('throws PERMISSION_DENIED on 403', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('PERMISSION_DENIED');
  });

  it('throws NOT_FOUND on 404', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('NOT_FOUND');
  });

  it('throws NETWORK_ERROR when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('NETWORK_ERROR');
  });

  it('throws HTTP_500 on unexpected status', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(getWorkItemFieldValue(ctx, 42, pat, 'System.Title')).rejects.toThrow('HTTP_500');
  });
});
