import { describe, expect, test } from 'bun:test';
import {
  OH_CONST_CITE, OH_MIN_DELAY_MS, OH_SOURCES, chapterRawName, chapterUrl, manifestCites, sectionRawName, sectionUrl,
} from '../src/sources.js';

describe('the Ohio manifest', () => {
  test('51 cites, unique per code, 25 fetch units, per-cite domains sum to 9/16/17/9', () => {
    const all = manifestCites();
    expect(all.length).toBe(51);
    expect(new Set(all.map((c) => `${c.code}:${c.cite}`)).size).toBe(51);
    expect(OH_SOURCES.length).toBe(25);
    expect(OH_SOURCES.filter((s) => s.kind === 'chapter').length).toBe(7);
    const domains = new Map<string, number>();
    for (const c of all) domains.set(c.domain, (domains.get(c.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(9);
    expect(domains.get('repair_law')).toBe(16);
    expect(domains.get('employment')).toBe(17);
    expect(domains.get('safety')).toBe(9);
  });
  test('a chapter entry names at least two cites and every cite belongs to its chapter', () => {
    for (const s of OH_SOURCES) {
      if (s.kind !== 'chapter') continue;
      expect(s.sections.length, s.chapter).toBeGreaterThanOrEqual(2);
      for (const x of s.sections) {
        const belongs = s.code === 'ORC' ? x.cite.startsWith(`${s.chapter}.`) : x.cite.startsWith(`${s.chapter}-`);
        expect(belongs, `${s.code} ${x.cite} in chapter ${s.chapter}`).toBe(true);
      }
    }
  });
  test('URL and raw-name shapes; colons are literal in URLs and underscores in file names', () => {
    expect(sectionUrl('ORC', '4505.101')).toBe('https://codes.ohio.gov/ohio-revised-code/section-4505.101');
    expect(sectionUrl('OAC', '109:4-3-13')).toBe('https://codes.ohio.gov/ohio-administrative-code/rule-109:4-3-13');
    expect(sectionUrl('Ohio Const.', OH_CONST_CITE)).toBe('https://codes.ohio.gov/ohio-constitution/section-2.34a');
    expect(chapterUrl('ORC', '3901')).toBe('https://codes.ohio.gov/ohio-revised-code/chapter-3901');
    expect(chapterUrl('OAC', '4123:1-5')).toBe('https://codes.ohio.gov/ohio-administrative-code/chapter-4123:1-5');
    expect(chapterRawName('OAC', '109:4-3')).toBe('oh-oac-ch109_4-3.html');
    expect(chapterRawName('ORC', '4505')).toBe('oh-orc-ch4505.html');
    expect(sectionRawName('ORC', '1343.03')).toBe('oh-orc-s1343.03.html');
    expect(sectionRawName('OAC', '3745-21-18')).toBe('oh-oac-r3745-21-18.html');
    expect(sectionRawName('Ohio Const.', OH_CONST_CITE)).toBe('oh-const-s2.34a.html');
    expect(OH_MIN_DELAY_MS).toBe(10_000);
  });
  test('the headliners are in the manifest', () => {
    const keys = new Set(manifestCites().map((c) => `${c.code} ${c.cite}`));
    for (const k of ['OAC 3901-1-54', 'OAC 3901-1-07', 'ORC 1345.81', 'OAC 109:4-3-13', 'ORC 4505.101', 'ORC 4513.60', 'ORC 1333.41', 'ORC 4113.15', 'ORC 4113.19', 'ORC 4111.03', `Ohio Const. ${OH_CONST_CITE}`, 'ORC 4123.77', 'ORC 4121.47', 'OAC 4123:1-5-17', 'OAC 3745-31-30', 'OAC 3745-21-18']) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});
