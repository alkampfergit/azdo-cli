export interface WorkItemAttachment {
  name: string;
  size: number;
  url: string;
}

export interface WorkItem {
  id: number;
  rev: number;
  title: string;
  state: string;
  type: string;
  assignedTo: string | null;
  description: string | null;
  areaPath: string;
  iterationPath: string;
  url: string;
  extraFields: Record<string, string> | null;
  attachments: WorkItemAttachment[] | null;
}

export interface AzdoContext {
  org: string;
  project: string;
}

export interface AuthCredential {
  /** For PAT credentials this is the bare token; for OAuth this is the access (bearer) token. */
  pat: string;
  source: 'env' | 'credential-store' | 'prompt';
  /** Discriminator for the auth scheme. Defaults to 'pat' when omitted (legacy callers). */
  kind?: 'pat' | 'oauth';
  /** Account identifier (OAuth only) — Entra `oid` / preferred_username. Used for display + audit. */
  accountId?: string;
}

export interface CliConfig {
  org?: string;
  project?: string;
  fields?: string[];
  markdown?: boolean;
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'test';
  path: string;
  value?: string;
}

export interface UpdateResult {
  id: number;
  rev: number;
  title: string;
  fieldName: string;
  fieldValue: string | null;
}

export interface WriteResult {
  id: number;
  rev: number;
  fields: Record<string, unknown>;
}

export interface UpsertResult {
  action: 'created' | 'updated';
  id: number;
  workItemType: string;
  fields: Record<string, unknown>;
}

export interface WorkItemComment {
  id: number;
  workItemId: number;
  text: string;
  author: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  isDeleted: boolean;
}

export interface WorkItemCommentsResult {
  workItemId: number;
  count: number;
  comments: WorkItemComment[];
}

export interface AddWorkItemCommentResult {
  workItemId: number;
  commentId: number;
  text: string;
  author: string | null;
  createdAt: string | null;
  url: string | null;
}

export interface ParsedField {
  refName: string;
  value: string | null;
  op: 'set' | 'clear';
  kind: 'scalar' | 'rich-text';
}

export interface TaskDocument {
  fields: ParsedField[];
}
