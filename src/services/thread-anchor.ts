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
// slashes and one leading `/`. A leading `./` is dropped. Returns null when
// nothing is left (e.g. `./` or `/`).
export function normalizeThreadFilePath(raw: string): string | null {
  let path = raw.trim().replaceAll('\\', '/');
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

// `pullRequestThreadContext` comparing the first iteration with the latest,
// which is the "all changes" view of the Files tab.
export function buildPullRequestThreadContext(
  iterationId: number,
  changeTrackingId: number | undefined,
): PullRequestThreadContext {
  const context: PullRequestThreadContext = {
    iterationContext: { firstComparingIteration: 1, secondComparingIteration: iterationId },
  };
  if (changeTrackingId !== undefined) {
    context.changeTrackingId = changeTrackingId;
  }
  return context;
}

// Finds the change entry for `filePath` (already normalised) and returns its
// tracking id. The left side also matches a rename's `originalPath`, because
// that is the path the old version of the file had.
export function findChangeTrackingId(
  changes: AzdoPullRequestChange[],
  filePath: string,
  side: ThreadAnchorSide,
): number | undefined {
  const match =
    changes.find((change) => change.item?.path === filePath) ??
    (side === 'left' ? changes.find((change) => change.originalPath === filePath) : undefined);
  return match?.changeTrackingId;
}
