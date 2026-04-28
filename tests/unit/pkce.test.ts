import { describe, expect, it } from 'vitest';
import { challengeForVerifier, generateVerifier, randomState, CODE_CHALLENGE_METHOD } from '../../src/lib/pkce.js';
import { createHash } from 'node:crypto';

const BASE64URL_NO_PAD = /^[A-Za-z0-9_-]+$/;

describe('lib/pkce — RFC 7636 helpers', () => {
  it('generates a base64url no-pad verifier of valid length (43–128 chars by default 32-byte source)', () => {
    const v = generateVerifier();
    expect(v).toMatch(BASE64URL_NO_PAD);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('challenge equals BASE64URL(SHA-256(verifier))', () => {
    const v = 'fixed-verifier-for-testing-purposes-not-secret';
    const expected = createHash('sha256').update(v, 'ascii').digest('base64')
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(challengeForVerifier(v)).toBe(expected);
  });

  it('challenge method is always S256', () => {
    expect(CODE_CHALLENGE_METHOD).toBe('S256');
  });

  it('verifier randomness — 1000 iterations, all distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateVerifier());
    }
    expect(seen.size).toBe(1000);
  });

  it('state is base64url no-pad and at least 16 chars', () => {
    const s = randomState();
    expect(s).toMatch(BASE64URL_NO_PAD);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it('state randomness — 1000 iterations, all distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(randomState());
    }
    expect(seen.size).toBe(1000);
  });

  it('rejects invalid byte lengths', () => {
    expect(() => generateVerifier(8)).toThrow();
    expect(() => generateVerifier(200)).toThrow();
    expect(() => randomState(4)).toThrow();
    expect(() => randomState(200)).toThrow();
  });
});
