import type {
  AzdoPullRequestChange,
  PullRequestThreadContext,
  ThreadAnchorContext,
  ThreadAnchorSide,
} from '../types/pull-request.js';

// End offset of an anchored range. The real line length is unknown without
// fetching the file; Azure DevOps clamps an offset past the end of the line,
// so a large value highlights the whole last line.
export const LINE_END_OFFSET = 1000;

// Turns a repo-relative path into the form the threads API expects: forward
// slashes and one leading `/`. A leading `./` is dropped. Whitespace is kept,
// because it can be part of a real file name. Returns null for blank input or
// when nothing is left (e.g. `./` or `/`).
export function normalizeThreadFilePath(raw: string): string | null {
  if (raw.trim() === '') {
    return null;
  }
  let path = raw.replaceAll('\\', '/');
  while (path.startsWith('./')) {
    path = path.slice(2);
  }
  path = path.replace(/^\/+/, '');
  return path === '' ? null : `/${path}`;
}

// `threadContext` for a thread on lines `line`..`endLine` (1-based, inclusive)
// of one side of the diff.
export function buildThreadAnchorContext(
  filePath: string,
  line: number,
  endLine: number,
  side: ThreadAnchorSide,
): ThreadAnchorContext {
  const start = { line, offset: 1 };
  const end = { line: endLine, offset: LINE_END_OFFSET };
  return side === 'right'
    ? { filePath, rightFileStart: start, rightFileEnd: end }
    : { filePath, leftFileStart: start, leftFileEnd: end };
}

// `pullRequestThreadContext` on the latest iteration compared with itself. With
// both ends equal, the left side is the common-commit base, the same baseline
// the iteration changes (and so `changeTrackingId`) are computed against.
export function buildPullRequestThreadContext(
  iterationId: number,
  changeTrackingId: number | undefined,
): PullRequestThreadContext {
  const context: PullRequestThreadContext = {
    iterationContext: { firstComparingIteration: iterationId, secondComparingIteration: iterationId },
  };
  if (changeTrackingId !== undefined) {
    context.changeTrackingId = changeTrackingId;
  }
  return context;
}

// Finds the change entry for `filePath` (already normalised) and returns its
// tracking id. The left side matches a rename's `originalPath` first, because
// that is the path the old version of the file had; a new file may reuse it.
export function findChangeTrackingId(
  changes: AzdoPullRequestChange[],
  filePath: string,
  side: ThreadAnchorSide,
): number | undefined {
  const byPath = (change: AzdoPullRequestChange): boolean => change.item?.path === filePath;
  const match =
    side === 'left'
      ? (changes.find((change) => change.originalPath === filePath) ?? changes.find(byPath))
      : changes.find(byPath);
  return match?.changeTrackingId;
}
