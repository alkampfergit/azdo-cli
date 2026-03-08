import { NodeHtmlMarkdown } from 'node-html-markdown';
import { isHtml } from './html-detect.js';

export function htmlToMarkdown(html: string): string {
  return NodeHtmlMarkdown.translate(html);
}

export function toMarkdown(content: string): string {
  if (isHtml(content)) {
    return htmlToMarkdown(content);
  }
  return content;
}
