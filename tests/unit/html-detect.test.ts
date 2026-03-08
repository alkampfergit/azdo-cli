import { describe, it, expect } from 'vitest';
import { isHtml } from '../../src/services/html-detect.js';

describe('isHtml', () => {
  const trueCases: [string, string][] = [
    ['<p> tag', '<p>Hello</p>'],
    ['<br> tag', 'line<br>break'],
    ['<div> tag', '<div>block</div>'],
    ['<span> tag', '<span>inline</span>'],
    ['<strong> tag', '<strong>bold</strong>'],
    ['<em> tag', '<em>italic</em>'],
    ['<b> tag', '<b>bold</b>'],
    ['<i> tag', '<i>italic</i>'],
    ['<u> tag', '<u>underline</u>'],
    ['<a> tag', '<a href="http://example.com">link</a>'],
    ['<ul>/<li> tags', '<ul><li>item</li></ul>'],
    ['<ol> tag', '<ol><li>item</li></ol>'],
    ['<table> tag', '<table><tr><td>cell</td></tr></table>'],
    ['<img> tag', '<img src="pic.png">'],
    ['<pre> tag', '<pre>code block</pre>'],
    ['<code> tag', '<code>var x</code>'],
    ['closing tags only', 'trailing</p>'],
    ['self-closing <br/>', 'text<br/>more'],
    ['attributes on tags', '<p class="note">text</p>'],
    ['uppercase tags', '<DIV>upper</DIV>'],
    ['mixed case tags', '<Strong>mixed</Strong>'],
  ];

  it.each(trueCases)('returns true for %s', (_label, input) => {
    expect(isHtml(input)).toBe(true);
  });

  it('returns true for heading tags h1-h6', () => {
    expect(isHtml('<h1>Title</h1>')).toBe(true);
    expect(isHtml('<h3>Section</h3>')).toBe(true);
    expect(isHtml('<h6>Sub</h6>')).toBe(true);
  });

  const falseCases: [string, string][] = [
    ['plain text', 'just regular text'],
    ['markdown content', '# Heading\n\n**bold** and _italic_'],
    ['empty string', ''],
    ['angle brackets in non-HTML context', 'x < 5 and y > 3'],
    ['unknown/custom tags', '<custom>tag</custom>'],
  ];

  it.each(falseCases)('returns false for %s', (_label, input) => {
    expect(isHtml(input)).toBe(false);
  });
});
