// packages/state-co/test/capture-crs.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureCrs } from '../src/capture-crs.js';
import { CRS_EDITION } from '../src/identity.js';
import { CRS_INDEX_URL, type CrsCaptureSource } from '../src/sources-crs.js';

/**
 * Fixtures mirror the OLLS download-index + whole-title HTML shape verified
 * in parse-crs.test.ts. TITLE_42 is that same fixture (42-9-104 live,
 * 42-9-105 repealed, 42-9-108.5 a point-five live section) plus a 42-3-*
 * pair that is entirely repealed, for the all-repealed-article hard-fail.
 * TITLE_10 adds the 10-4-120 page the brief calls for, plus a sibling
 * section that a 'sections' filter must NOT pull in by accident. TITLE_6
 * exists only to be linked with a relative href, to lock in the join
 * behavior in captureCrs. INDEX lists titles 10 and 42 only — title 8 is
 * deliberately absent, which is what drives the missing-title-8 assertion.
 * INDEX_RELATIVE_SLASH / INDEX_RELATIVE_BARE add title 6 with, respectively,
 * a leading-slash and a bare relative href.
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
<p><b>42-3-101.  (Repealed)</b></p>
<p>Source: L. 90: Entire section repealed.</p>
<p><b>42-3-102.  (Repealed)</b></p>
<p>Source: L. 90: Entire section repealed.</p>
</body></html>`;

const TITLE_6 = `
<html><body>
<p><b>6-1-105.  Deceptive trade practice.</b></p>
<p>(1) A person engages in a deceptive trade practice when, in the course of business, the person does any of the following.</p>
<p>Source: L. 69: Entire article added.</p>
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

/** The absolute URL a correctly-joined relative href must resolve to. */
const TITLE_6_URL = 'https://olls.info/crs/crs2026-title-6.htm';

/** Title 6 linked with a leading-slash relative href, e.g. "/crs/crs2026-title-6.htm". */
const INDEX_RELATIVE_SLASH = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
<a href="/crs/crs2026-title-6.htm">Title 6</a>
</body></html>`;

/** Title 6 linked with a bare relative href, e.g. "crs/crs2026-title-6.htm" (no leading slash). */
const INDEX_RELATIVE_BARE = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
<a href="crs/crs2026-title-6.htm">Title 6</a>
</body></html>`;

function fakeIo(
  indexHtml: string = INDEX,
  extraPages: Record<string, string> = {},
): { io: CaptureIo; fetchLog: string[] } {
  const fetchLog: string[] = [];
  const pages = new Map<string, string>([
    [CRS_INDEX_URL, indexHtml],
    [TITLE_42_URL, TITLE_42],
    [TITLE_10_URL, TITLE_10],
    ...Object.entries(extraPages),
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

/** Every 42-3-* section in TITLE_42 is repealed — the article filter must hard-fail, not return an empty corpus. */
const ALL_REPEALED_ARTICLE: CrsCaptureSource = {
  code: 'CRS',
  title: 42,
  chapterKey: '42-3',
  chapterTitle: 'An Entirely Repealed Article',
  domain: 'repair_law',
  filter: { kind: 'article' },
};

const SECTION_6_1_105: CrsCaptureSource = {
  code: 'CRS',
  title: 6,
  chapterKey: '6-1',
  chapterTitle: 'Colorado Consumer Protection Act',
  domain: 'repair_law',
  filter: { kind: 'sections', cites: ['6-1-105'] },
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

  test('an article filter whose entire chapter is repealed hard-fails rather than returning an empty corpus', async () => {
    await expect(captureCrs(fakeIo().io, [ALL_REPEALED_ARTICLE])).rejects.toThrow(/no live sections/);
    await expect(captureCrs(fakeIo().io, [ALL_REPEALED_ARTICLE])).rejects.toThrow(/42-3/);
  });

  test('a relative href on the index joins onto https://olls.info correctly, both leading-slash and bare forms', async () => {
    const slashCase = await captureCrs(
      fakeIo(INDEX_RELATIVE_SLASH, { [TITLE_6_URL]: TITLE_6 }).io,
      [SECTION_6_1_105],
    );
    expect(slashCase.sections).toHaveLength(1);
    expect(slashCase.sections[0]!.sourceUrl).toBe(TITLE_6_URL);

    const bareCase = await captureCrs(
      fakeIo(INDEX_RELATIVE_BARE, { [TITLE_6_URL]: TITLE_6 }).io,
      [SECTION_6_1_105],
    );
    expect(bareCase.sections).toHaveLength(1);
    expect(bareCase.sections[0]!.sourceUrl).toBe(TITLE_6_URL);
  });
});
