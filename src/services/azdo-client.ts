import type {
  AddWorkItemCommentResult,
  AuthCredential,
  WorkItem,
  WorkItemAttachment,
  AzdoContext,
  JsonPatchOperation,
  UpdateResult,
  WorkItemComment,
  WorkItemCommentsResult,
  WriteResult,
} from '../types/work-item.js';
import { getActiveTraceWriter, redactHeaders, redactUrl, redactBody, redactText } from './trace-writer.js';
import { withDetail } from './command-helpers.js';
import type { TraceEntry } from '../types/auth-diagnostics.js';
import { extractAttachmentGuid } from './image-download.js';

const DEFAULT_FIELDS: readonly string[] = [
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.TCM.ReproSteps',
  'System.AreaPath',
  'System.IterationPath',
];

export function authHeaders(credentialOrPat: AuthCredential | string): Record<string, string> {
  if (typeof credentialOrPat === 'string') {
    const token = Buffer.from(`:${credentialOrPat}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  if (credentialOrPat.kind === 'oauth') {
    return { Authorization: `Bearer ${credentialOrPat.pat}` };
  }
  const token = Buffer.from(`:${credentialOrPat.pat}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

export async function fetchRaw(url: string, init: RequestInit): Promise<{ status: number; body: string }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(`NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  const body = await response.text();
  return { status: response.status, body };
}

// Console-facing cap on an error detail. The full body is always in the trace
// file when tracing is on, so the console does not need to be the archive.
const MAX_DETAIL_CHARS = 500;
// Cap on a body that would not parse as JSON, where there is no `message` to
// pick out and the whole thing is a guess.
const MAX_RAW_BODY_CHARS = 200;

// Azure DevOps' own explanation of a failure, rendered once per non-2xx
// response and keyed by that response so every error thrown for it — the
// sentinel throws below and the `HTTP_<status>` throws at the ~18 call sites —
// can name it without re-reading (and consuming) the caller's body stream.
const failureDetails = new WeakMap<Response, string>();

// The `message` / `typeKey` / `errorCode` an Azure DevOps JSON error body
// carries, rendered as one line. Returns null when the body is not a JSON
// object, names none of those fields, or — with `requireMessage` — has no
// `message`, which is the bar the curated 400 handlers have always applied.
function renderErrorFields(body: string, requireMessage = false): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return renderErrorRecord(parsed as Record<string, unknown>, requireMessage);
}

function renderErrorRecord(record: Record<string, unknown>, requireMessage: boolean): string | null {
  const parts: string[] = [];
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (message !== '') {
    parts.push(message);
  } else if (requireMessage) {
    return null;
  }

  if (typeof record.typeKey === 'string' && record.typeKey.trim() !== '') {
    parts.push(`[${record.typeKey.trim()}]`);
  } else if (typeof record.errorCode === 'number' || typeof record.errorCode === 'string') {
    parts.push(`[errorCode ${record.errorCode}]`);
  }

  return parts.length === 0 ? null : parts.join(' ');
}

// Renders the `message` / `typeKey` / `errorCode` an Azure DevOps error body
// carries. Returns null when there is nothing safe or useful to print.
export function describeFailureBody(body: string | null, contentType: string): string | null {
  if (body === null) return null;
  const trimmed = body.trim();
  if (trimmed === '') return null;

  // Never echo the AAD sign-in page: an HTML body here is the interactive
  // login form, not a diagnostic. (It is also what the guard further down
  // maps to AUTH_FAILED.)
  if (contentType.toLowerCase().startsWith('text/html') || trimmed.startsWith('<')) {
    return null;
  }

  const redacted = redactBody(trimmed) ?? trimmed;
  // No recognisable fields — the whole body is a guess, so show only a prefix.
  return truncateDetail(renderErrorFields(redacted) ?? redacted.slice(0, MAX_RAW_BODY_CHARS));
}

// Every rendered detail goes through here, so this is the one place that has to
// guarantee "tokens are never echoed": `redactBody` only rewrites recognised
// JSON fields, which leaves an unparseable body — and a token embedded inside an
// otherwise ordinary `message` — untouched. `redactText` closes both gaps.
function truncateDetail(detail: string): string | null {
  const collapsed = redactText(detail).replace(/\s+/g, ' ').trim();
  if (collapsed === '') return null;
  return collapsed.length > MAX_DETAIL_CHARS
    ? `${collapsed.slice(0, MAX_DETAIL_CHARS)}…(truncated)`
    : collapsed;
}

// The error to throw for a non-ok response that `fetchWithErrors` handed back
// to its caller (400 and 5xx). Synchronous: the body was already read and
// rendered by `fetchWithErrors`, so no call site has to deal with a consumed
// stream. Falls back to the bare sentinel for a response built elsewhere.
export function httpError(response: Response): Error {
  return new Error(withDetail(`HTTP_${response.status}`, failureDetails.get(response) ?? null));
}

// Raw failure bodies, keyed by response, so the curated 400 handlers
// (BAD_REQUEST / CREATE_REJECTED / UPDATE_REJECTED) and the 404 message can
// reuse the single read `fetchWithErrors` already performed instead of
// buffering and decoding the same body a second time.
const failureBodies = new WeakMap<Response, string>();

// The body of a non-ok response, read exactly once. Reads from a clone so the
// caller still receives an unconsumed stream, and reuses the tracing read when
// tracing is on. Returns null when the body is unreadable (a stub response
// without `clone()`, an already-consumed stream, a transport error mid-body).
async function readFailureBody(response: Response, tracedBody: string | null): Promise<string | null> {
  if (tracedBody !== null) return tracedBody;
  try {
    return await response.clone().text();
  } catch {
    // No usable `clone()`. Every non-ok response either throws here or throws
    // from its curated handler after reading the cached body, so consuming the
    // original stream costs the caller nothing.
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function writeTraceEntry(
  writer: NonNullable<ReturnType<typeof getActiveTraceWriter>>,
  url: string,
  init: RequestInit,
  response: Response,
  responseBody: string,
): void {
  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { respHeaders[k] = v; });
  const entry: TraceEntry = {
    timestamp: new Date().toISOString(),
    method: (init.method ?? 'GET').toUpperCase(),
    url: redactUrl(url),
    requestHeaders: redactHeaders((init.headers ?? {}) as Record<string, string>),
    requestBody: typeof init.body === 'string' ? redactBody(init.body) : null,
    responseStatus: response.status,
    responseHeaders: respHeaders,
    responseBody,
  };
  writer.append(entry);
}

async function traceResponse(url: string, init: RequestInit, response: Response): Promise<string | null> {
  const writer = getActiveTraceWriter();
  if (!writer) return null;
  let responseBody = '';
  // Clone the response so we can read the body for tracing without consuming it.
  try { responseBody = await response.clone().text(); } catch { /* ignore */ }
  writeTraceEntry(writer, url, init, response, responseBody);
  return responseBody;
}

export async function fetchWithErrors(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error('NETWORK_ERROR', { cause: err });
  }

  const tracedBody = await traceResponse(url, init, response);
  const contentType = response.headers?.get('content-type') ?? '';

  // Read the failure body once, here, for every non-2xx status; everything
  // downstream (the sentinels below, `httpError`, the curated 400 handlers,
  // the 404 message) works off that single read.
  let failureDetail: string | null = null;
  if (!response.ok) {
    const body = await readFailureBody(response, tracedBody);
    if (body !== null) failureBodies.set(response, body);
    failureDetail = describeFailureBody(body, contentType);
    if (failureDetail !== null) failureDetails.set(response, failureDetail);
  }

  if (response.status === 401) throw new Error(withDetail('AUTH_FAILED', failureDetail));
  if (response.status === 403) throw new Error(withDetail('PERMISSION_DENIED', failureDetail));
  if (response.status === 404) {
    const body = failureBodies.get(response);
    throw new Error(body === undefined ? 'NOT_FOUND' : `NOT_FOUND | url=${url} | body=${body}`);
  }

  // AzDO REST APIs always reply with JSON; an HTML body means the unauth'd
  // request was redirected to the AAD sign-in page (status 200 + text/html
  // on some egress paths instead of a 401). Map to AUTH_FAILED so callers
  // surface a real auth message instead of a JSON-parse error downstream.
  if (contentType.toLowerCase().startsWith('text/html')) {
    throw new Error('AUTH_FAILED');
  }

  return response;
}

// The detail behind the curated 400 messages (`BAD_REQUEST:` /
// `CREATE_REJECTED:` / `UPDATE_REJECTED:`). Those branches keep their own
// prefix, but render the same `message [typeKey]` line as every other failure
// instead of dropping the metadata — and reuse the body `fetchWithErrors`
// already read rather than decoding it a second time. Still null when the body
// names no `message`, so a `typeKey`-only 400 falls through to `httpError` as
// it always did.
async function readResponseMessage(response: Response): Promise<string | null> {
  const captured = failureBodies.get(response);
  const rendered = captured === undefined
    ? await renderErrorStream(response)
    : renderErrorFields(redactBody(captured.trim()) ?? captured.trim(), true);
  return rendered === null ? null : truncateDetail(rendered);
}

// Fallback for a response whose body `fetchWithErrors` could not capture (a
// stub without `clone()`/`text()`, or a stream that failed mid-read): parse the
// original stream, exactly as this did before the capture existed.
async function renderErrorStream(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) return null;
    return renderErrorRecord(body as Record<string, unknown>, true);
  } catch {
    // Ignore JSON parse errors from non-JSON error payloads
    return null;
  }
}

function normalizeFieldList(fields: string[]): string[] {
  return Array.from(new Set(fields.map((f) => f.trim()).filter((f) => f.length > 0)));
}

interface AzdoRelation {
  rel: string;
  url: string;
  attributes: {
    name?: string;
    resourceSize?: number;
    resourceCreatedDate?: string;
    resourceModifiedDate?: string;
    [key: string]: unknown;
  };
}

interface AzdoWorkItemResponse {
  id: number;
  rev: number;
  fields: Record<string, unknown> & {
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: { displayName: string };
    'System.Description'?: string;
    'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
    'Microsoft.VSTS.TCM.ReproSteps'?: string;
    'System.AreaPath': string;
    'System.IterationPath': string;
  };
  relations?: AzdoRelation[];
  _links: {
    html: {
      href: string;
    };
  };
}

interface AzdoIdentityRef {
  displayName?: string;
}

interface AzdoCommentResponse {
  id?: number;
  commentId?: number;
  workItemId?: number;
  text?: string;
  createdBy?: AzdoIdentityRef;
  createdDate?: string;
  modifiedDate?: string;
  isDeleted?: boolean;
  url?: string;
}

interface AzdoCommentListResponse {
  comments?: AzdoCommentResponse[];
  continuationToken?: string;
}

interface GetWorkItemRequestOptions {
  fields?: string[];
  includeRelations?: boolean;
}

function stringifyFieldValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function buildExtraFields(
  fields: Record<string, unknown>,
  requested: string[],
): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const name of requested) {
    let val = fields[name];
    let resolvedName = name;
    if (val === undefined) {
      const nameSuffix = name.split('.').pop()!.toLowerCase();
      const match = Object.keys(fields).find(
        (k) => k.split('.').pop()!.toLowerCase() === nameSuffix,
      );
      if (match !== undefined) {
        val = fields[match];
        resolvedName = match;
      }
    }
    if (val !== undefined && val !== null) {
      result[resolvedName] = stringifyFieldValue(val);
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function writeHeaders(cred: AuthCredential): Record<string, string> {
  return {
    ...authHeaders(cred),
    'Content-Type': 'application/json-patch+json',
  };
}

function buildWorkItemCommentsListUrl(context: AzdoContext, id: number, continuationToken?: string): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workItems/${id}/comments`,
  );
  url.searchParams.set('api-version', '7.1-preview.4');
  url.searchParams.set('order', 'desc');

  if (continuationToken) {
    url.searchParams.set('continuationToken', continuationToken);
  }

  return url;
}

function buildWorkItemCommentsUrl(context: AzdoContext, id: number): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workItems/${id}/comments`,
  );
  url.searchParams.set('api-version', '7.1-preview.4');
  return url;
}

function mapWorkItemComment(comment: AzdoCommentResponse, fallbackWorkItemId: number): WorkItemComment {
  return {
    id: comment.id ?? comment.commentId ?? 0,
    workItemId: comment.workItemId ?? fallbackWorkItemId,
    text: typeof comment.text === 'string' ? comment.text : '',
    author: comment.createdBy?.displayName ?? null,
    createdAt: comment.createdDate ?? null,
    modifiedAt: comment.modifiedDate ?? null,
    isDeleted: comment.isDeleted === true,
  };
}

function readContinuationToken(response: Response, data: AzdoCommentListResponse): string | null {
  if (typeof data.continuationToken === 'string' && data.continuationToken.trim() !== '') {
    return data.continuationToken;
  }

  const headerToken = response.headers?.get('x-ms-continuationtoken')
    ?? response.headers?.get('continuationtoken')
    ?? null;

  return headerToken && headerToken.trim() !== '' ? headerToken : null;
}

async function readWriteResponse(response: Response, errorCode: 'CREATE_REJECTED' | 'UPDATE_REJECTED'): Promise<WriteResult> {
  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response) ?? 'Unknown error';
    throw new Error(`${errorCode}: ${serverMessage}`);
  }

  if (!response.ok) {
    throw httpError(response);
  }

  const data = (await response.json()) as AzdoWorkItemResponse;
  return {
    id: data.id,
    rev: data.rev,
    fields: data.fields,
  };
}

export async function getWorkItemFields(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
): Promise<Record<string, unknown>> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');
  url.searchParams.set('$expand', 'all');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });

  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response);
    if (serverMessage) {
      throw new Error(`BAD_REQUEST: ${serverMessage}`);
    }
  }

  if (!response.ok) {
    throw httpError(response);
  }

  const data = (await response.json()) as { fields: Record<string, unknown> };
  return data.fields;
}

function extractAttachments(relations?: AzdoRelation[]): WorkItemAttachment[] | null {
  if (!relations) return null;

  const attachments = relations
    .filter((r) => r.rel === 'AttachedFile')
    .map((r) => ({
      id: extractAttachmentGuid(r.url) ?? '',
      name: r.attributes.name ?? 'unknown',
      size: r.attributes.resourceSize ?? 0,
      url: r.url,
    }));

  return attachments.length > 0 ? attachments : null;
}

export interface AttachmentRelationMatch {
  index: number;
  id: string;
  name: string;
  size: number;
  uploadedDate?: string;
  url: string;
}

/**
 * Find every `AttachedFile` relation on a work item matching `filename`,
 * along with the relation's array **index** — needed to remove exactly one
 * relation via `{ op: 'remove', path: '/relations/{index}' }` (the index is
 * not preserved by extractAttachments()/getWorkItem(), and can shift between
 * reads, so this always does a fresh fetch).
 */
export async function findAttachmentRelations(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  filename: string,
): Promise<AttachmentRelationMatch[]> {
  const data = await fetchWorkItemResponse(context, id, cred, { includeRelations: true });
  const relations = data.relations ?? [];

  return relations
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.rel === 'AttachedFile' && r.attributes.name === filename)
    .map(({ r, index }) => ({
      index,
      id: extractAttachmentGuid(r.url) ?? '',
      name: r.attributes.name ?? filename,
      size: r.attributes.resourceSize ?? 0,
      uploadedDate: r.attributes.resourceCreatedDate ?? r.attributes.resourceModifiedDate,
      url: r.url,
    }));
}

function buildWorkItemUrl(
  context: AzdoContext,
  id: number,
  options: GetWorkItemRequestOptions = {},
): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');

  if (options.includeRelations) {
    url.searchParams.set('$expand', 'relations');
  }

  if (options.fields && options.fields.length > 0) {
    url.searchParams.set('fields', options.fields.join(','));
  }

  return url;
}

async function fetchWorkItemResponse(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  options: GetWorkItemRequestOptions = {},
): Promise<AzdoWorkItemResponse> {
  const response = await fetchWithErrors(
    buildWorkItemUrl(context, id, options).toString(),
    { headers: authHeaders(cred) },
  );

  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response);
    if (serverMessage) {
      throw new Error(`BAD_REQUEST: ${serverMessage}`);
    }
  }

  if (!response.ok) {
    throw httpError(response);
  }

  return (await response.json()) as AzdoWorkItemResponse;
}

export async function getOrgFieldNames(
  context: AzdoContext,
  cred: AuthCredential,
): Promise<string[]> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/_apis/wit/fields`,
  );
  url.searchParams.set('api-version', '7.1');
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  if (!response.ok) {
    throw httpError(response);
  }
  const data = (await response.json()) as { value?: Array<{ referenceName: string }> };
  return (data.value ?? []).map((f) => f.referenceName);
}

