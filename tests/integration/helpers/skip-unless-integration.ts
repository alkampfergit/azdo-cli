/**
 * True only when the caller explicitly opted into the suites that touch a real
 * OS keyring (`AZDO_INTEGRATION=1`).
 *
 * Exposed as a predicate for `describe.skipIf(...)` rather than as an aliased
 * `it` / `it.skip`, so each test file still declares its cases with a literal
 * `it(...)`. An alias hides the declaration from anything that reads the file
 * statically — vitest's own filtering, editors, and static analysis alike.
 */
export const INTEGRATION_ENABLED = process.env.AZDO_INTEGRATION === '1';
