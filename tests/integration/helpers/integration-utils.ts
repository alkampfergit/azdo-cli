/**
 * Shared utilities for Azure DevOps integration tests.
 *
 * Variables are resolved in this order:
 *   1. Process environment (already exported in the shell)
 *   2. A `.env` file in the parent directory of the repo (../  relative to
 *      the project root), e.g. /workspaces/.env when the repo lives at
 *      /workspaces/azdo-cli.
 *
 * Required variables:
 *   AZDO_PAT  (or AZDO_PATH)  — Personal Access Token
 *   AZDO_ORG                  — Azure DevOps organization name
 *   AZDO_PROJECT              — Azure DevOps project name
 *
 * Optional variables:
 *   AZDO_REPO    — Repository name; required for pull-request tests
 *   AZDO_PR_ID   — An existing pull request ID for thread/comment tests
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AzdoContext } from '../../../src/types/work-item.js';

// ── .env loader ──────────────────────────────────────────────────────────────

function loadDotEnv(): void {
  // Project root is three levels up from this file
  // (helpers/ → integration/ → tests/ → project root)
  const projectRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
  const dotEnvPath = resolve(projectRoot, '.env');

  if (!existsSync(dotEnvPath)) return;

  const lines = readFileSync(dotEnvPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Only set if not already present in the environment.
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

// ── Credential resolution ─────────────────────────────────────────────────────

// Support both AZDO_PAT (canonical) and AZDO_PATH (legacy alias).
function resolvePat(): string {
  return process.env.AZDO_PAT ?? process.env.AZDO_PATH ?? '';
}

export const AZDO_PAT = resolvePat().trim();
export const AZDO_ORG = (process.env.AZDO_ORG ?? '').trim();
export const AZDO_PROJECT = (process.env.AZDO_PROJECT ?? '').trim();
export const AZDO_REPO = (process.env.AZDO_REPO ?? '').trim();
export const AZDO_PR_ID = process.env.AZDO_PR_ID ? Number(process.env.AZDO_PR_ID.trim()) : null;

/** True when the mandatory env vars are missing — use with describe.skipIf. */
export const SKIP_AZDO = !AZDO_PAT || !AZDO_ORG || !AZDO_PROJECT;

/** True when pull-request tests cannot run (missing repo name). */
export const SKIP_PR = SKIP_AZDO || !AZDO_REPO;

/** Build an AzdoContext from environment variables. */
export function makeContext(): AzdoContext {
  return { org: AZDO_ORG, project: AZDO_PROJECT };
}

/**
 * Generate a unique test item title that is easy to identify
 * if cleanup ever fails.
 */
export function testItemTitle(label = ''): string {
  const suffix = label ? ` — ${label}` : '';
  return `[azdo-cli-test] Integration Test ${Date.now()}${suffix}`;
}