function buildCombinedDescription(fields: AzdoWorkItemResponse['fields']): string | null {
  const parts: { label: string; value: string }[] = [];
  if (fields['System.Description']) {
    parts.push({ label: 'Description', value: fields['System.Description'] });
  }
  if (fields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
    parts.push({ label: 'Acceptance Criteria', value: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] });
  }
  if (fields['Microsoft.VSTS.TCM.ReproSteps']) {
    parts.push({ label: 'Repro Steps', value: fields['Microsoft.VSTS.TCM.ReproSteps'] });
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].value;
  return parts.map((p) => `<h3>${p.label}</h3>${p.value}`).join('');
}

async function fetchWorkItemWithFallback(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  normalizedExtraFields: string[],
): Promise<{ data: AzdoWorkItemResponse; effectiveExtraFields: string[] }> {
  try {
    const data = await fetchWorkItemResponse(context, id, cred, {
      fields: normalizeFieldList([...DEFAULT_FIELDS, ...normalizedExtraFields]),
    });
    return { data, effectiveExtraFields: normalizedExtraFields };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('TF51535')) throw err;
    // One or more requested fields don't exist; fetch the org field list, partition, warn, retry.
    const orgFieldNames = await getOrgFieldNames(context, cred);
    const orgFieldsLower = new Set(orgFieldNames.map((n) => n.toLowerCase()));
    const missing = normalizedExtraFields.filter((f) => !orgFieldsLower.has(f.toLowerCase()));
    const effectiveExtraFields = normalizedExtraFields.filter((f) => orgFieldsLower.has(f.toLowerCase()));
    for (const f of missing) {
      process.stderr.write(`azdo: warning: field '${f}' does not exist in organization '${context.org}' and was skipped\n`);
    }
    const data = await fetchWorkItemResponse(context, id, cred, {
      fields: normalizeFieldList([...DEFAULT_FIELDS, ...effectiveExtraFields]),
    });
    return { data, effectiveExtraFields };
  }
}

