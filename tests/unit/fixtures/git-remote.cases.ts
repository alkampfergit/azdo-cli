// Frozen regression snapshot for FR-007 (contract C-7).
//
// These are the EXACT values the current parser returns for the five
// canonical Azure DevOps remote URL forms WITHOUT a userinfo prefix and
// WITHOUT a trailing `.git`. They are captured here before the
// userinfo/.git regex change so that the parity test can assert the change
// did not alter parsing of any pre-existing form.
//
// DO NOT regenerate these from the (post-change) parser — that would make
// the regression test tautological. If a value here ever needs to change,
// it means existing behaviour changed and the change must be justified.

import type { AzdoContext } from '../../../src/types/work-item.js';

export interface GitRemoteCase {
  label: string;
  url: string;
  context: AzdoContext;
  repo: string;
}

export const FROZEN_BASELINE: GitRemoteCase[] = [
  {
    label: 'form 1 — HTTPS current (dev.azure.com)',
    url: 'https://dev.azure.com/contoso/Widgets/_git/api',
    context: { org: 'contoso', project: 'Widgets' },
    repo: 'api',
  },
  {
    label: 'form 2 — HTTPS legacy with DefaultCollection',
    url: 'https://contoso.visualstudio.com/DefaultCollection/Widgets/_git/api',
    context: { org: 'contoso', project: 'Widgets' },
    repo: 'api',
  },
  {
    label: 'form 3 — HTTPS legacy (visualstudio.com)',
    url: 'https://contoso.visualstudio.com/Widgets/_git/api',
    context: { org: 'contoso', project: 'Widgets' },
    repo: 'api',
  },
  {
    label: 'form 4 — SSH current (ssh.dev.azure.com)',
    url: 'git@ssh.dev.azure.com:v3/contoso/Widgets/api',
    context: { org: 'contoso', project: 'Widgets' },
    repo: 'api',
  },
  {
    label: 'form 5 — SSH legacy (vs-ssh.visualstudio.com)',
    url: 'someuser@vs-ssh.visualstudio.com:v3/contoso/Widgets/api',
    context: { org: 'contoso', project: 'Widgets' },
    repo: 'api',
  },
];
