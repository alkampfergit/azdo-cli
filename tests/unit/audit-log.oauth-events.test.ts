import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendAuthAuditEvent,
  readAuditEvents,
  getAuditLogPath,
} from '../../src/services/audit-log.js';

describe('audit-log — OAuth event vocabulary (R10)', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-audit-oauth-'));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    // os.homedir() reads USERPROFILE on Windows, not HOME — set both so the
    // test's fake home is honoured regardless of platform.
    process.env.USERPROFILE = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips oauth-login-started / -success / -failed', () => {
    appendAuthAuditEvent({
      event: 'oauth-login-started',
      org: 'orgA',
      backend: 'linux-libsecret',
      flow: 'auth-code',
      clientIdSource: 'default',
    });
    appendAuthAuditEvent({
      event: 'oauth-login-success',
      org: 'orgA',
      backend: 'linux-libsecret',
      flow: 'auth-code',
      accountId: 'oid:abc',
      scope: 'vso.work offline_access',
      tokenLifetimeSec: 3600,
    });
    appendAuthAuditEvent({
      event: 'oauth-login-failed',
      org: 'orgA',
      backend: 'linux-libsecret',
      flow: 'auth-code',
      reason: 'state-mismatch',
    });

    const events = readAuditEvents();
    expect(events.map((e) => e.event)).toEqual([
      'oauth-login-started',
      'oauth-login-success',
      'oauth-login-failed',
    ]);
    expect(events[0].flow).toBe('auth-code');
    expect(events[0].clientIdSource).toBe('default');
    expect(events[1].accountId).toBe('oid:abc');
    expect(events[1].tokenLifetimeSec).toBe(3600);
    expect(events[2].reason).toBe('state-mismatch');
  });

  it('round-trips oauth-refresh-success / -failed and oauth-logout', () => {
    appendAuthAuditEvent({
      event: 'oauth-refresh-success',
      org: 'orgA',
      backend: 'linux-libsecret',
      accountId: 'oid:abc',
      tokenLifetimeSec: 3600,
    });
    appendAuthAuditEvent({
      event: 'oauth-refresh-failed',
      org: 'orgA',
      backend: 'linux-libsecret',
      accountId: 'oid:abc',
      reason: 'revoked',
    });
    appendAuthAuditEvent({
      event: 'oauth-logout',
      org: 'orgA',
      backend: 'linux-libsecret',
      accountId: 'oid:abc',
    });

    const events = readAuditEvents();
    expect(events.map((e) => e.event)).toEqual([
      'oauth-refresh-success',
      'oauth-refresh-failed',
      'oauth-logout',
    ]);
    expect(events[1].reason).toBe('revoked');
  });

  it('strips token / accessToken / refreshToken fields from any caller input (defence-in-depth)', () => {
    // Cast through unknown — the type forbids these fields, but a runtime caller could still pass them.
    appendAuthAuditEvent({
      event: 'oauth-login-success',
      org: 'orgA',
      backend: 'linux-libsecret',
      accountId: 'oid:abc',
      scope: 'vso.work',
      tokenLifetimeSec: 3600,
      // @ts-expect-error — deliberately testing runtime stripping
      accessToken: 'should-be-stripped',
      // @ts-expect-error — deliberately testing runtime stripping
      refreshToken: 'should-be-stripped',
      // @ts-expect-error — deliberately testing runtime stripping
      token: 'should-be-stripped',
      // @ts-expect-error — deliberately testing runtime stripping
      pat: 'should-be-stripped',
    } as Parameters<typeof appendAuthAuditEvent>[0]);

    const body = fs.readFileSync(getAuditLogPath(), 'utf8');
    expect(body).not.toContain('should-be-stripped');
    expect(body).toContain('"accountId":"oid:abc"');
  });
});
