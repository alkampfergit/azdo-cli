const VISIBLE_CHARS = 5;

export function maskedDisplay(pat: string): string {
  if (pat.length <= VISIBLE_CHARS * 2) {
    return pat;
  }
  const hiddenCount = pat.length - VISIBLE_CHARS * 2;
  return pat.slice(0, VISIBLE_CHARS) + '*'.repeat(hiddenCount) + pat.slice(-VISIBLE_CHARS);
}

export function normalizePat(rawPat: string): string | null {
  const trimmedPat = rawPat.trim();
  return trimmedPat.length > 0 ? trimmedPat : null;
}
