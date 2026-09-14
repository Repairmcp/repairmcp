import { describe, expect, test } from 'bun:test';
import { PA_ACT_SOURCES, actRawName, actUrl } from '../src/sources-acts.js';

describe('the act manifest', () => {
  test('41 sections, P.S. cites unique within each code, act sections unique within each act', () => {
    const all = PA_ACT_SOURCES.flatMap((a) => a.sections.map((x) => `${a.code} ${x.psCite}`));
    expect(all.length).toBe(41);
    expect(new Set(all).size).toBe(41);
    for (const a of PA_ACT_SOURCES) expect(new Set(a.sections.map((x) => x.actSection)).size).toBe(a.sections.length);
  });
  test('manifest headings exist exactly for the 1915 act', () => {
    for (const a of PA_ACT_SOURCES) for (const x of a.sections) expect(x.heading !== undefined, `${a.code} ${x.psCite}`).toBe(a.year === 1915);
  });
  test('the Pennsylvania Code\'s own cross-references agree with the P.S. maps (kickoff §3.2)', () => {
    const find = (code: string, actNo: number) => PA_ACT_SOURCES.find((a) => a.code === code && a.actNo === actNo)!;
    const ps = (a: (typeof PA_ACT_SOURCES)[number], sec: string) => a.sections.find((x) => x.actSection === sec)?.psCite;
    const appraiser = find('63 P.S.', 367);
    expect([ps(appraiser, '3'), ps(appraiser, '11')]).toEqual(['853', '861']);
    const uipa = find('40 P.S.', 205);
    expect([ps(uipa, '4'), ps(uipa, '5')]).toEqual(['1171.4', '1171.5']);
    const mwa = find('43 P.S.', 5);
    expect([ps(mwa, '4'), ps(mwa, '5')]).toEqual(['333.104', '333.105']);
    expect(ps(find('73 P.S.', 387), '3.1')).toBe('201-3.1');
  });
  test('URL and raw-name shapes', () => {
    expect(actUrl(1961, 329)).toBe('https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1961/0/0329..HTM');
    expect(actUrl(1968, 5)).toBe('https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1968/0/0005..HTM');
    expect(actRawName(1915, 338)).toBe('pa-us-1915-0338.html');
  });
});
