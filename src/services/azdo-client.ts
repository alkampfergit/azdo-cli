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

export async function fetchWithErrors(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  if (response.status === 401) throw new Error('AUTH_FAILED');
  if (response.status === 403) throw new Error('PERMISSION_DENIED');
  if (response.status === 404) {
    let detail = '';
    try {
      const body = await response.text();
      detail = ` | url=${url} | body=${body}`;
    } catch { /* ignore */ }
    throw new Error(`NOT_FOUND${detail}`);
  }

  return response;
}

async function readResponseMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim() !== '') {
      return body.message.trim();
    }
  } catch {
    // Ignore JSON parse errors from non-JSON error payloads
  }
  return null;
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
    throw new Error(`HTTP_${response.status}`);
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
    throw new Error(`HTTP_${response.status}`);
  }

  const data = (await response.json()) as { fields: Record<string, unknown> };
  return data.fields;
}

function extractAttachments(relations?: AzdoRelation[]): WorkItemAttachment[] | null {
  if (!relations) return null;

  const attachments = relations
    .filter((r) => r.rel === 'AttachedFile')
    .map((r) => ({
      name: r.attributes.name ?? 'unknown',
      size: r.attributes.resourceSize ?? 0,
      url: r.url,
    }));

  return attachments.length > 0 ? attachments : null;
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
    throw new Error(`HTTP_${response.status}`);
  }

  return (await response.json()) as AzdoWorkItemResponse;
}

export async function getWorkItem(context: AzdoContext, id: number, cred: AuthCredential, extraFields?: string[]): Promise<WorkItem> {
  const normalizedExtraFields = extraFields ? normalizeFieldList(extraFields) : [];
  const data = normalizedExtraFields.length > 0
    ? await fetchWorkItemResponse(context, id, cred, {
      fields: normalizeFieldList([...DEFAULT_FIELDS, ...normalizedExtraFields]),
    })
    : await fetchWorkItemResponse(context, id, cred, { includeRelations: true });
  const relationsData = normalizedExtraFields.length > 0
    ? await fetchWorkItemResponse(context, id, cred, { includeRelations: true })
    : data;

  const descriptionParts: { label: string; value: string }[] = [];
  if (data.fields['System.Description']) {
    descriptionParts.push({ label: 'Description', value: data.fields['System.Description'] });
  }
  if (data.fields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
    descriptionParts.push({ label: 'Acceptance Criteria', value: data.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] });
  }
  if (data.fields['Microsoft.VSTS.TCM.ReproSteps']) {
    descriptionParts.push({ label: 'Repro Steps', value: data.fields['Microsoft.VSTS.TCM.ReproSteps'] });
  }

  let combinedDescription: string | null = null;
  if (descriptionParts.length === 1) {
    combinedDescription = descriptionParts.at(0)?.value ?? null;
  } else if (descriptionParts.length > 1) {
    combinedDescription = descriptionParts
      .map((p) => `<h3>${p.label}</h3>${p.value}`)
      .join('');
  }

  return {
    id: data.id,
    rev: data.rev,
    title: data.fields['System.Title'],
    state: data.fields['System.State'],
    type: data.fields['System.WorkItemType'],
    assignedTo: data.fields['System.AssignedTo']?.displayName ?? null,
    description: combinedDescription,
    areaPath: data.fields['System.AreaPath'],
    iterationPath: data.fields['System.IterationPath'],
    url: data._links.html.href,
    extraFields: normalizedExtraFields.length > 0
      ? buildExtraFields(data.fields, normalizedExtraFields)
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
    throw new Error(`HTTP_${response.status}`);
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
      throw new Error(`HTTP_${response.status}`);
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
    throw new Error(`HTTP_${response.status}`);
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
  const fieldValue = lastOp?.value ?? null;

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
    throw new Error(`HTTP_${response.status}`);
  }

  return response.arrayBuffer();
}
