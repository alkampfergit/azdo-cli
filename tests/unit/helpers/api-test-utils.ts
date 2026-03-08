import type { AzdoContext } from '../../../src/types/work-item.js';

export const testContext: AzdoContext = { org: 'testorg', project: 'testproject' };
export const testPat = 'fake-pat';

export function makeFetchResponse(jsonBody: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
  } as unknown as Response;
}

export function makeErrorResponse(status: number): Response {
  return { ok: false, status } as Response;
}
