import type { WorkItem, AzdoContext } from '../types/work-item.js';

interface AzdoWorkItemResponse {
  id: number;
  rev: number;
  fields: {
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

export async function getWorkItem(context: AzdoContext, id: number, pat: string): Promise<WorkItem> {
  const url = `https://dev.azure.com/${context.org}/${context.project}/_apis/wit/workitems/${id}?api-version=7.1`;
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
  };
}
