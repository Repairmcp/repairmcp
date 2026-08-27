import { describe, expect, test } from 'bun:test';
import { LawParseError, decodeEntities, parseChapterHtml } from '../src/laws/parse';
import { LawCorpus } from '../src/laws/adapter';
import { normalizeToken, searchLawSections } from '../src/laws/search';
import corpusJson from '../data/uscode-title49-ch301.json';

// A minimal fixture mirroring the real OLRC markup (verified on the wire
// 2026-08-27): comment-delimited documentid/itempath, field-start:head and
// field-start:statute markers, HTML entities in statutory text. The second
// block has notes but no statute field — the shape of a repealed section.
const FIXTURE = `
<html><body>
<!-- documentid:49_-SUBTITLE_VI-ptA-ch301 currentthrough:20260430_119-87 documentPDFPage:736 -->
<h3 class="chapter-head"><strong>CHAPTER 301&mdash;MOTOR VEHICLE SAFETY</strong></h3>
<!-- documentid:49_30122  usckey:490000003012200000000000000000000 currentthrough:20260430_119-87 documentPDFPage:-1 -->
<!-- itempath:/490/SUBTITLE VI/PART A/CHAPTER 301/SUBCHAPTER II/Sec. 30122 -->
<!-- field-start:head -->
<h3 class="section-head">&sect;30122. Making safety devices and elements inoperative</h3>
<!-- field-end:head -->
<!-- field-start:statute -->
<a name="substructure-location_a"></a>
<p class="statutory-body">(a) <cap-smallcap>Definition</cap-smallcap>.&mdash;In this section, &quot;motor vehicle repair business&quot; means a person holding itself out to the public.</p>
<a name="substructure-location_b"></a>
<p class="statutory-body">(b) <cap-smallcap>Prohibition</cap-smallcap>.&mdash;A repair business may not knowingly make inoperative any safety device, per <usCode edition="prelim" section="30101" title="49">section 30101 of this title</usCode>.</p>
<!-- field-end:statute -->
<!-- documentid:49_30107  usckey:490000003010700000000000000000000 currentthrough:20260430_119-87 documentPDFPage:-1 -->
<!-- itempath:/490/SUBTITLE VI/PART A/CHAPTER 301/SUBCHAPTER I/Sec. 30107 -->
<!-- field-start:head -->
<h3 class="section-head">&sect;30107. Repealed. Pub. L. 000-0</h3>
<!-- field-end:head -->
<!-- field-start:notes -->
<p>Section, added Pub. L. ...</p>
<!-- field-end:notes -->
</body></html>
`;

describe('parseChapterHtml', () => {
  test('extracts section number, heading, subchapter, and decoded statute text', () => {
    const parsed = parseChapterHtml(FIXTURE);
    expect(parsed.currentThrough).toBe('2026-04-30');
    expect(parsed.publicLaw).toBe('P.L. 119-87');
    expect(parsed.chapterName).toBe('MOTOR VEHICLE SAFETY');
    expect(parsed.sections).toHaveLength(1);

    const section = parsed.sections[0]!;
    expect(section.section).toBe('30122');
    expect(section.heading).toBe('Making safety devices and elements inoperative');
    expect(section.subchapter).toBe('SUBCHAPTER II');
    expect(section.text).toContain('(a) Definition.—In this section, "motor vehicle repair business"');
    expect(section.text).toContain('(b) Prohibition.—A repair business may not knowingly make inoperative');
    expect(section.text).toContain('section 30101 of this title');
    expect(section.text).not.toContain('<');
    expect(section.sourceUrl).toContain('section30122');
  });

  test('skips sections without statute text (repealed)', () => {
    const parsed = parseChapterHtml(FIXTURE);
    expect(parsed.sections.some((s) => s.section === '30107')).toBe(false);
  });

  test('hard-fails when the currency marker is missing', () => {
    const withoutMarker = FIXTURE.replaceAll(/currentthrough:\d{8}_\d+-\d+/g, '');
    expect(() => parseChapterHtml(withoutMarker)).toThrow(LawParseError);
  });

  test('decodeEntities handles the statutory character set', () => {
    expect(decodeEntities('&sect;30122&mdash;&quot;text&quot; &amp; more&#8217;s')).toBe(
      '§30122—"text" & more’s',
    );
  });
});

describe('law search', () => {
  test('normalizeToken folds plurals without over-stemming', () => {
    expect(normalizeToken('remedies')).toBe('remedy');
    expect(normalizeToken('devices')).toBe('device');
    expect(normalizeToken('business')).toBe('business');
    expect(normalizeToken('gas')).toBe('gas');
  });

  test('empty query returns no hits', () => {
    expect(searchLawSections([], '')).toEqual([]);
  });
});

describe('LawCorpus over the committed capture', () => {
  const corpus = new LawCorpus(corpusJson);

  test('holds the chapter with its stated currency', () => {
    expect(corpus.sections.length).toBeGreaterThanOrEqual(40);
    expect(corpus.meta.currentThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(corpus.meta.publicLaw).toMatch(/^P\.L\. \d+-\d+$/);
    const freshness = corpus.freshness();
    expect(freshness.currentThrough).toBe(corpus.meta.currentThrough);
    expect(freshness.recordCount).toBe(corpus.sections.length);
  });

  test('the render-inoperative question finds §30122 first, with separation', () => {
    const hits = corpus.searchLaws('make inoperative safety device', 5);
    expect(hits[0]?.section.section).toBe('30122');
    expect(hits[0]!.score - (hits[1]?.score ?? 0)).toBeGreaterThan(0.2);
    expect(hits[0]?.section.text).toContain('may not knowingly make inoperative');
  });

  test('the free-remedy question finds §30120 first', () => {
    const hits = corpus.searchLaws('recall remedy free of charge', 5);
    expect(hits[0]?.section.section).toBe('30120');
  });

  test('getSection tolerates the formats a model will pass', () => {
    expect(corpus.getSection('30122')?.heading).toContain('inoperative');
    expect(corpus.getSection('§30122')?.section).toBe('30122');
    expect(corpus.getSection('Sec. 30122')?.section).toBe('30122');
    expect(corpus.getSection('30120a')?.section).toBe('30120A');
    expect(corpus.getSection('99999')).toBeNull();
  });
});
