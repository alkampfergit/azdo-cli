/**
 * Integration tests — Generic type argument fidelity in markdown fields.
 *
 * Reproduces issue #74: set-md-field / get-md-field strips `<...>` generic
 * type arguments inside inline code spans during the markdown → ADO → markdown
 * round trip.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * What these tests prove:
 *   1. Uploading markdown with `multilineFieldsFormat: Markdown` and then
 *      reading back the field value must preserve angle-bracket content inside
 *      backtick code spans.
 *   2. The raw HTML returned by ADO must survive the toMarkdown() conversion
 *      with angle brackets intact.
 *   3. The fix must be idempotent: fields with no generics must be unaffected.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createWorkItem,
  getWorkItemFieldValue,
  updateWorkItem,
} from '../../src/services/azdo-client.js';
import { escapeAnglesInMarkdownCodeSpans, toMarkdown } from '../../src/services/md-convert.js';
import {
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('md-fields — generic type argument fidelity (issue #74)', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  let createdId: number;

  // ── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const result = await createWorkItem(context, 'Task', pat, [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: testItemTitle('md-generic-types: generic type arg round-trip'),
      },
    ]);
    createdId = result.id;
  }, 30_000);

  // ── Teardown ─────────────────────────────────────────────────────────────

  afterAll(async () => {
    if (!createdId) return;
    for (const state of ['Done', 'Closed', 'Resolved']) {
      try {
        await applyWorkItemPatch(context, createdId, pat, [
          { op: 'add', path: '/fields/System.State', value: state },
        ]);
        break;
      } catch { /* try next */ }
    }
  });

  // ── Helper ───────────────────────────────────────────────────────────────

  async function roundTrip(markdown: string): Promise<string> {
    const safeContent = escapeAnglesInMarkdownCodeSpans(markdown);
    await updateWorkItem(context, createdId, pat, 'System.Description', [
      { op: 'add', path: '/fields/System.Description', value: safeContent },
      { op: 'add', path: '/multilineFieldsFormat/System.Description', value: 'Markdown' },
    ]);
    const raw = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
    return toMarkdown(raw ?? '');
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  // Each row is markdown in, the substring that must survive the round trip
  // out. The regression this pins: before the fix, `Task<HealthCheckResult>`
  // came back as `Task`, with the generic argument eaten as an HTML tag.
  const genericCases: Array<{ label: string; md: string; expected: string }> = [
    {
      label: 'a single generic type argument in a code span',
      md: 'Signature: `Task<HealthCheckResult>`',
      expected: 'Task<HealthCheckResult>',
    },
    {
      label: 'nested generic type arguments in a code span',
      md: 'Return type: `Func<Task<HealthCheckResult>>`',
      expected: 'Func<Task<HealthCheckResult>>',
    },
    {
      label: 'multiple type parameters in a code span',
      md: 'Collection: `IReadOnlyList<IDocumentStore2Job>`',
      expected: 'IReadOnlyList<IDocumentStore2Job>',
    },
    {
      label: 'multiple type params (two-param generic)',
      md: 'Map: `Dictionary<TKey, TValue>`',
      expected: 'Dictionary<TKey, TValue>',
    },
    {
      label: 'a code-only generic (no surrounding text)',
      md: '`Action<T>`',
      expected: 'Action<T>',
    },
  ];

  it.each(genericCases)('preserves $label', async ({ md, expected }) => {
    const result = await roundTrip(md);

    expect(result).toContain(expected);
  }, 20_000);

  it('preserves content outside code spans unchanged (no regression)', async () => {
    const md = '## Summary\n\nBold **word** and _italic_ word.\n\n- item one\n- item two';
    const result = await roundTrip(md);

    expect(result).toContain('Summary');
    expect(result).toContain('word');
    expect(result).toContain('item one');
    expect(result).toContain('item two');
  }, 20_000);

  it('preserves mixed content: generics inside code plus surrounding prose', async () => {
    const md = [
      '## Method signature',
      '',
      'The method `GetHealthCheckAsync(bool force = false)` returns `Task<HealthCheckResult>`.',
      '',
      'The field `_converters` is of type `IReadOnlyList<IDocumentStore2Job>`.',
    ].join('\n');

    const result = await roundTrip(md);

    expect(result).toContain('Task<HealthCheckResult>');
    expect(result).toContain('IReadOnlyList<IDocumentStore2Job>');
    expect(result).toContain('GetHealthCheckAsync');
  }, 20_000);
});
