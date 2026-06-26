import { NodeHtmlMarkdown } from 'node-html-markdown';
import { isHtml } from './html-detect.js';

const PLT = '@@PLT@@';
const PGT = '@@PGT@@';

// Escapes bare `<`/`>` inside `<code>` elements in an HTML string before
// NodeHtmlMarkdown parses it. Without this, the HTML parser treats `<Something>`
// as an unknown tag and discards it. Uses placeholder swap to avoid
// double-encoding already-escaped entities.
function escapeAnglesInCodeElements(html: string): string {
  return html.replace(/<code([^>]*)>([\s\S]*?)<\/code>/gi, (_, attrs: string, content: string) => {
    const safe = content
      .split('&lt;').join(PLT)
      .split('&gt;').join(PGT)
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .split(PLT).join('&lt;')
      .split(PGT).join('&gt;');
    return `<code${attrs}>${safe}</code>`;
  });
}

// Escapes bare `<`/`>` inside single-backtick inline code spans in a markdown
// string before sending to ADO. ADO's markdown sanitizer strips `<Something>`
// as an unknown HTML tag; pre-escaping preserves them as `&lt;`/`&gt;`.
// Idempotent: already-escaped entities are left unchanged.
export function escapeAnglesInMarkdownCodeSpans(markdown: string): string {
  return markdown.replace(/(?<!`)`([^`\n]+)`(?!`)/g, (_, inner: string) => {
    const safe = inner
      .split('&lt;').join(PLT)
      .split('&gt;').join(PGT)
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .split(PLT).join('&lt;')
      .split(PGT).join('&gt;');
    return '`' + safe + '`';
  });
}

// Decodes `&lt;`/`&gt;` entities inside single-backtick code spans in plain
// markdown text. ADO returns pre-escaped entities as literal text; this step
// restores the original `<`/`>` characters in the output.
function decodeEntitiesInMarkdownCodeSpans(text: string): string {
  return text.replace(/(?<!`)`([^`\n]+)`(?!`)/g, (_, inner: string) => {
    const decoded = inner.replaceAll('&lt;', '<').replaceAll('&gt;', '>');
    return '`' + decoded + '`';
  });
}

// Named HTML entities that Azure DevOps may inject into stored markdown fields.
// Covers the HTML4 named entity set most likely to appear in ADO-managed content.
// &amp; is intentionally absent — it is decoded last to avoid turning &amp;gt;
// into > instead of the correct &gt;.
const ADO_NAMED_ENTITIES: Record<string, string> = {
  // HTML special characters
  lt: '<', gt: '>',
  quot: '"', apos: "'",
  // Dashes and punctuation
  mdash: '—', ndash: '–',
  hellip: '…',
  lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”',
  sbquo: '‚', bdquo: '„',
  laquo: '«', raquo: '»',
  lsaquo: '‹', rsaquo: '›',
  // Common symbols
  copy: '©', reg: '®', trade: '™',
  nbsp: ' ',
  euro: '€', pound: '£', yen: '¥', cent: '¢',
  deg: '°', plusmn: '±', times: '×', divide: '÷',
  micro: 'µ', para: '¶', middot: '·',
  frac12: '½', frac14: '¼', frac34: '¾',
  sup2: '²', sup3: '³',
  bull: '•', prime: '′', Prime: '″',
  minus: '−', asymp: '≈', ne: '≠', le: '≤', ge: '≥',
  not: '¬',
  // Arrows
  larr: '←', uarr: '↑', rarr: '→', darr: '↓',
  harr: '↔', rArr: '⇒', lArr: '⇐',
};

// Decodes HTML entities that Azure DevOps injects into stored markdown fields
// on retrieval. ADO encodes characters as HTML entities even when the field is
// stored in Markdown format — e.g. > becomes &gt;, & becomes &amp;, em dashes
// become &mdash; or numeric entities, and non-ASCII characters may use
// &#NNNN; or &#xHHHH; notation.
//
// Numeric entities cover ALL Unicode code points (including emojis like
// &#128270; for 🔎). &amp; is decoded last so that &amp;gt; correctly becomes
// &gt; rather than >, preserving intentional entity literals.
function decodeAdoEntitiesInMarkdown(text: string): string {
  return text
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => ADO_NAMED_ENTITIES[name] ?? match)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll('&amp;', '&');
}

export function htmlToMarkdown(html: string): string {
  return NodeHtmlMarkdown.translate(escapeAnglesInCodeElements(html));
}

export function toMarkdown(content: string): string {
  if (isHtml(content)) {
    return htmlToMarkdown(content);
  }
  return decodeEntitiesInMarkdownCodeSpans(decodeAdoEntitiesInMarkdown(content));
}
