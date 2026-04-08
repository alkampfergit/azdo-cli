/**
 * Integration tests — Markdown field operations.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Lifecycle:
 *   beforeAll — creates one Task work item tagged "[azdo-cli-test]"
 *   afterAll  — attempts to close the created item (best-effort)
 *
 * Covered service functions (via azdo-client):
 *   updateWorkItem   — sets a rich-text field using the Markdown format hint
 *   getWorkItemFieldValue — reads back the stored value
 *
 * Also exercises:
 *   toMarkdown (md-convert) — HTML → Markdown conversion on real API data
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createWorkItem,
  getWorkItemFieldValue,
  updateWorkItem,
} from '../../src/services/azdo-client.js';
import { htmlToMarkdown, toMarkdown } from '../../src/services/md-convert.js';
import { isHtml } from '../../src/services/html-detect.js';
import {
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
  testItemTitle,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('md-fields integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  let createdId: number;

  // ── Setup ────────────────────────────────────────────────────────────────

  // Azure DevOps API calls can exceed Vitest's default hook timeout in CI.
  beforeAll(async () => {
    const result = await createWorkItem(context, 'Task', pat, [
      { op: 'add', path: '/fields/System.Title', value: testItemTitle('md-fields: HTML and Markdown field round-trip tests') },
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

  // ── Setting a markdown field ──────────────────────────────────────────────

  describe('updateWorkItem with markdown content', () => {
    const markdownContent = '## Overview\n\nThis is **bold** and _italic_ text.\n\n- item one\n- item two';

    it('accepts markdown content for System.Description and returns an UpdateResult', async () => {
      const result = await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: markdownContent },
        { op: 'add', path: '/multilineFieldsFormat/System.Description', value: 'Markdown' },
      ]);

      expect(result.id).toBe(createdId);
      expect(result.fieldName).toBe('System.Description');
      expect(result.rev).toBeGreaterThan(0);
    });

    it('returns the stored content in subsequent getWorkItemFieldValue calls', async () => {
      // Write
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: markdownContent },
        { op: 'add', path: '/multilineFieldsFormat/System.Description', value: 'Markdown' },
      ]);

      // Read back
      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      expect(value).not.toBeNull();
      expect(value!.length).toBeGreaterThan(0);
    });
  });

  // ── Setting an HTML field ─────────────────────────────────────────────────

  describe('updateWorkItem with HTML content', () => {
    const htmlContent = '<h2>Overview</h2><p>This is <strong>bold</strong> and <em>italic</em> text.</p><ul><li>item one</li><li>item two</li></ul>';

    it('accepts HTML content for System.Description', async () => {
      const result = await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: htmlContent },
      ]);

      expect(result.id).toBe(createdId);
      expect(result.fieldName).toBe('System.Description');
    });

    it('returns content that can be converted to markdown without error', async () => {
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: htmlContent },
      ]);

      const raw = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      expect(raw).not.toBeNull();

      // toMarkdown must not throw even on real AzDo-transformed HTML.
      const md = toMarkdown(raw!);
      expect(md).toBeTypeOf('string');
      expect(md.length).toBeGreaterThan(0);
    }, 15_000);

    it('converted markdown contains recognisable heading text', async () => {
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: '<h2>UniqueHeading</h2><p>body</p>' },
      ]);

      const raw = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      const md = toMarkdown(raw!);
      expect(md).toContain('UniqueHeading');
    });

    it('converted markdown contains list items', async () => {
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: '<ul><li>alpha</li><li>beta</li></ul>' },
      ]);

      const raw = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      const md = toMarkdown(raw!);
      expect(md).toContain('alpha');
      expect(md).toContain('beta');
    });
  });

  // ── isHtml detection on real API data ──────────────────────────────────────

  describe('isHtml on real Azure DevOps field values', () => {
    it('detects HTML content returned by the API after setting an HTML field', async () => {
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: '<p>HTML content</p>' },
      ]);

      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      expect(value).not.toBeNull();
      expect(isHtml(value!)).toBe(true);
    });

    it('htmlToMarkdown converts real API HTML to clean markdown', async () => {
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: '<h2>Heading</h2><p>Paragraph with <strong>bold</strong>.</p>' },
      ]);

      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      const md = htmlToMarkdown(value!);
      expect(md).toContain('Heading');
      expect(md).toContain('bold');
      expect(md).not.toContain('<p>');
    });
  });

  // ── Clearing a field ──────────────────────────────────────────────────────

  describe('clearing System.Description', () => {
    it('returns null from getWorkItemFieldValue after the field is removed', async () => {
      // First write a value.
      await updateWorkItem(context, createdId, pat, 'System.Description', [
        { op: 'add', path: '/fields/System.Description', value: '<p>temporary</p>' },
      ]);

      // Then remove it.
      await applyWorkItemPatch(context, createdId, pat, [
        { op: 'remove', path: '/fields/System.Description' },
      ]);

      const value = await getWorkItemFieldValue(context, createdId, pat, 'System.Description');
      expect(value).toBeNull();
    });
  });
});
