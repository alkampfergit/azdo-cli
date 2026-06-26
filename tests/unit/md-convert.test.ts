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

  it('decodes &lt; in prose to < (ADO encodes < as &lt; in markdown fields)', () => {
    expect(toMarkdown('a &lt; b is plain prose')).toBe('a < b is plain prose');
  });

  it('decodes &gt; blockquote marker at start of line', () => {
    expect(toMarkdown('&gt; This is a blockquote')).toBe('> This is a blockquote');
  });

  it('decodes &gt; blockquote marker after blank line (mid-document)', () => {
    expect(toMarkdown('paragraph\n\n&gt; blockquote')).toBe('paragraph\n\n> blockquote');
  });

  it('decodes nested &gt; blockquote markers', () => {
    expect(toMarkdown('&gt; &gt; nested blockquote')).toBe('> > nested blockquote');
  });

  it('decodes &gt; in the middle of prose (ADO encodes all > as &gt;)', () => {
    expect(toMarkdown('value &gt; 0 is required')).toBe('value > 0 is required');
  });

  it('decodes &amp; (ampersand entity)', () => {
    expect(toMarkdown('AT&amp;T and R&amp;D')).toBe('AT&T and R&D');
  });

  it('preserves &amp;gt; as &gt; — avoids double-decoding', () => {
    expect(toMarkdown('display literal &amp;gt; here')).toBe('display literal &gt; here');
  });

  it('decodes &mdash; named entity to em dash', () => {
    expect(toMarkdown('verbatim &mdash; markdown')).toBe('verbatim — markdown');
  });

  it('decodes &#8212; decimal entity to em dash', () => {
    expect(toMarkdown('verbatim &#8212; markdown')).toBe('verbatim — markdown');
  });

  it('decodes &#x2014; hex entity to em dash', () => {
    expect(toMarkdown('verbatim &#x2014; markdown')).toBe('verbatim — markdown');
  });

  it('decodes &ndash; named entity to en dash', () => {
    expect(toMarkdown('range 1 &ndash; 10')).toBe('range 1 – 10');
  });

  it('decodes &#128270; numeric entity to emoji 🔎', () => {
    expect(toMarkdown('Lens &#128270;')).toBe('Lens 🔎');
  });

  it('decodes &hellip; to horizontal ellipsis', () => {
    expect(toMarkdown('and so on&hellip;')).toBe('and so on…');
  });

  it('decodes &copy; to copyright sign', () => {
    expect(toMarkdown('&copy; 2025 Acme')).toBe('© 2025 Acme');
  });

  it('decodes entities and preserves code span generic types in the same string', () => {
    const input = '&gt; Use `Task&lt;T&gt;` — or &mdash; something';
    const result = toMarkdown(input);
    expect(result).toContain('> Use');
    expect(result).toContain('`Task<T>`');
    expect(result).toContain('—');
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
