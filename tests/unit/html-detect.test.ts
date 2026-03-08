import { describe, it, expect } from 'vitest';
import { isHtml } from '../../src/services/html-detect.js';

describe('isHtml', () => {
  it('returns true for <p> tag', () => {
    expect(isHtml('<p>Hello</p>')).toBe(true);
  });

  it('returns true for <br> tag', () => {
    expect(isHtml('line<br>break')).toBe(true);
  });

  it('returns true for <div> tag', () => {
    expect(isHtml('<div>block</div>')).toBe(true);
  });

  it('returns true for <span> tag', () => {
    expect(isHtml('<span>inline</span>')).toBe(true);
  });

  it('returns true for <strong> tag', () => {
    expect(isHtml('<strong>bold</strong>')).toBe(true);
  });

  it('returns true for <em> tag', () => {
    expect(isHtml('<em>italic</em>')).toBe(true);
  });

  it('returns true for <b> tag', () => {
    expect(isHtml('<b>bold</b>')).toBe(true);
  });

  it('returns true for <i> tag', () => {
    expect(isHtml('<i>italic</i>')).toBe(true);
  });

  it('returns true for <u> tag', () => {
    expect(isHtml('<u>underline</u>')).toBe(true);
  });

  it('returns true for <a> tag', () => {
    expect(isHtml('<a href="http://example.com">link</a>')).toBe(true);
  });

  it('returns true for <ul>/<li> tags', () => {
    expect(isHtml('<ul><li>item</li></ul>')).toBe(true);
  });

  it('returns true for <ol> tag', () => {
    expect(isHtml('<ol><li>item</li></ol>')).toBe(true);
  });

  it('returns true for heading tags h1-h6', () => {
    expect(isHtml('<h1>Title</h1>')).toBe(true);
    expect(isHtml('<h3>Section</h3>')).toBe(true);
    expect(isHtml('<h6>Sub</h6>')).toBe(true);
  });

  it('returns true for <table> tag', () => {
    expect(isHtml('<table><tr><td>cell</td></tr></table>')).toBe(true);
  });

  it('returns true for <img> tag', () => {
    expect(isHtml('<img src="pic.png">')).toBe(true);
  });

  it('returns true for <pre> tag', () => {
    expect(isHtml('<pre>code block</pre>')).toBe(true);
  });

  it('returns true for <code> tag', () => {
    expect(isHtml('<code>var x</code>')).toBe(true);
  });

  it('returns true for closing tags only', () => {
    expect(isHtml('trailing</p>')).toBe(true);
  });

  it('returns true for self-closing <br/>', () => {
    expect(isHtml('text<br/>more')).toBe(true);
  });

  it('returns true regardless of case', () => {
    expect(isHtml('<DIV>upper</DIV>')).toBe(true);
    expect(isHtml('<Strong>mixed</Strong>')).toBe(true);
  });

  it('returns true with attributes on tags', () => {
    expect(isHtml('<p class="note">text</p>')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isHtml('just regular text')).toBe(false);
  });

  it('returns false for markdown content', () => {
    expect(isHtml('# Heading\n\n**bold** and _italic_')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isHtml('')).toBe(false);
  });

  it('returns false for angle brackets in non-HTML context', () => {
    expect(isHtml('x < 5 and y > 3')).toBe(false);
  });

  it('returns false for unknown/custom tags', () => {
    expect(isHtml('<custom>tag</custom>')).toBe(false);
  });
});
