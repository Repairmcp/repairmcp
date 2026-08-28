import { describe, expect, test } from 'bun:test';
import {
  assembleSections,
  diffCorpus,
  groupByChapter,
  isCleanDiff,
} from '../src/capture.js';
import type { ParsedWaChapter } from '../src/parse.js';
import type { WaSection } from '../src/schema.js';
import type { WaCaptureSource } from '../src/sources.js';
import { WA_CAPTURE_SOURCES } from '../src/sources.js';

const SOURCES: WaCaptureSource[] = [
  {
    code: 'WAC',
    chapter: '296-62',
    chapterTitle: 'General occupational health standards',
    domain: 'safety',
    filter: { kind: 'prefix', prefixes: ['296-62-080'] },
  },
  {
    code: 'WAC',
    chapter: '296-62',
    chapterTitle: 'General occupational health standards',
    domain: 'safety',
    filter: { kind: 'sections', cites: ['296-62-11019'] },
  },
  {
    code: 'RCW',
    chapter: '46.71',
    chapterTitle: 'Automotive repair',
    domain: 'repair_law',
    filter: { kind: 'chapter' },
  },
];

const parsedChapter = (cites: string[]): ParsedWaChapter => ({
  sections: cites.map((cite) => ({
    cite,
    heading: `Heading ${cite}`,
    text: `Text ${cite}`,
    ...(cite.startsWith('296') ? { effectiveDate: '2019-01-18' } : {}),
    historyNote: `[note ${cite}]`,
  })),
  skippedEmpty: [],
  duplicates: [],
  warnings: [],
});

const PARSED = new Map([
  ['WAC 296-62', parsedChapter(['296-62-07001', '296-62-08003', '296-62-11019'])],
  ['RCW 46.71', parsedChapter(['46.71.025'])],
]);

describe('groupByChapter', () => {
  test('two manifest entries sharing a chapter share one fetch group', () => {
    const groups = groupByChapter(SOURCES);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.sources).toHaveLength(2);
    expect(groups[1]!.chapter).toBe('46.71');
  });

  test('the real manifest groups to one fetch per chapter', () => {
    const groups = groupByChapter(WA_CAPTURE_SOURCES);
    const keys = groups.map((g) => `${g.code} ${g.chapter}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups.length).toBeLessThan(WA_CAPTURE_SOURCES.length);
  });
});

describe('assembleSections', () => {
  test('applies each source filter and stamps identity fields', () => {
    const sections = assembleSections(PARSED, groupByChapter(SOURCES));
    const cites = sections.map((s) => s.cite);
    expect(cites).toEqual(['296-62-08003', '296-62-11019', '46.71.025']);
    const first = sections[0]!;
    expect(first.code).toBe('WAC');
    expect(first.chapter).toBe('296-62');
    expect(first.domain).toBe('safety');
    expect(first.effectiveDate).toBe('2019-01-18');
    expect(first.historyNote).toBe('[note 296-62-08003]');
    expect(first.sourceUrl).toContain('cite=296-62-08003');
    const rcw = sections[2]!;
    expect(rcw.effectiveDate).toBeUndefined();
  });

  test('a manifest overlap throws instead of silently double-serving a section', () => {
    const overlapping: WaCaptureSource[] = [
      ...SOURCES,
      {
        code: 'WAC',
        chapter: '296-62',
        chapterTitle: 'General occupational health standards',
        domain: 'safety',
        filter: { kind: 'sections', cites: ['296-62-08003'] },
      },
    ];
    expect(() => assembleSections(PARSED, groupByChapter(overlapping))).toThrow(/overlap/i);
  });

  test('a missing parsed chapter throws — the fetch loop must supply every group', () => {
    expect(() => assembleSections(new Map(), groupByChapter(SOURCES))).toThrow(/296-62/);
  });
});

describe('diffCorpus', () => {
  const section = (cite: string, text = `Text ${cite}`): WaSection => ({
    cite,
    code: 'WAC',
    chapter: '284-30',
    chapterTitle: 'Trade practices',
    heading: `Heading ${cite}`,
    text,
    domain: 'insurance',
    sourceUrl: `https://app.leg.wa.gov/WAC/default.aspx?cite=${cite}`,
  });

  test('identical corpora diff clean', () => {
    const prev = [section('284-30-330'), section('284-30-350')];
    const diff = diffCorpus(prev, [...prev]);
    expect(diff).toEqual({ added: [], removed: [], changedText: [] });
    expect(isCleanDiff(diff)).toBe(true);
  });

  test('added, removed, and changed-text sections are each named', () => {
    const prev = [section('284-30-330'), section('284-30-350')];
    const next = [section('284-30-330', 'Amended text.'), section('284-30-360')];
    const diff = diffCorpus(prev, next);
    expect(diff.added).toEqual(['WAC:284-30-360']);
    expect(diff.removed).toEqual(['WAC:284-30-350']);
    expect(diff.changedText).toEqual(['WAC:284-30-330']);
    expect(isCleanDiff(diff)).toBe(false);
  });
});
