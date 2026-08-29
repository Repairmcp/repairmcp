// packages/state-co/test/parse-crs.test.ts
import { describe, expect, test } from 'bun:test';
import { parseCrsIndexCurrency, parseCrsTitleHtml } from '../src/parse-crs.js';

const TITLE_42 = `
<html><body>
<p><b>42-9-104.  Written estimate required - exception.</b></p>
<p>(1) A repair facility shall give the customer a written estimate.</p>
<p>(2) The estimate shall state the total price.</p>
<p>Source: L. 77: Entire article added, p. 1930, § 1.</p>
<p>Editor's note: This section is similar to former law.</p>
<p><b>42-9-105.  (Repealed)</b></p>
<p>Source: L. 85: Entire section repealed.</p>
<p><b>42-9-108.5.  Completion of repairs - warranty work.</b></p>
<p>Text of the point five section.</p>
<p>Source: L. 91: Entire section added.</p>
</body></html>`;

const INDEX = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="https://olls.info/crs/crs2026-title-10.htm">Title 10</a>
<a href="https://olls.info/crs/crs2026-title-42.htm">Title 42</a>
</body></html>`;

describe('parseCrsTitleHtml', () => {
  const parsed = parseCrsTitleHtml(TITLE_42, { title: 42 });

  test('splits sections on the cite-dot-catchline convention', () => {
    expect(parsed.sections.map((s) => s.cite)).toEqual(['42-9-104', '42-9-105', '42-9-108.5']);
  });
  test('heading is the catchline as printed', () => {
    expect(parsed.sections[0]!.heading).toBe('Written estimate required - exception.');
  });
  test('body keeps subsection numbering, one paragraph per line', () => {
    expect(parsed.sections[0]!.text).toBe(
      '(1) A repair facility shall give the customer a written estimate.\n(2) The estimate shall state the total price.',
    );
  });
  test('the Source line becomes historyNote; annotation blocks are dropped', () => {
    expect(parsed.sections[0]!.historyNote).toBe('Source: L. 77: Entire article added, p. 1930, § 1.');
    expect(parsed.sections[0]!.text).not.toContain("Editor's note");
  });
  test('point-five cites parse', () => {
    expect(parsed.sections[2]!.cite).toBe('42-9-108.5');
  });
  test('repealed sections are flagged', () => {
    expect(parsed.sections[1]!.repealed).toBe(true);
    expect(parsed.sections[0]!.repealed).toBe(false);
  });
  test('a wrong-title cite hard-fails', () => {
    expect(() => parseCrsTitleHtml(TITLE_42, { title: 10 })).toThrow(/title/i);
  });
  test('an empty page hard-fails', () => {
    expect(() => parseCrsTitleHtml('<html><body></body></html>', { title: 42 })).toThrow();
  });
});

describe('parseCrsIndexCurrency', () => {
  test('extracts the currency sentence and the title hrefs', () => {
    const idx = parseCrsIndexCurrency(INDEX);
    expect(idx.currencyNote).toContain('Second');
    expect(idx.editionYear).toBe('2026');
    expect(idx.titleHrefs.get(42)).toBe('https://olls.info/crs/crs2026-title-42.htm');
  });
  test('a page without the currency sentence hard-fails', () => {
    expect(() => parseCrsIndexCurrency('<html><body>nope</body></html>')).toThrow(/curren/i);
  });
});
