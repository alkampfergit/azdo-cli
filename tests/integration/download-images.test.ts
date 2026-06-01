/**
 * Integration tests — downloading images embedded in a work item's rich-text field.
 *
 * Requires: AZDO_PAT, AZDO_ORG, AZDO_PROJECT environment variables.
 * Run with: npm run test:integration
 *
 * Uses a real work item that contains an embedded image in its rich-text field.
 * Defaults to work item 41748 / System.Description (override with
 * AZDO_IMAGE_ITEM_ID and AZDO_IMAGE_FIELD). The test is read-only — it does not
 * create or modify any work item.
 *
 * Covered:
 *   getWorkItemFieldValue       — reads the raw field content from the live API
 *   extractImageReferences      — finds embedded ADO attachment images
 *   downloadImagesFromFields    — downloads (and optionally resizes) them to disk
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import type { AuthCredential } from '../../src/types/work-item.js';
import { getWorkItemFieldValue } from '../../src/services/azdo-client.js';
import {
  extractImageReferences,
  downloadImagesFromFields,
} from '../../src/services/image-download.js';
import {
  AZDO_PAT,
  AZDO_IMAGE_ITEM_ID,
  AZDO_IMAGE_FIELD,
  SKIP_AZDO,
  makeContext,
} from './helpers/integration-utils.js';

describe.skipIf(SKIP_AZDO)('download-images integration', () => {
  const context = makeContext();
  const credential: AuthCredential = { pat: AZDO_PAT, source: 'env', kind: 'pat' };
  let dir: string;
  let fieldContent: string | null;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'azdo-img-int-'));
    fieldContent = await getWorkItemFieldValue(context, AZDO_IMAGE_ITEM_ID, credential, AZDO_IMAGE_FIELD);
  }, 30_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it(`finds at least one embedded image in WI ${AZDO_IMAGE_ITEM_ID} ${AZDO_IMAGE_FIELD}`, () => {
    expect(fieldContent).not.toBeNull();
    const refs = extractImageReferences(fieldContent!, AZDO_IMAGE_FIELD);
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('downloads the embedded image(s) to disk as valid image files', async () => {
    const results = await downloadImagesFromFields(
      [{ content: fieldContent ?? '', field: AZDO_IMAGE_FIELD }],
      { workItemId: AZDO_IMAGE_ITEM_ID, options: { enabled: true, outputDir: dir } },
      credential,
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    const saved = results.filter((r) => r.path && !r.error);
    expect(saved.length).toBeGreaterThanOrEqual(1);

    // Each saved file must be a readable image.
    for (const result of saved) {
      const image = await Jimp.read(readFileSync(result.path!));
      expect(image.bitmap.width).toBeGreaterThan(0);
      expect(image.bitmap.height).toBeGreaterThan(0);
    }
  }, 30_000);

  it('resizes the embedded image to the requested max width as PNG', async () => {
    const maxWidth = 256;
    const results = await downloadImagesFromFields(
      [{ content: fieldContent ?? '', field: AZDO_IMAGE_FIELD }],
      { workItemId: AZDO_IMAGE_ITEM_ID, options: { enabled: true, maxWidth, outputDir: dir } },
      credential,
    );

    const saved = results.filter((r) => r.path && !r.error);
    expect(saved.length).toBeGreaterThanOrEqual(1);

    for (const result of saved) {
      expect(result.format).toBe('png');
      const image = await Jimp.read(readFileSync(result.path!));
      expect(image.bitmap.width).toBeLessThanOrEqual(maxWidth);
    }
  }, 30_000);
});
