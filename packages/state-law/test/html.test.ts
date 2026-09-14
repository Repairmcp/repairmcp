import { describe, expect, test } from 'bun:test';
import { decodeEntities } from '../src/html.js';

describe('decodeEntities', () => {
  test('named and plain numeric references', () => {
    expect(decodeEntities('&sect;&nbsp;146.7 &amp; &#167; &#8212;')).toBe('§ 146.7 & § —');
  });
  test('C1-range numeric references decode through Windows-1252, the WHATWG rule', () => {
    // pacodeandbulletin.gov prints "General provisions&#151;repair shop" and
    // &#145;&#145;quoted&#146;&#146; on UTF-8-declared pages; browsers map
    // 128–159 to cp1252, and so must we, or the catchline loses its dash.
    expect(decodeEntities('General provisions&#151;repair shop')).toBe('General provisions—repair shop');
    expect(decodeEntities('&#145;&#145;wages&#146;&#146;')).toBe('‘‘wages’’');
    expect(decodeEntities('&#150; &#147;x&#148; &#133;')).toBe('– “x” …');
  });
  test('a reference outside the C1 range is unchanged', () => {
    expect(decodeEntities('&#160;a&#8217;b')).toBe(' a’b');
  });
});
