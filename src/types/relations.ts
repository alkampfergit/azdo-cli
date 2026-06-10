// ADO API response shapes

export interface AzdoWorkItemRelationType {
  referenceName: string;
  name: string;
  attributes?: {
    usage?: string;
    enabled?: boolean;
    editable?: boolean;
    directional?: boolean;
    acyclic?: boolean;
    singleTarget?: boolean;
    topology?: string;
    isForward?: boolean;
    oppositeEndReferenceName?: string;
  };
  url?: string;
}

export interface AzdoWorkItemRelationTypeListResponse {
  value: AzdoWorkItemRelationType[];
  count?: number;
}

export interface AzdoWorkItemRelation {
  rel: string;
  url: string;
  attributes?: {
    isLocked?: boolean;
    comment?: string;
    [key: string]: unknown;
  };
}

// CLI-layer types

export interface WorkItemRelationType {
  referenceName: string;
  name: string;
  usage: 'workItemLink' | 'resourceLink' | string;
  enabled: boolean;
  directional: boolean | null;
}

export interface WorkItemRelation {
  rel: string;
  relName: string;
  targetId: number;
  targetTitle: string | null;
  targetUrl: string;
  comment: string | null;
}

export interface WorkItemRelationsResult {
  workItemId: number;
  relations: WorkItemRelation[];
}

export interface AddRelationResult {
  status: 'added' | 'already_exists';
  type: string;
  referenceName: string;
  id1: number;
  id2: number;
}

export interface RemoveRelationResult {
  status: 'removed' | 'not_found';
  type: string;
  referenceName: string;
  id1: number;
  id2: number;
}
