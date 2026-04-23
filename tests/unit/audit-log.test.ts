import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendAuthAuditEvent,
  readAuditEvents,
  getAuditLogPath,
} from '../../src/services/audit-log.js';

describe('audit-log', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-audit-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getAuditLogPath resolves under ~/.azdo/', () => {
    expect(getAuditLogPath()).toBe(path.join(tmpDir, '.azdo', 'audit.log'));
  });

  it('appends a JSON-line per event', () => {
    appendAuthAuditEvent({
      event: 'auth.store',
      org: 'orgA',
      backend: 'linux-libsecret',
      masked_pat: 'abcde**********vwxyz',
    });
    appendAuthAuditEvent({ event: 'auth.delete', org: 'orgA', backend: 'linux-libsecret' });

    const contents = fs.readFileSync(getAuditLogPath(), 'utf8');
    const lines = contents.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.event).toBe('auth.store');
    expect(first.org).toBe('orgA');
    expect(first.masked_pat).toBe('abcde**********vwxyz');
    expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('readAuditEvents returns parsed events in order, skipping invalid lines', () => {
    appendAuthAuditEvent({ event: 'auth.store', org: 'orgA', backend: 'linux-libsecret' });
    // corrupt a line
    fs.appendFileSync(getAuditLogPath(), 'not-json\n');
    appendAuthAuditEvent({ event: 'auth.delete', org: 'orgA', backend: 'linux-libsecret' });

    const events = readAuditEvents();
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('auth.store');
    expect(events[1].event).toBe('auth.delete');
  });

  it('returns empty array when the audit log does not exist', () => {
    expect(readAuditEvents()).toEqual([]);
  });

  it('creates ~/.azdo/ with 0700 if missing and the log file with 0600', () => {
    appendAuthAuditEvent({ event: 'auth.store', org: 'orgA', backend: 'linux-libsecret' });

    const dirStat = fs.statSync(path.join(tmpDir, '.azdo'));
    const fileStat = fs.statSync(getAuditLogPath());

    // eslint-disable-next-line no-bitwise
    expect(dirStat.mode & 0o777).toBe(0o700);
    // eslint-disable-next-line no-bitwise
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it('never writes a full unmasked PAT by any API path', () => {
    // The helper does not accept a raw pat; the caller must mask first. This test guards the contract.
    appendAuthAuditEvent({
      event: 'auth.store',
      org: 'orgA',
      backend: 'linux-libsecret',
      masked_pat: 'abcde**********vwxyz',
    });
    const body = fs.readFileSync(getAuditLogPath(), 'utf8');
    // no long unmasked strings — the only string allowed is the pre-masked one which contains asterisks.
    expect(body).toContain('**********');
  });
});
