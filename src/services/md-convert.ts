import { NodeHtmlMarkdown } from 'node-html-markdown';
import { isHtml } from './html-detect.js';

// Escapes bare `<`/`>` inside `<code>` elements in an HTML string before
// NodeHtmlMarkdown parses it. Without this, the HTML parser treats `<Something>`
// as an unknown tag and discards it. Uses placeholder swap to avoid
// double-encoding already-escaped entities.
const PLT = '@@PLT@@';
const PGT = '@@PGT@@';

function escapeAnglesInCodeElements(html: string): string {
  return html.replace(/<code([^>]*)>([\s\S]*?)<\/code>/gi, (_, attrs: string, content: string) => {
    const safe = content
      .split('&lt;').join(PLT)
      .split('&gt;').join(PGT)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
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
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
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
    const decoded = inner.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return '`' + decoded + '`';
  });
}

export function htmlToMarkdown(html: string): string {
  return NodeHtmlMarkdown.translate(escapeAnglesInCodeElements(html));
}

export function toMarkdown(content: string): string {
  if (isHtml(content)) {
    return htmlToMarkdown(content);
  }
  return decodeEntitiesInMarkdownCodeSpans(content);
}
