import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import { authHeaders, fetchWithErrors } from './azdo-client.js';
import type {
  AddRelationResult,
  AzdoWorkItemRelation,
  AzdoWorkItemRelationTypeListResponse,
  RemoveRelationResult,
  WorkItemRelation,
  WorkItemRelationsResult,
  WorkItemRelationType,
} from '../types/relations.js';

const API_VERSION = '7.1';

// ---------------------------------------------------------------------------
// Private: raw ADO response shapes
// ---------------------------------------------------------------------------

interface AzdoWorkItemWithRelations {
  id: number;
  relations?: AzdoWorkItemRelation[];
}

interface AzdoBatchWorkItemsResponse {
  value: Array<{ id: number; fields: { 'System.Title'?: string } }>;
}

// ---------------------------------------------------------------------------
// Private: URL builders
// ---------------------------------------------------------------------------

function buildRelationTypesUrl(context: AzdoContext): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/_apis/wit/workitemrelationtypes`,
  );
  url.searchParams.set('api-version', API_VERSION);
  return url;
}

function buildWorkItemUrl(context: AzdoContext, id: number, expand?: string): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems/${id}`,
  );
  url.searchParams.set('api-version', API_VERSION);
  if (expand) url.searchParams.set('$expand', expand);
  return url;
}

