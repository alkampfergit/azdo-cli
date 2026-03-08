import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, toMarkdown } from '../../src/services/md-convert.js';

describe('htmlToMarkdown', () => {
  it('converts <strong> to markdown bold', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toContain('**bold**');
  });

  it('converts <em> to markdown italic', () => {
    expect(htmlToMarkdown('<em>italic</em>')).toContain('_italic_');
  });

  it('converts <a> to markdown link', () => {
    const result = htmlToMarkdown('<a href="http://example.com">link</a>');
    expect(result).toContain('[link](http://example.com)');
  });

  it('converts headings to markdown headings', () => {
    expect(htmlToMarkdown('<h3>Title</h3>')).toContain('### Title');
  });

  it('converts <ul>/<li> to markdown list', () => {
    const result = htmlToMarkdown('<ul><li>a</li><li>b</li></ul>');
    expect(result).toContain('* a');
    expect(result).toContain('* b');
  });

  it('converts <ol>/<li> to numbered list', () => {
    const result = htmlToMarkdown('<ol><li>first</li><li>second</li></ol>');
    expect(result).toContain('1. first');
    expect(result).toContain('2. second');
  });

  it('converts <code> to inline code', () => {
    expect(htmlToMarkdown('<code>var x</code>')).toContain('`var x`');
  });

  it('converts <p> tags to plain text', () => {
    const result = htmlToMarkdown('<p>Hello world</p>');
    expect(result.trim()).toBe('Hello world');
  });

  it('handles nested HTML structures', () => {
    const result = htmlToMarkdown('<div><p><strong>nested</strong></p></div>');
    expect(result).toContain('**nested**');
  });

  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });

  it('handles realistic Azure DevOps HTML description', () => {
    const html = '<div><p>As a developer, I want to:</p><ul><li>Create items</li><li>Update items</li></ul><p>See <a href="http://docs.example.com">docs</a> for details.</p></div>';
    const result = htmlToMarkdown(html);
    expect(result).toContain('As a developer');
    expect(result).toContain('* Create items');
    expect(result).toContain('[docs](http://docs.example.com)');
  });
});

describe('toMarkdown', () => {
  it('converts HTML content to markdown', () => {
    const result = toMarkdown('<p><strong>Hello</strong></p>');
    expect(result).toContain('**Hello**');
  });

  it('passes plain text through unchanged', () => {
    expect(toMarkdown('just text')).toBe('just text');
  });

  it('passes existing markdown through unchanged', () => {
    const md = '# Title\n\n**bold** and _italic_';
    expect(toMarkdown(md)).toBe(md);
  });

  it('passes empty string through unchanged', () => {
    expect(toMarkdown('')).toBe('');
  });
});