export async function getWorkItem(context: AzdoContext, id: number, cred: AuthCredential, extraFields?: string[]): Promise<WorkItem> {
  const normalizedExtraFields = extraFields ? normalizeFieldList(extraFields) : [];
  let effectiveExtraFields = normalizedExtraFields;
  let data: AzdoWorkItemResponse;

  if (normalizedExtraFields.length > 0) {
    ({ data, effectiveExtraFields } = await fetchWorkItemWithFallback(context, id, cred, normalizedExtraFields));
  } else {
    data = await fetchWorkItemResponse(context, id, cred, { includeRelations: true });
  }

  const relationsData = normalizedExtraFields.length > 0
    ? await fetchWorkItemResponse(context, id, cred, { includeRelations: true })
    : data;

  return {
    id: data.id,
    rev: data.rev,
    title: data.fields['System.Title'],
    state: data.fields['System.State'],
    type: data.fields['System.WorkItemType'],
    assignedTo: data.fields['System.AssignedTo']?.displayName ?? null,
    description: buildCombinedDescription(data.fields),
    areaPath: data.fields['System.AreaPath'],
    iterationPath: data.fields['System.IterationPath'],
    url: data._links.html.href,
    extraFields: effectiveExtraFields.length > 0
      ? buildExtraFields(data.fields, effectiveExtraFields)
      : null,
    attachments: extractAttachments(relationsData.relations),
  };
}

