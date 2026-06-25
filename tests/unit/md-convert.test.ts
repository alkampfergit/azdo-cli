import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, toMarkdown, escapeAnglesInMarkdownCodeSpans } from '../../src/services/md-convert.js';

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

  it('decodes &lt;/&gt; entities inside code spans in plain text', () => {
    const result = toMarkdown('See `Task&lt;T&gt;` for details');
    expect(result).toContain('`Task<T>`');
  });

  it('leaves prose text with &lt; outside code spans unchanged', () => {
    const result = toMarkdown('a &lt; b is plain prose');
    expect(result).toBe('a &lt; b is plain prose');
  });
});

describe('htmlToMarkdown — generic types in code elements', () => {
  it('preserves single generic in <code> element', () => {
    expect(htmlToMarkdown('<code>Task<HealthCheckResult></code>')).toContain('`Task<HealthCheckResult>`');
  });

  it('preserves nested generics in <code> element', () => {
    expect(htmlToMarkdown('<code>Func<Task<T>></code>')).toContain('`Func<Task<T>>`');
  });

  it('preserves multi-param generic in <code> element', () => {
    expect(htmlToMarkdown('<code>Dict<K, V></code>')).toContain('`Dict<K, V>`');
  });

  it('does not double-encode already-escaped entities in <code>', () => {
    expect(htmlToMarkdown('<code>Task&lt;T&gt;</code>')).toContain('`Task<T>`');
  });

  it('does not affect elements outside <code>', () => {
    const result = htmlToMarkdown('<p><strong>bold</strong></p>');
    expect(result).toContain('**bold**');
  });
});

describe('escapeAnglesInMarkdownCodeSpans', () => {
  it('escapes < and > inside a single-backtick code span', () => {
    expect(escapeAnglesInMarkdownCodeSpans('`Task<T>`')).toBe('`Task&lt;T&gt;`');
  });

  it('escapes nested generics', () => {
    expect(escapeAnglesInMarkdownCodeSpans('`Func<Task<T>>`')).toBe('`Func&lt;Task&lt;T&gt;&gt;`');
  });

  it('escapes multi-param generic', () => {
    expect(escapeAnglesInMarkdownCodeSpans('`Dict<K, V>`')).toBe('`Dict&lt;K, V&gt;`');
  });

  it('does not touch prose outside code spans', () => {
    expect(escapeAnglesInMarkdownCodeSpans('prose <b>bold</b>')).toBe('prose <b>bold</b>');
  });

  it('is idempotent on already-escaped content', () => {
    const escaped = '`Task&lt;T&gt;`';
    expect(escapeAnglesInMarkdownCodeSpans(escaped)).toBe(escaped);
  });

  it('escapes spans inline with surrounding text', () => {
    const result = escapeAnglesInMarkdownCodeSpans('Sig: `Task<T>` returns void');
    expect(result).toBe('Sig: `Task&lt;T&gt;` returns void');
  });
});