function buildBatchWorkItemsUrl(context: AzdoContext, ids: number[]): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/wit/workitems`,
  );
  url.searchParams.set('ids', ids.join(','));
  url.searchParams.set('fields', 'System.Id,System.Title');
  url.searchParams.set('api-version', API_VERSION);
  return url;
}

// ---------------------------------------------------------------------------
// Private: mappers
// ---------------------------------------------------------------------------

function mapRelationType(raw: { referenceName: string; name: string; attributes?: { usage?: string; enabled?: boolean; directional?: boolean } }): WorkItemRelationType {
  return {
    referenceName: raw.referenceName,
    name: raw.name,
    usage: raw.attributes?.usage ?? 'unknown',
    enabled: raw.attributes?.enabled !== false,
    directional: raw.attributes?.directional ?? null,
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return (await response.json()) as T;
}

function parseTargetId(url: string): number | null {
  const match = /\/workItems\/(\d+)$/i.exec(url);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Public: relation types
// ---------------------------------------------------------------------------

export async function getWorkItemRelationTypes(
  context: AzdoContext,
  cred: AuthCredential,
): Promise<WorkItemRelationType[]> {
  const url = buildRelationTypesUrl(context);
  const response = await fetchWithErrors(url.toString(), {
    headers: authHeaders(cred),
  });
  const body = await readJsonResponse<AzdoWorkItemRelationTypeListResponse>(response);
  return (body.value ?? [])
    .map(mapRelationType)
    .filter((t) => t.usage === 'workItemLink' && t.enabled);
}

export async function resolveRelationType(
  context: AzdoContext,
  cred: AuthCredential,
  alias: string,
): Promise<WorkItemRelationType> {
  const types = await getWorkItemRelationTypes(context, cred);
  const lower = alias.toLowerCase();
  const match = types.find((t) => t.name.toLowerCase() === lower);
  if (!match) throw new Error(`UNKNOWN_RELATION_TYPE:${alias}`);
  return match;
}

// ---------------------------------------------------------------------------
// Public: work item + relations fetch
// ---------------------------------------------------------------------------

export async function getWorkItemWithRelations(
  context: AzdoContext,
  cred: AuthCredential,
  id: number,
): Promise<AzdoWorkItemWithRelations> {
  const url = buildWorkItemUrl(context, id, 'relations');
  const response = await fetchWithErrors(url.toString(), {
    headers: authHeaders(cred),
  });
  return readJsonResponse<AzdoWorkItemWithRelations>(response);
}

// ---------------------------------------------------------------------------
// Public: add relation
// ---------------------------------------------------------------------------

export async function addWorkItemRelation(
  context: AzdoContext,
  cred: AuthCredential,
  type: string,
  id1: number,
  id2: number,
): Promise<AddRelationResult> {
  if (id1 === id2) throw new Error('SELF_RELATION');

  const relType = await resolveRelationType(context, cred, type);
  const workItem = await getWorkItemWithRelations(context, cred, id1);

  const targetUrl = `https://dev.azure.com/${encodeURIComponent(context.org)}/_apis/wit/workItems/${id2}`;
  const existing = (workItem.relations ?? []).find(
    (r) => r.rel === relType.referenceName && parseTargetId(r.url) === id2,
  );

  if (existing) {
    return { status: 'already_exists', type: relType.name, referenceName: relType.referenceName, id1, id2 };
  }

  const patchUrl = buildWorkItemUrl(context, id1);
  const response = await fetchWithErrors(patchUrl.toString(), {
    method: 'PATCH',
    headers: { ...authHeaders(cred), 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([
      { op: 'add', path: '/relations/-', value: { rel: relType.referenceName, url: targetUrl } },
    ]),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  return { status: 'added', type: relType.name, referenceName: relType.referenceName, id1, id2 };
}

// ---------------------------------------------------------------------------
// Public: remove relation
// ---------------------------------------------------------------------------

export async function removeWorkItemRelation(
  context: AzdoContext,
  cred: AuthCredential,
  type: string,
  id1: number,
  id2: number,
): Promise<RemoveRelationResult> {
  if (id1 === id2) throw new Error('SELF_RELATION');

  const relType = await resolveRelationType(context, cred, type);
  const workItem = await getWorkItemWithRelations(context, cred, id1);

  const relations = workItem.relations ?? [];
  const index = relations.findIndex(
    (r) => r.rel === relType.referenceName && parseTargetId(r.url) === id2,
  );

  if (index === -1) {
    return { status: 'not_found', type: relType.name, referenceName: relType.referenceName, id1, id2 };
  }

  const patchUrl = buildWorkItemUrl(context, id1);
  const response = await fetchWithErrors(patchUrl.toString(), {
    method: 'PATCH',
    headers: { ...authHeaders(cred), 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([{ op: 'remove', path: `/relations/${index}` }]),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  return { status: 'removed', type: relType.name, referenceName: relType.referenceName, id1, id2 };
}

// ---------------------------------------------------------------------------
// Public: list relations on a work item
// ---------------------------------------------------------------------------

export async function listWorkItemRelations(
  context: AzdoContext,
  cred: AuthCredential,
  id: number,
): Promise<WorkItemRelationsResult> {
  const workItem = await getWorkItemWithRelations(context, cred, id);

  const allRelations = workItem.relations ?? [];
  // Filter to work item link relations only (exclude Hyperlink, AttachedFile, ArtifactLink)
  const wiRelations = allRelations.filter(
    (r) =>
      !r.rel.startsWith('AttachedFile') &&
      !r.rel.startsWith('Hyperlink') &&
      !r.rel.startsWith('ArtifactLink'),
  );

  if (wiRelations.length === 0) {
    return { workItemId: id, relations: [] };
  }

  // Fetch display names from the types API
  const types = await getWorkItemRelationTypes(context, cred);
  const typeNameMap = new Map(types.map((t) => [t.referenceName, t.name]));

  // Collect target IDs for batch title fetch
  const targetIds = wiRelations.map((r) => parseTargetId(r.url)).filter((n): n is number => n !== null);
  const titleMap = new Map<number, string>();

  if (targetIds.length > 0) {
    try {
      const batchUrl = buildBatchWorkItemsUrl(context, targetIds);
      const batchResponse = await fetchWithErrors(batchUrl.toString(), {
        headers: authHeaders(cred),
      });
      const batchBody = await readJsonResponse<AzdoBatchWorkItemsResponse>(batchResponse);
      for (const item of batchBody.value ?? []) {
        titleMap.set(item.id, item.fields['System.Title'] ?? '');
      }
    } catch {
      // Title fetch is best-effort; proceed with null titles
    }
  }

  const relations: WorkItemRelation[] = wiRelations.map((r) => {
    const targetId = parseTargetId(r.url);
    return {
      rel: r.rel,
      relName: typeNameMap.get(r.rel) ?? r.rel,
      targetId: targetId ?? 0,
      targetTitle: targetId !== null ? (titleMap.get(targetId) ?? null) : null,
      targetUrl: r.url,
      comment: r.attributes?.comment ?? null,
    };
  });

  return { workItemId: id, relations };
}
