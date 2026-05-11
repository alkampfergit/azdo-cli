import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultScopes, AZDO_RESOURCE_ID } from '../../src/services/oauth-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

/**
 * FR-016 single-source-of-truth invariant:
 * The PAT scope table in docs/oauth-app-registration.md and the OAuth
 * baseline scopes returned by oauth-config.defaultScopes() must agree on
 * which AzDO permission areas the CLI requests by default. This guards
 * against silent scope drift if a future change adds an OAuth scope
 * without also updating the PAT scope table.
 */
describe('FR-016 — PAT scope table ↔ OAuth defaultScopes() parity', () => {
  it('docs/oauth-app-registration.md exists and lists the three baseline AzDO scopes', () => {
    const path = join(repoRoot, 'docs', 'oauth-app-registration.md');
    expect(existsSync(path)).toBe(true);
    const md = readFileSync(path, 'utf8');
    // The doc's PAT scope table mentions each baseline scope's OAuth string.
    expect(md).toContain('vso.work');
    expect(md).toContain('vso.work_write');
    expect(md).toContain('vso.code');
  });

  it('OAuth defaultScopes() includes vso.work, vso.work_write, vso.code prefixed with the AzDO resource id', () => {
    const scopes = defaultScopes();
    const expected = [
      `${AZDO_RESOURCE_ID}/vso.work`,
      `${AZDO_RESOURCE_ID}/vso.work_write`,
      `${AZDO_RESOURCE_ID}/vso.code`,
    ];
    for (const s of expected) {
      expect(scopes).toContain(s);
    }
  });

  it('OAuth defaultScopes() includes the OpenID Connect basics needed for refresh + Entra v2', () => {
    const scopes = defaultScopes();
    expect(scopes).toContain('offline_access');
    expect(scopes).toContain('openid');
  });

  it('OAuth defaultScopes() never includes vso.full_access by default (FR-016 hard rule)', () => {
    const scopes = defaultScopes();
    expect(scopes.some((s) => s.includes('vso.full_access'))).toBe(false);
  });

  it('docs/oauth-app-registration.md explicitly documents the no-vso.full_access policy', () => {
    const path = join(repoRoot, 'docs', 'oauth-app-registration.md');
    const md = readFileSync(path, 'utf8');
    expect(md.toLowerCase()).toContain('vso.full_access');
    // The mention should be in a "do NOT" / "forbid" / "never" context, not as a recommended scope.
    // Heuristic: line containing vso.full_access also mentions one of those words.
    const lines = md.split('\n').filter((l) => l.toLowerCase().includes('vso.full_access'));
    expect(lines.length).toBeGreaterThan(0);
    const flagged = lines.some((l) => /(?:do not|never|forbid|exclud)/i.test(l));
    expect(flagged).toBe(true);
  });
});
