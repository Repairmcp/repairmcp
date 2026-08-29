// packages/state-co/test/capture-crs.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureCrs } from '../src/capture-crs.js';
import { CRS_EDITION } from '../src/identity.js';
import { CRS_INDEX_URL, type CrsCaptureSource } from '../src/sources-crs.js';

/**
 * Fixtures mirror the OLLS download-index + whole-title HTML shape verified
 * in parse-crs.test.ts. TITLE_42 is that same fixture (42-9-104 live,
 * 42-9-105 repealed, 42-9-108.5 a point-five live section) so the article
 * filter has a repealed sibling to skip. TITLE_10 adds the 10-4-120 page the
 * brief calls for, plus a sibling section that a 'sections' filter must NOT
 * pull in by accident. INDEX lists titles 10 and 42 only — title 8 is
 * deliberately absent, which is what drives the missing-title-8 assertion.
 */
const TITLE_42_URL = 'https://olls.info/crs/crs2026-title-42.htm';
const TITLE_10_URL = 'https://olls.info/crs/crs2026-title-10.htm';

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

const TITLE_10 = `
<html><body>
<p><b>10-4-120.  Payment of claims - options - definitions.</b></p>
<p>(1) An insurer shall not require repairs to be performed by a specific repair facility.</p>
<p>(2) An insurer shall pay for repairs that restore the vehicle to its condition before the loss.</p>
<p>Source: L. 2003: Entire section added, p. 100, § 1.</p>
<p><b>10-4-121.  A neighboring section the sections filter must not pull in.</b></p>
<p>Unrelated text.</p>
<p>Source: L. 2003: Entire section added, p. 101, § 2.</p>
</body></html>`;

const INDEX = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
</body></html>`;

const INDEX_MISMATCH = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-sixth General Assembly at its First
Regular Session in 2027.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
</body></html>`;

function fakeIo(indexHtml: string = INDEX): { io: CaptureIo; fetchLog: string[] } {
  const fetchLog: string[] = [];
  const pages = new Map<string, string>([
    [CRS_INDEX_URL, indexHtml],
    [TITLE_42_URL, TITLE_42],
    [TITLE_10_URL, TITLE_10],
  ]);
  const io: CaptureIo = {
    async fetchText(url) {
      fetchLog.push(url);
      const body = pages.get(url);
      if (body === undefined) throw new Error(`fake io: no text fixture for ${url}`);
      return body;
    },
    async fetchJson() {
      throw new Error('unused');
    },
    log: () => {},
  };
  return { io, fetchLog };
}

const ARTICLE_42_9: CrsCaptureSource = {
  code: 'CRS',
  title: 42,
  chapterKey: '42-9',
  chapterTitle: 'Motor Vehicle Repairs',
  domain: 'repair_law',
  filter: { kind: 'article' },
};

const SECTION_10_4_120: CrsCaptureSource = {
  code: 'CRS',
  title: 10,
  chapterKey: '10-4',
  chapterTitle: 'Property and Casualty Insurance',
  domain: 'insurance',
  filter: { kind: 'sections', cites: ['10-4-120'] },
};

describe('captureCrs', () => {
  test("1. 'sections' filter returns exactly the named cites with manifest metadata and the title URL", async () => {
    const { io } = fakeIo();
    const result = await captureCrs(io, [SECTION_10_4_120]);
    expect(result.sections).toHaveLength(1);
    const section = result.sections[0]!;
    expect(section.cite).toBe('10-4-120');
    expect(section.code).toBe('CRS');
    expect(section.chapter).toBe('10-4');
    expect(section.chapterTitle).toBe('Property and Casualty Insurance');
    expect(section.domain).toBe('insurance');
    expect(section.sourceUrl).toBe(TITLE_10_URL);
  });

  test('2. an article filter returns every non-repealed section in the chapter and reports repealed ones', async () => {
    const { io } = fakeIo();
    const result = await captureCrs(io, [ARTICLE_42_9]);
    expect(result.sections.map((s) => s.cite)).toEqual(['42-9-104', '42-9-108.5']);
    expect(result.report.skippedEmpty).toEqual(['42-9-105']);
  });

  test('3. a named cite missing from a present title throws; title 8 (absent from the index) names the PDF supplement', async () => {
    const missingFromTitle10: CrsCaptureSource = {
      ...SECTION_10_4_120,
      filter: { kind: 'sections', cites: ['10-4-999'] },
    };
    await expect(captureCrs(fakeIo().io, [missingFromTitle10])).rejects.toThrow(/10-4-999/);

    const title8: CrsCaptureSource = {
      code: 'CRS',
      title: 8,
      chapterKey: '8-4',
      chapterTitle: 'Wages',
      domain: 'employment',
      filter: { kind: 'sections', cites: ['8-4-103'] },
    };
    await expect(captureCrs(fakeIo().io, [title8])).rejects.toThrow(/crs2026-statute-pdfs\.zip/);
  });

  test('4. a named cite whose page is repealed throws', async () => {
    const repealedByName: CrsCaptureSource = {
      code: 'CRS',
      title: 42,
      chapterKey: '42-9',
      chapterTitle: 'Motor Vehicle Repairs',
      domain: 'repair_law',
      filter: { kind: 'sections', cites: ['42-9-105'] },
    };
    await expect(captureCrs(fakeIo().io, [repealedByName])).rejects.toThrow(/Repealed/);
  });

  test('5. currencyNote and editionYear surface in the result; an edition mismatch warns', async () => {
    const clean = await captureCrs(fakeIo().io, [SECTION_10_4_120]);
    expect(clean.editionYear).toBe('2026');
    expect(clean.currencyNote).toContain('Second');
    expect(clean.report.warnings).toEqual([]);

    const mismatched = await captureCrs(fakeIo(INDEX_MISMATCH).io, [SECTION_10_4_120]);
    expect(mismatched.editionYear).toBe('2027');
    expect(mismatched.report.warnings.some((w) => w.includes(CRS_EDITION))).toBe(true);
  });

  test('6. CRS sections carry no effectiveDate; historyNote is the Source line verbatim', async () => {
    const result = await captureCrs(fakeIo().io, [SECTION_10_4_120]);
    const section = result.sections[0]!;
    expect(section.effectiveDate).toBeUndefined();
    expect(section.historyNote).toBe('Source: L. 2003: Entire section added, p. 100, § 1.');
  });

  test('7. the index is fetched exactly once and each distinct title exactly once', async () => {
    const { io, fetchLog } = fakeIo();
    const sources: CrsCaptureSource[] = [
      ARTICLE_42_9,
      {
        code: 'CRS',
        title: 42,
        chapterKey: '42-9',
        chapterTitle: 'Motor Vehicle Repairs',
        domain: 'repair_law',
        filter: { kind: 'sections', cites: ['42-9-104'] },
      },
      SECTION_10_4_120,
    ];
    await captureCrs(io, sources);
    expect(fetchLog.filter((u) => u === CRS_INDEX_URL)).toHaveLength(1);
    expect(fetchLog.filter((u) => u === TITLE_42_URL)).toHaveLength(1);
    expect(fetchLog.filter((u) => u === TITLE_10_URL)).toHaveLength(1);
  });
});
