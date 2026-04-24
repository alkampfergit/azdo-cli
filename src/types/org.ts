export type OrgSource = 'flag' | 'git' | 'config';

export interface ResolvedOrg {
  org: string;
  source: OrgSource;
}

export interface ResolveOrgOptions {
  org?: string;
  readConfig?: () => { org?: string };
  detectFromGit?: () => string | null;
}