export async function getWorkItemFieldValue(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  fieldName: string,
): Promise<string | null> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');
  url.searchParams.set('fields', fieldName);

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });

  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response);
    if (serverMessage) {
      throw new Error(`BAD_REQUEST: ${serverMessage}`);
    }
  }

  if (!response.ok) {
    throw httpError(response);
  }

  const data = (await response.json()) as { fields: Record<string, unknown> };
  const value = data.fields[fieldName];

  if (value === undefined || value === null || value === '') {
    return null;
  }

  return stringifyFieldValue(value);
}

export async function listWorkItemComments(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
): Promise<WorkItemCommentsResult> {
  const comments: WorkItemComment[] = [];
  let continuationToken: string | null = null;

  do {
    const response = await fetchWithErrors(
      buildWorkItemCommentsListUrl(context, id, continuationToken ?? undefined).toString(),
      { headers: authHeaders(cred) },
    );

    if (!response.ok) {
      throw httpError(response);
    }

    const data = (await response.json()) as AzdoCommentListResponse;
    comments.push(
      ...(data.comments ?? [])
        .map((comment) => mapWorkItemComment(comment, id))
        .filter((comment) => !comment.isDeleted),
    );
    continuationToken = readContinuationToken(response, data);
  } while (continuationToken !== null);

  return {
    workItemId: id,
    count: comments.length,
    comments,
  };
}

