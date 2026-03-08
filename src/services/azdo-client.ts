import type { WorkItem, AzdoContext, JsonPatchOperation, UpdateResult } from '../types/work-item.js';

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
  _links: {
    html: {
      href: string;
    };
  };
}

function buildExtraFields(
  fields: Record<string, unknown>,
  requested: string[],
): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const name of requested) {
    const val = fields[name];
    if (val !== undefined && val !== null) {
      result[name] = String(val);
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export async function getWorkItem(context: AzdoContext, id: number, pat: string, extraFields?: string[]): Promise<WorkItem> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');

  if (extraFields && extraFields.length > 0) {
    const allFields = [...DEFAULT_FIELDS, ...extraFields];
    url.searchParams.set('fields', allFields.join(','));
  }
  const token = Buffer.from(`:${pat}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  if (response.status === 401) throw new Error('AUTH_FAILED');
  if (response.status === 403) throw new Error('PERMISSION_DENIED');
  if (response.status === 404) throw new Error('NOT_FOUND');

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = (await response.json()) as AzdoWorkItemResponse;

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
    combinedDescription = descriptionParts[0].value;
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
    extraFields: extraFields && extraFields.length > 0
      ? buildExtraFields(data.fields, extraFields)
      : null,
  };
}

export async function getWorkItemFieldValue(
  context: AzdoContext,
  id: number,
  pat: string,
  fieldName: string,
): Promise<string | null> {
  const url = `https://dev.azure.com/${context.org}/${context.project}/_apis/wit/workitems/${id}?api-version=7.1&fields=${fieldName}`;
  const token = Buffer.from(`:${pat}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  if (response.status === 401) throw new Error('AUTH_FAILED');
  if (response.status === 403) throw new Error('PERMISSION_DENIED');
  if (response.status === 404) throw new Error('NOT_FOUND');

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = (await response.json()) as { fields: Record<string, unknown> };
  const value = data.fields[fieldName];

  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export async function updateWorkItem(
  context: AzdoContext,
  id: number,
  pat: string,
  fieldName: string,
  operations: JsonPatchOperation[],
): Promise<UpdateResult> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', '7.1');
  const token = Buffer.from(`:${pat}`).toString('base64');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(operations),
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }

  if (response.status === 401) throw new Error('AUTH_FAILED');
  if (response.status === 403) throw new Error('PERMISSION_DENIED');
  if (response.status === 404) throw new Error('NOT_FOUND');

  if (response.status === 400) {
    let serverMessage = 'Unknown error';
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) serverMessage = body.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(`UPDATE_REJECTED: ${serverMessage}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = (await response.json()) as AzdoWorkItemResponse;
  const lastOp = operations[operations.length - 1];
  const fieldValue = lastOp.value ?? null;

  return {
    id: data.id,
    rev: data.rev,
    title: data.fields['System.Title'],
    fieldName,
    fieldValue,
  };
}
