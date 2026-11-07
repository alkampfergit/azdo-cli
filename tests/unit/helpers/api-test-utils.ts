import type { AzdoContext } from '../../../src/types/work-item.js';

export const testContext: AzdoContext = { org: 'testorg', project: 'testproject' };
export const testPat = 'fake-pat';

export function makeFetchResponse(jsonBody: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(jsonBody),
  } as unknown as Response;
}

// A failing response shaped like the real thing: `fetchWithErrors` reads the
// body of every non-ok response from a `clone()` to render the server's own
// explanation, so a fixture without `clone()`/`text()` silently exercises the
// "body could not be captured" fallback instead of the path users hit.
export function makeErrorResponse(status: number, body = ''): Response {
  const response = {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(body),
    json: () => Promise.resolve().then(() => JSON.parse(body) as unknown),
    clone: () => response,
  };
  return response as unknown as Response;
}

export function makeHtmlResponse(htmlBody = '<!DOCTYPE html><html><body>Sign in</body></html>', status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: () => Promise.resolve(htmlBody),
    json: () => Promise.reject(new SyntaxError(`Unexpected token '<'`)),
  } as unknown as Response;
}
