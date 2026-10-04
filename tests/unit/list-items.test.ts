import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createListItemsCommand } from '../../src/commands/list-items.js';
import { buildListWiql, queryWorkItems } from '../../src/services/azdo-client.js';
import { getExitCode, getStderr, getStdout, setupProcessSpies } from './helpers/command-test-utils.js';
import { testContext as ctx, testPat as pat, makeFetchResponse, makeErrorResponse } from './helpers/api-test-utils.js';

vi.mock('../../src/services/auth.js', () => ({ requireAuthCredential: vi.fn() }));
vi.mock('../../src/services/context.js', () => ({ resolveContext: vi.fn() }));

import { requireAuthCredential } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';

function batchItem(id: number, fields: Record<string, unknown> = {}) {
  return {
    id,
    rev: 1,
    fields: {
      'System.Title': `Item ${id}`,
      'System.State': 'Active',
      'System.WorkItemType': 'Task',
      'System.TeamProject': 'testproject',
      ...fields,
    },
  };
}

describe('buildListWiql', () => {
  it('scopes to the project and orders by last change when unfiltered', () => {
    expect(buildListWiql({})).toBe(
      'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC',
    );
  });

  it('adds one clause per filter', () => {
    const wiql = buildListWiql({ state: 'Active', tag: 'ready', assignedTo: 'a@b.c', titleContains: 'login' });
    expect(wiql).toContain("[System.State] = 'Active'");
    expect(wiql).toContain("[System.Tags] CONTAINS 'ready'");
    expect(wiql).toContain("[System.AssignedTo] = 'a@b.c'");
    expect(wiql).toContain("[System.Title] CONTAINS 'login'");
  });

  it('doubles single quotes so a value cannot break out of its literal', () => {
    const wiql = buildListWiql({ titleContains: "x' OR [System.Id] > 0 --" });
    expect(wiql).toContain("CONTAINS 'x'' OR [System.Id] > 0 --'");
  });

  it('maps @me to the WIQL macro', () => {
    expect(buildListWiql({ assignedTo: '@ME' })).toContain('[System.AssignedTo] = @Me');
  });
});

describe('queryWorkItems', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs WIQL with $top then one batch read, keeping WIQL order', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchResponse({ workItems: [{ id: 7 }, { id: 3 }] }))
      .mockResolvedValueOnce(
        makeFetchResponse({
          value: [
            batchItem(3, { 'System.Tags': 'a; b', 'System.AssignedTo': { displayName: 'Alice' } }),
            batchItem(7, { 'System.Description': '<p>Hi</p>' }),
          ],
        }),
      );

    const items = await queryWorkItems(ctx, pat, { state: 'Active', top: 5 });

    expect(items.map((i) => i.id)).toEqual([7, 3]);
    expect(items[0].description).toBe('<p>Hi</p>');
    expect(items[1]).toMatchObject({ tags: ['a', 'b'], assignedTo: 'Alice', state: 'Active' });
    expect(items[1].url).toBe('https://dev.azure.com/testorg/testproject/_workitems/edit/3');

    const [wiqlUrl, wiqlInit] = vi.mocked(fetch).mock.calls[0];
    expect(String(wiqlUrl)).toContain('/_apis/wit/wiql');
    expect(String(wiqlUrl)).toContain('%24top=5');
    expect(JSON.parse(String(wiqlInit?.body)).query).toContain("[System.State] = 'Active'");
    const [batchUrl, batchInit] = vi.mocked(fetch).mock.calls[1];
    expect(String(batchUrl)).toContain('/_apis/wit/workitemsbatch');
    expect(JSON.parse(String(batchInit?.body)).ids).toEqual([7, 3]);
  });

  it('splits more than 200 ids into batches of at most 200 and keeps WIQL order', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => 1000 - i);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchResponse({ workItems: ids.map((id) => ({ id })) }))
      .mockResolvedValueOnce(makeFetchResponse({ value: ids.slice(0, 200).reverse().map((id) => batchItem(id)) }))
      .mockResolvedValueOnce(makeFetchResponse({ value: [batchItem(ids[200])] }));

    const items = await queryWorkItems(ctx, pat, { top: 201 });

    expect(fetch).toHaveBeenCalledTimes(3);
    const sent = [1, 2].map((n) => JSON.parse(String(vi.mocked(fetch).mock.calls[n][1]?.body)).ids as number[]);
    expect(sent.map((chunk) => chunk.length)).toEqual([200, 1]);
    expect(items.map((i) => i.id)).toEqual(ids);
  });

  it('skips the batch read when nothing matches', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ workItems: [] }));
    expect(await queryWorkItems(ctx, pat, { top: 5 })).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries without process-template fields when the org lacks them', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchResponse({ workItems: [{ id: 1 }] }))
      .mockResolvedValueOnce(makeErrorResponse(400, JSON.stringify({ message: "TF51535: Cannot find field 'X'." })))
      .mockResolvedValueOnce(makeFetchResponse({ value: [batchItem(1)] }));

    const items = await queryWorkItems(ctx, pat, { top: 5 });

    expect(items).toHaveLength(1);
    const retryFields = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body)).fields as string[];
    expect(retryFields).not.toContain('Microsoft.VSTS.TCM.ReproSteps');
  });

  it('surfaces auth failures from the WIQL call', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(401, '{}'));
    await expect(queryWorkItems(ctx, pat, { top: 5 })).rejects.toThrow(/^AUTH_FAILED/);
  });
});

describe('azdo list-items', () => {
  function run(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    program.addCommand(createListItemsCommand());
    return program.parseAsync(['node', 'azdo', 'list-items', ...args]);
  }

  beforeEach(() => {
    setupProcessSpies();
    vi.mocked(resolveContext).mockReturnValue(ctx);
    vi.mocked(requireAuthCredential).mockResolvedValue(pat);
    vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('--json prints the documented shape with markdown description', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchResponse({ workItems: [{ id: 9 }] }))
      .mockResolvedValueOnce(
        makeFetchResponse({
          value: [batchItem(9, { 'System.Description': '<p>Some <strong>bold</strong></p>', 'System.Tags': 'x' })],
        }),
      );

    await run('--json', '--state', 'Active');

    expect(JSON.parse(getStdout())).toEqual([
      {
        id: 9,
        title: 'Item 9',
        description: 'Some **bold**',
        url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/9',
        state: 'Active',
        tags: ['x'],
        assignedTo: null,
      },
    ]);
  });

  it('reports a 404 without naming a work item', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(404, '{}'));
    await expect(run()).rejects.toThrow('EXIT_1');
    expect(getExitCode()).toBe(1);
    expect(getStderr()).toContain('Project or resource not found in testorg/testproject');
    expect(getStderr()).not.toContain('Work item 0');
  });

  it('--json prints [] when nothing matches', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse({ workItems: [] }));
    await run('--json');
    expect(JSON.parse(getStdout())).toEqual([]);
  });

  it('rejects a bad --top before any request', async () => {
    await run('--top', '0').catch(() => undefined);
    expect(getExitCode()).toBe(1);
    expect(getStderr()).toContain('--top must be an integer');
    expect(fetch).not.toHaveBeenCalled();
  });
});
