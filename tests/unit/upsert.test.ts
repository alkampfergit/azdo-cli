import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createUpsertCommand } from '../../src/commands/upsert.js';
import {
  createCommandRunner,
  getStderr,
  getStdout,
  setupProcessSpies,
} from './helpers/command-test-utils.js';

vi.mock('../../src/services/azdo-client.js', () => ({
  applyWorkItemPatch: vi.fn(),
  createWorkItem: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  resolvePat: vi.fn(),
}));

vi.mock('../../src/services/context.js', () => ({
  resolveContext: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { applyWorkItemPatch, createWorkItem } from '../../src/services/azdo-client.js';
import { resolvePat } from '../../src/services/auth.js';
import { resolveContext } from '../../src/services/context.js';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

const run = createCommandRunner(createUpsertCommand);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContext).mockReturnValue({ org: 'testorg', project: 'testproj' });
  vi.mocked(resolvePat).mockResolvedValue({ pat: 'test-pat', source: 'env' });
  vi.mocked(createWorkItem).mockResolvedValue({
    id: 101,
    rev: 1,
    fields: { 'System.Title': 'Fix login bug' },
  });
  vi.mocked(applyWorkItemPatch).mockResolvedValue({
    id: 42,
    rev: 2,
    fields: { 'System.Title': 'Fix login bug' },
  });
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue('---\nTitle: Imported task\n---\n');
  setupProcessSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('upsert command', () => {
  it('creates a task with valid inline content', async () => {
    await run(['--content', '---\nTitle: Fix login bug\n---\n']);

    expect(createWorkItem).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      'Task',
      'test-pat',
      [{ op: 'add', path: '/fields/System.Title', value: 'Fix login bug' }],
    );
    expect(getStdout()).toContain('Created task #101');
  });

  it('updates a task with valid inline content and an id', async () => {
    await run(['42', '--content', '---\nSystem.Title: Fix login bug\nstate: Active\n---\n']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      { org: 'testorg', project: 'testproj' },
      42,
      'test-pat',
      [
        { op: 'add', path: '/fields/System.Title', value: 'Fix login bug' },
        { op: 'add', path: '/fields/System.State', value: 'Active' },
      ],
    );
    expect(getStdout()).toContain('Updated task #42');
  });

  it('rejects create when title is missing', async () => {
    await run(['--content', '---\nState: Active\n---\n']);
    expect(getStderr()).toContain('Title is required when creating a task');
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it('surfaces create API errors as actionable messages', async () => {
    vi.mocked(createWorkItem).mockRejectedValue(new Error("CREATE_REJECTED: Field 'System.AreaPath' is required."));

    await run(['--content', '---\nTitle: Fix login bug\n---\n']);

    expect(getStderr()).toContain("Create rejected: Field 'System.AreaPath' is required.");
  });

  it('applies clear semantics for scalar fields on update', async () => {
    await run(['42', '--content', '---\nTitle: Fix login bug\npriority: null\n---\n']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      expect.any(Object),
      42,
      'test-pat',
      [
        { op: 'add', path: '/fields/System.Title', value: 'Fix login bug' },
        { op: 'remove', path: '/fields/Microsoft.VSTS.Common.Priority' },
      ],
    );
  });

  it('outputs json for create operations', async () => {
    await run(['--content', '---\nTitle: Fix login bug\nstate: Active\n---\n', '--json']);

    expect(getStdout()).toBe(
      `${JSON.stringify({
        action: 'created',
        id: 101,
        fields: {
          'System.Title': 'Fix login bug',
          'System.State': 'Active',
        },
      })}\n`,
    );
  });

  it('accepts raw Azure DevOps reference names in inline content', async () => {
    await run(['--content', '---\nSystem.Title: Fix login bug\n---\n']);

    expect(createWorkItem).toHaveBeenCalledWith(
      expect.any(Object),
      'Task',
      'test-pat',
      [{ op: 'add', path: '/fields/System.Title', value: 'Fix login bug' }],
    );
  });

  it('applies scalar and rich-text fields in one update call', async () => {
    await run([
      '42',
      '--content',
      '---\nTitle: Fix login bug\n---\n\n## Description\nBody\n\n## Acceptance Criteria\n- [ ] done\n',
      '--json',
    ]);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      expect.any(Object),
      42,
      'test-pat',
      [
        { op: 'add', path: '/fields/System.Title', value: 'Fix login bug' },
        { op: 'add', path: '/fields/System.Description', value: 'Body' },
        {
          op: 'add',
          path: '/multilineFieldsFormat/System.Description',
          value: 'Markdown',
        },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
          value: '- [ ] done',
        },
        {
          op: 'add',
          path: '/multilineFieldsFormat/Microsoft.VSTS.Common.AcceptanceCriteria',
          value: 'Markdown',
        },
      ],
    );
    expect(getStdout()).toBe(
      `${JSON.stringify({
        action: 'updated',
        id: 42,
        fields: {
          'System.Title': 'Fix login bug',
          'System.Description': 'Body',
          'Microsoft.VSTS.Common.AcceptanceCriteria': '- [ ] done',
        },
      })}\n`,
    );
  });

  it('clears rich-text fields with empty markdown sections', async () => {
    await run(['42', '--content', '## Description\n   \n']);

    expect(applyWorkItemPatch).toHaveBeenCalledWith(
      expect.any(Object),
      42,
      'test-pat',
      [{ op: 'remove', path: '/fields/System.Description' }],
    );
  });

  it('loads content from file and deletes the file after success', async () => {
    await run(['--file', './task.md']);

    expect(readFileSync).toHaveBeenCalledWith('./task.md', 'utf-8');
    expect(unlinkSync).toHaveBeenCalledWith('./task.md');
  });

  it('preserves the file when upsert fails', async () => {
    vi.mocked(createWorkItem).mockRejectedValue(new Error('HTTP_500'));

    await run(['--file', './task.md']);

    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('rejects --file and --content together', async () => {
    await run(['--file', './task.md', '--content', '---\nTitle: Fix login bug\n---\n']);
    expect(getStderr()).toContain('provide exactly one of --content or --file');
  });

  it('rejects missing file paths before any API call', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await run(['--file', './missing.md']);

    expect(getStderr()).toContain('File not found: ./missing.md');
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it('rejects unreadable files before any API call', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    await run(['--file', './task.md']);

    expect(getStderr()).toContain('Cannot read file: ./task.md');
    expect(createWorkItem).not.toHaveBeenCalled();
  });

  it('warns when file cleanup fails after a successful upsert', async () => {
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('EPERM');
    });

    await run(['--file', './task.md']);

    expect(getStdout()).toContain('Created task #101');
    expect(getStderr()).toContain('could not delete source file');
  });
});
