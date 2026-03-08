const HTML_TAG_REGEX = /<\/?([a-z][a-z0-9]*)\b/gi;

const HTML_TAGS = new Set([
  'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'tr', 'td', 'th', 'img', 'pre', 'code',
]);

export function isHtml(content: string): boolean {
  let match: RegExpExecArray | null;
  HTML_TAG_REGEX.lastIndex = 0;
  while ((match = HTML_TAG_REGEX.exec(content)) !== null) {
    if (HTML_TAGS.has(match[1].toLowerCase())) {
      return true;
    }
  }
  return false;
}
