import { describe, expect, test } from 'bun:test';
import { IL_MIN_DELAY_MS, IL_SOURCES, actUrl, articleUrl, iacCite, ilcsCite, manifestCites, partUrl, rawName, unitUrl } from '../src/sources.js';

describe('the Illinois manifest', () => {
  test('88 cites, unique, 23 fetch units (12 acts, 6 articles, 5 parts), per-cite domains sum to 16/37/23/12', () => {
    const all = manifestCites();
    expect(all.length).toBe(88);
    expect(new Set(all.map((c) => c.cite)).size).toBe(88);
    expect(IL_SOURCES.length).toBe(23);
    expect(IL_SOURCES.filter((s) => s.kind === 'act').length).toBe(12);
    expect(IL_SOURCES.filter((s) => s.kind === 'article').length).toBe(6);
    expect(IL_SOURCES.filter((s) => s.kind === 'part').length).toBe(5);
    const domains = new Map<string, number>();
    for (const c of all) domains.set(c.domain, (domains.get(c.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(16);
    expect(domains.get('repair_law')).toBe(37);
    expect(domains.get('employment')).toBe(23);
    expect(domains.get('safety')).toBe(12);
  });
  test('every entry carries a fallback heading and its cite belongs to its unit', () => {
    for (const c of manifestCites()) {
      expect(c.heading.length, c.cite).toBeGreaterThan(0);
      if (c.code === 'ILCS') expect(c.cite.startsWith(`${c.chapter}/`), c.cite).toBe(true);
      else expect(c.cite.startsWith(`${c.chapter.replace(/ \d+$/, '')} `), c.cite).toBe(true);
    }
    for (const s of IL_SOURCES) if (s.kind === 'part') for (const x of s.sections) expect(x.section.startsWith(`${s.part}.`), x.section).toBe(true);
  });
  test('cite and URL shapes (verified on the wire 2026-09-15)', () => {
    expect(ilcsCite('815 ILCS 308', '15')).toBe('815 ILCS 308/15');
    expect(iacCite('50', '919.EXHIBIT A')).toBe('50 Ill. Adm. Code 919.EXHIBIT A');
    const act = IL_SOURCES.find((s) => s.kind === 'act' && s.chapter === '815 ILCS 308')!;
    expect(act.kind === 'act' && actUrl(act)).toBe('https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2500&ChapterID=67');
    expect(rawName(act)).toBe('il-act-2500.html');
    const art = IL_SOURCES.find((s) => s.kind === 'article' && s.seqStart === 51000000)!;
    expect(art.kind === 'article' && articleUrl(art)).toBe('https://www.ilga.gov/legislation/ILCS/details?ActID=1249&ChapterID=22&SeqStart=51000000&SeqEnd=67200000');
    expect(rawName(art)).toBe('il-art-1249-51000000.html');
    const part = IL_SOURCES.find((s) => s.kind === 'part' && s.part === '919')!;
    expect(part.kind === 'part' && partUrl(part)).toBe('https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=05000919');
    expect(rawName(part)).toBe('il-part-05000919.html');
    expect(unitUrl(part)).toBe(partUrl(part as never));
    expect(IL_MIN_DELAY_MS).toBe(10_000);
  });
  test('the headliners are in the manifest', () => {
    const cites = new Set(manifestCites().map((c) => c.cite));
    for (const k of ['215 ILCS 5/154.6', '215 ILCS 5/155', '215 ILCS 5/155.29', '215 ILCS 5/154.9', '215 ILCS 5/154.10', '50 Ill. Adm. Code 919.80', '50 Ill. Adm. Code 919.90', '50 Ill. Adm. Code 919.EXHIBIT A', '815 ILCS 308/15', '815 ILCS 308/65', '815 ILCS 306/83', '625 ILCS 5/5-301', '625 ILCS 5/3-117.1', '770 ILCS 45/1.5', '770 ILCS 50/2', '820 ILCS 115/9', '820 ILCS 115/5', '56 Ill. Adm. Code 300.820', '820 ILCS 105/4a', '820 ILCS 140/3', '820 ILCS 192/15', '820 ILCS 90/10', '820 ILCS 305/4', '820 ILCS 219/15', '35 Ill. Adm. Code 218.780', '35 Ill. Adm. Code 219.784']) {
      expect(cites.has(k), k).toBe(true);
    }
  });
});
