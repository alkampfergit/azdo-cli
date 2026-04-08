/**
 * Integration tests — Read-only attachment fixture for getWorkItem.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Optional: AZDO_ATTACHMENT_ITEM_ID, AZDO_ATTACHMENT_FILENAME.
 * Run with: npm run test:integration
 *
 * Fixture defaults:
 *   work item ID 39835
 *   attachment name "_profile.png"
 *
 * Covered service functions:
 *   getWorkItem — reads attachment metadata from the prepared fixture item
 */

import { describe, expect, it } from 'vitest';
import { getWorkItem } from '../../src/services/azdo-client.js';
import {
  AZDO_ATTACHMENT_FILENAME,
  AZDO_ATTACHMENT_ITEM_ID,
  AZDO_PAT,
  SKIP_AZDO,
  makeContext,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('get-item attachments integration', () => {
  const context = makeContext();
  const pat = AZDO_PAT;
  const fixtureItemId = AZDO_ATTACHMENT_ITEM_ID;
  const fixtureFilename = AZDO_ATTACHMENT_FILENAME;

  it('returns a non-empty attachments array for the prepared fixture item', async () => {
    const item = await getWorkItem(context, fixtureItemId, pat);

    expect(item.id).toBe(fixtureItemId);
    expect(item.attachments).not.toBeNull();
    expect(item.attachments!.length).toBeGreaterThan(0);
  }, 30_000);

  it('includes the prepared attachment by filename', async () => {
    const item = await getWorkItem(context, fixtureItemId, pat);
    const attachment = item.attachments?.find((candidate) => candidate.name === fixtureFilename);

    expect(attachment).toBeDefined();
    expect(attachment?.url).toMatch(/^https:\/\/dev\.azure\.com\//);
    expect(attachment?.size).toBeGreaterThan(0);
  }, 30_000);
});