export async function addWorkItemComment(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  text: string,
  format: 'html' | 'markdown' = 'html',
): Promise<AddWorkItemCommentResult> {
  const url = buildWorkItemCommentsUrl(context, id);
  url.searchParams.set('format', format);
  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response) ?? 'Unknown error';
    throw new Error(`BAD_REQUEST: ${serverMessage}`);
  }

  if (!response.ok) {
    throw httpError(response);
  }

  const data = (await response.json()) as AzdoCommentResponse;

  return {
    workItemId: data.workItemId ?? id,
    commentId: data.commentId ?? data.id ?? 0,
    text: typeof data.text === 'string' ? data.text : text,
    author: data.createdBy?.displayName ?? null,
    createdAt: data.createdDate ?? null,
    url: data.url ?? null,
  };
}

export async function updateWorkItem(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  fieldName: string,
  operations: JsonPatchOperation[],
): Promise<UpdateResult> {
  const result = await applyWorkItemPatch(context, id, cred, operations);
  const title = result.fields['System.Title'];
  const lastOp = operations.at(-1);
  const fieldValue = typeof lastOp?.value === 'string' ? lastOp.value : null;

  return {
    id: result.id,
    rev: result.rev,
    title: typeof title === 'string' ? title : '',
    fieldName,
    fieldValue,
  };
}

