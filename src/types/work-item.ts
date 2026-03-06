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
}

export interface AzdoContext {
  org: string;
  project: string;
}

export interface AuthCredential {
  pat: string;
  source: 'env' | 'credential-store' | 'prompt';
}

export interface CliConfig {
  org?: string;
  project?: string;
  fields?: string[];
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
