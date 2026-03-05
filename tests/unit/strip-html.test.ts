import { describe, it, expect } from 'vitest';
import { stripHtml } from '../../src/commands/get-item.js';

describe('stripHtml', () => {
  it('strips basic paragraph tags', () => {
    expect(stripHtml('<p>Hello world</p>')).toBe('Hello world');
  });

  it('converts <br> to newlines', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
  });

  it('converts <br/> and <br /> variants', () => {
    expect(stripHtml('a<br/>b<br />c')).toBe('a\nb\nc');
  });

  it('converts <div> tags to newlines', () => {
    expect(stripHtml('<div>block1</div><div>block2</div>')).toBe('block1\n\nblock2');
  });

  it('converts <li> tags to newlines', () => {
    expect(stripHtml('<ul><li>item1</li><li>item2</li></ul>')).toBe('item1\nitem2');
  });

  it('converts headings to labeled format', () => {
    expect(stripHtml('<h3>Section Title</h3>')).toBe('--- Section Title ---');
  });

  it('handles h1 through h6', () => {
    expect(stripHtml('<h1>One</h1>')).toBe('--- One ---');
    expect(stripHtml('<h6>Six</h6>')).toBe('--- Six ---');
  });

  it('decodes &amp; entity', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });

  it('decodes &lt; and &gt; entities', () => {
    expect(stripHtml('&lt;div&gt;')).toBe('<div>');
  });

  it('decodes &quot; entity', () => {
    expect(stripHtml('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('decodes &#39; entity', () => {
    expect(stripHtml("it&#39;s")).toBe("it's");
  });

  it('decodes &nbsp; entity', () => {
    expect(stripHtml('word&nbsp;word')).toBe('word word');
  });

  it('removes unknown tags', () => {
    expect(stripHtml('<span class="x">text</span>')).toBe('text');
  });

  it('collapses multiple consecutive newlines to double', () => {
    expect(stripHtml('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('  <p>text</p>  ')).toBe('text');
  });

  it('handles complex real-world HTML', () => {
    const html = '<div><p>First paragraph.</p><p>Second with &amp; entity.</p><ul><li>Item one</li><li>Item two</li></ul></div>';
    const result = stripHtml(html);
    expect(result).toContain('First paragraph.');
    expect(result).toContain('Second with & entity.');
    expect(result).toContain('Item one');
    expect(result).toContain('Item two');
  });
});