export async function createWorkItem(
  context: AzdoContext,
  workItemType: string,
  cred: AuthCredential,
  operations: JsonPatchOperation[],
): Promise<WriteResult> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: writeHeaders(cred),
    body: JSON.stringify(operations),
  });

  return readWriteResponse(response, 'CREATE_REJECTED');
}

export async function applyWorkItemPatch(
  context: AzdoContext,
  id: number,
  cred: AuthCredential,
  operations: JsonPatchOperation[],
): Promise<WriteResult> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'PATCH',
    headers: writeHeaders(cred),
    body: JSON.stringify(operations),
  });

  return readWriteResponse(response, 'UPDATE_REJECTED');
}

export async function downloadAttachment(url: string, cred: AuthCredential): Promise<ArrayBuffer> {
  const response = await fetchWithErrors(url, { headers: authHeaders(cred) });

  if (!response.ok) {
    throw httpError(response);
  }

  return response.arrayBuffer();
}

export async function createAttachment(
  context: AzdoContext,
  fileName: string,
  content: Buffer,
  cred: AuthCredential,
): Promise<{ id: string; url: string }> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/attachments`,
  );
  url.searchParams.set('fileName', fileName);
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(content),
  });

  if (response.status === 400) {
    const serverMessage = await readResponseMessage(response);
    if (serverMessage) {
      throw new Error(`BAD_REQUEST: ${serverMessage}`);
    }
  }

  if (!response.ok) {
    throw httpError(response);
  }

  return (await response.json()) as { id: string; url: string };
}
