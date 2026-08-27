/**
 * Integration tests — Work Item Attachment Create/Delete.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Lifecycle:
 *   beforeAll — creates one scratch Task work item tagged "[azdo-cli-test]"
 *   afterAll  — attempts to close/resolve the created item (best-effort)
 *
 * Covered service functions:
 *   createAttachment, findAttachmentRelations, applyWorkItemPatch, getWorkItem
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyWorkItemPatch,
  createAttachment,
  createWorkItem,
  findAttachmentRelations,
  getWorkItem,
} from '../../src/services/azdo-client.js';
import { AZDO_PAT, SKIP_AZDO, makeContext, testItemTitle } from './helpers/integration-utils.js';
import type { AuthCredential } from '../../src/types/work-item.js';

describe.skipIf(SKIP_AZDO)('work item attachments integration', () => {
  const context = makeContext();
  const cred: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };
  const title = testItemTitle('work-item-attachments: attach/delete round trip');
  let workItemId: number;

  beforeAll(async () => {
    const result = await createWorkItem(context, 'Task', cred, [
      { op: 'add', path: '/fields/System.Title', value: title },
    ]);
    workItemId = result.id;
  }, 30_000);

  afterAll(async () => {
    if (!workItemId) return;
    for (const state of ['Done', 'Closed', 'Resolved']) {
      try {
        await applyWorkItemPatch(context, workItemId, cred, [
          { op: 'add', path: '/fields/System.State', value: state },
        ]);
        break;
      } catch {
        // Try next state name.
      }
    }
  });

  it('attaches a file, verifies it via getWorkItem, then deletes it', async () => {
    const content = Buffer.from('azdo-cli integration test attachment');
    const attachment = await createAttachment(context, 'round-trip.txt', content, cred);
    expect(attachment.id).toMatch(/^[0-9a-f-]{36}$/i);

    await applyWorkItemPatch(context, workItemId, cred, [
      { op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: attachment.url } },
    ]);

    const withAttachment = await getWorkItem(context, workItemId, cred);
    const found = withAttachment.attachments?.find((a) => a.id === attachment.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('round-trip.txt');
    expect(found?.size).toBe(content.length);

    const matches = await findAttachmentRelations(context, workItemId, cred, 'round-trip.txt');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(attachment.id);

    await applyWorkItemPatch(context, workItemId, cred, [
      { op: 'remove', path: `/relations/${matches[0].index}` },
    ]);

    const afterDelete = await getWorkItem(context, workItemId, cred);
    expect(afterDelete.attachments?.some((a) => a.id === attachment.id)).not.toBe(true);
  }, 60_000);

  it('disambiguates two attachments sharing a filename via --id-equivalent lookup', async () => {
    const first = await createAttachment(context, 'shared-name.txt', Buffer.from('first'), cred);
    const second = await createAttachment(context, 'shared-name.txt', Buffer.from('second'), cred);

    await applyWorkItemPatch(context, workItemId, cred, [
      { op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: first.url } },
    ]);
    await applyWorkItemPatch(context, workItemId, cred, [
      { op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: second.url } },
    ]);

    const matches = await findAttachmentRelations(context, workItemId, cred, 'shared-name.txt');
    expect(matches).toHaveLength(2);
    const ids = matches.map((m) => m.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);

    const target = matches.find((m) => m.id === second.id)!;
    await applyWorkItemPatch(context, workItemId, cred, [
      { op: 'remove', path: `/relations/${target.index}` },
    ]);

    const remaining = await findAttachmentRelations(context, workItemId, cred, 'shared-name.txt');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
  }, 60_000);
});
