import { createHash, randomBytes } from 'node:crypto';

function base64urlNoPad(buf: Buffer): string {
  // Node 16+ supports the 'base64url' encoding which already produces the
  // unreserved-character form with no padding required by RFC 4648 §5.
  return buf.toString('base64url');
}

/**
 * RFC 7636 §4.1: code_verifier = high-entropy cryptographic random string
 * using the unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * with a minimum length of 43 and a maximum length of 128.
 *
 * 32 random bytes base64url-encoded gives a 43-character verifier that
 * satisfies the spec.
 */
export function generateVerifier(byteLen = 32): string {
  if (byteLen < 32 || byteLen > 96) {
    throw new RangeError('verifier byte length must be in [32, 96]');
  }
  return base64urlNoPad(randomBytes(byteLen));
}

/**
 * RFC 7636 §4.2: code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier))).
 * code_challenge_method is always 'S256' for this CLI.
 */
export function challengeForVerifier(verifier: string): string {
  return base64urlNoPad(createHash('sha256').update(verifier, 'ascii').digest());
}

/**
 * 16 random bytes base64url-encoded — used as the OAuth `state` parameter to
 * bind the callback to the originating session per FR-013a.
 */
export function randomState(byteLen = 16): string {
  if (byteLen < 12 || byteLen > 64) {
    throw new RangeError('state byte length must be in [12, 64]');
  }
  return base64urlNoPad(randomBytes(byteLen));
}

export const CODE_CHALLENGE_METHOD = 'S256' as const;
