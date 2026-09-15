import { describe, expect, test } from 'bun:test';
import { IlParseError, } from '../src/parse-ilcs.js';
import { firstEffectiveDate, lastEffectiveDate, parseIacPart, parseLongDate, sectionPageUrl } from '../src/parse-iac.js';

export interface IacFixtureSection { num: string; heading: string; paragraphs: string[]; source?: string }
export interface IacFixtureSubpart { code?: string; heading?: string; sections: IacFixtureSection[] }

/** The whole-Part page in the real markup (verified 2026-09-15): a TOC, the AUTHORITY/SOURCE paragraphs, then one Word-exported document per section. */
export function iacPartPage(opts: { title: string; part: string; partTitle: string; authority: string; source: string; subparts: IacFixtureSubpart[] }): string {
  const toc: string[] = [`<p class="jcarheading">TITLE ${opts.title}:  X<br>CHAPTER I:  Y<br>PART ${opts.part}  ${opts.partTitle.toUpperCase()}</p><hr>`];
  for (const sp of opts.subparts) {
    if (sp.code) toc.push(`<p class="content"><br><p class="subheading">SUBPART ${sp.code}:  ${sp.heading ?? 'X'}</p></p>`);
    for (const s of sp.sections) toc.push(`<p class="content">Section ${s.num}  ${s.heading}</p>`);
  }
  toc.push(`<br><p class="content">AUTHORITY:  ${opts.authority}</p><br><p class="content">SOURCE:  ${opts.source}</p>`);
  const docs = opts.subparts.flatMap((sp) => sp.sections).map((s) => {
    const paras = s.paragraphs.map((p) => `<p class=MsoNormal style='margin-left:1.0in;text-indent:-.5in;text-autospace:\nnone'>${p} </p>\n\n<p class=MsoNormal style='margin-left:1.0in;text-indent:-.5in;text-autospace:\nnone'>&nbsp;</p>`).join('\n');
    const src = s.source ? `\n<p class=JCARSourceNote style='margin-left:.5in'>(Source:&nbsp; ${s.source})</p>` : '';
    return `<div>\n\n<p class=MsoNormal style='text-autospace:none'>&nbsp;</p>\n\n<p class=MsoNormal style='text-autospace:none'><b>Section ${s.num}&nbsp; </b>&nbsp;<b>${s.heading}</b> </p>\n\n<p class=MsoNormal style='text-autospace:none'>&nbsp;</p>\n${paras}${src}\n\n</div>\n\n</body>\n\n</html>\n`;
  });
  return `<!DOCTYPE html><html><head><title>x</title></head><body><div id="content"><div class="billtext-scale">${toc.join('')}\n${docs.join('\n')}</div></div><footer>ILGA.GOV</footer></body></html>`;
}

const part210 = () => iacPartPage({
  title: '56', part: '210', partTitle: 'Minimum Wage Law', authority: 'Implementing and authorized by the Minimum Wage Law [820 ILCS 105].',
  source: 'Adopted at 19 Ill. Reg. 6576, effective May 2, 1995; amended at 20 Ill. Reg. 15312, effective November 15, 1996; amended at 46 Ill. Reg. 14051, effective July 19, 2022.',
  subparts: [
    { code: 'A', heading: 'GENERAL PROVISIONS', sections: [{ num: '210.100', heading: 'Application of the Act', paragraphs: ['All functions and powers of the Department of Labor …'], source: 'Amended at 46 Ill. Reg. 2144, effective January 21, 2022' }] },
    { code: 'D', heading: 'OVERTIME', sections: [
      { num: '210.430', heading: 'Methods of Computing Overtime (Repealed)', paragraphs: [], source: 'Repealed at 20 Ill. Reg. 15312, effective November 15, 1996' },
      { num: '210.440', heading: 'Overtime – General', paragraphs: ['a)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; The Act does not require that an employee be paid overtime\ncompensation for hours in excess of eight per day, or for work on Saturdays,\nSundays, holidays or regular days of rest, unless hours worked exceed forty per\nweek.', 'b)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; The Act does not require holiday, vacation, sick pay or other\nsimilar causes be included in the regular rate of the employee.'] },
    ] },
  ],
});
const part919 = () => iacPartPage({
  title: '50', part: '919', partTitle: 'Improper Claims Practice', authority: 'Implementing Sections 154.5 and 154.6 of the Illinois Insurance Code [215 ILCS 5/154.5 and 154.6].',
  source: 'Filed June 17, 1974, effective July 1, 1974; amended at 26 Ill. Reg. 11915, effective July 22, 2002; amended at 49 Ill. Reg. 1273, effective January 17, 2025.',
  subparts: [{ sections: [
    { num: '919.80', heading: 'Required Claim Practices – Private Passenger Automobile – Property and Casualty Companies', paragraphs: ['a)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; All companies shall report vexatious or unreasonable delay\nfindings by a court of law to the Director within 30 days.', 'd)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Practices Concerning Travel, Loss of Use, Storage/Towing and\nBetterment, Replacement Crash Parts and Automobile Repairs.'], source: 'Amended at 26 Ill.\nReg. 11915, effective July 22, 2002' },
    { num: '919.EXHIBIT A', heading: 'Total Loss Automobile Claims', paragraphs: ['1)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Total Loss Claims', 'When you are\ninvolved in an automobile accident, one of the first things you may have to do\nis file a claim for damages to your vehicle.'], source: 'Amended at 49 Ill.\nReg. 1273, effective January 17, 2025' },
  ] }],
});

describe('helpers', () => {
  test('dates', () => {
    expect(parseLongDate('July 22, 2002')).toBe('2002-07-22');
    expect(parseLongDate('May 2, 1995')).toBe('1995-05-02');
    expect(parseLongDate('x')).toBeUndefined();
    expect(lastEffectiveDate('Adopted at 19 Ill. Reg. 6576, effective May 2, 1995; amended at 20 Ill.\nReg. 15312, effective November 15, 1996')).toBe('1996-11-15');
    expect(firstEffectiveDate('Filed June 17, 1974, effective July 1, 1974; amended at 26 Ill. Reg. 11915, effective July 22, 2002')).toBe('1974-07-01');
    expect(lastEffectiveDate('Repealed at 1 Ill. Reg. 1')).toBeUndefined();
  });
  test('sectionPageUrl matches the six real file names', () => {
    expect(sectionPageUrl('50', '919', '00', '919.80')).toBe('https://www.ilga.gov/commission/jcar/admincode/050/050009190000800R.html');
    expect(sectionPageUrl('50', '919', '00', '919.10')).toBe('https://www.ilga.gov/commission/jcar/admincode/050/050009190000100R.html');
    expect(sectionPageUrl('56', '300', 'D', '300.720')).toBe('https://www.ilga.gov/commission/jcar/admincode/056/056003000D07200R.html');
    expect(sectionPageUrl('56', '300', 'E', '300.941')).toBe('https://www.ilga.gov/commission/jcar/admincode/056/056003000E09410R.html');
    expect(sectionPageUrl('56', '210', 'D', '210.440')).toBe('https://www.ilga.gov/commission/jcar/admincode/056/056002100D04400R.html');
    expect(sectionPageUrl('35', '218', 'HH', '218.780')).toBe('https://www.ilga.gov/commission/jcar/admincode/035/03500218HH07800R.html');
    expect(sectionPageUrl('35', '218', 'A', '218.103')).toBe('https://www.ilga.gov/commission/jcar/admincode/035/035002180A01030R.html');
    expect(sectionPageUrl('50', '919', '00', '919.EXHIBIT A')).toBe('https://www.ilga.gov/commission/jcar/admincode/050/05000919ZZ9999aR.html');
  });
});

describe('parseIacPart', () => {
  test('the TOC gives every section its subpart; the Part SOURCE gives the adoption date; sections carry heading, text, Source, date, Ill. Reg. cite', () => {
    const p = parseIacPart(part210(), { title: '56', part: '210' });
    expect(p.partAdoptedDate).toBe('1995-05-02');
    expect(p.partSource.startsWith('Adopted at 19 Ill. Reg. 6576, effective May 2, 1995')).toBe(true);
    expect(p.authority).toBe('Implementing and authorized by the Minimum Wage Law [820 ILCS 105].');
    expect(p.sections.map((s) => s.num)).toEqual(['210.100', '210.430', '210.440']);
    const s = p.sections.find((x) => x.num === '210.440')!;
    expect(s.heading).toBe('Overtime – General');
    expect(s.subpart).toBe('D');
    expect(s.text).toBe('a) The Act does not require that an employee be paid overtime compensation for hours in excess of eight per day, or for work on Saturdays, Sundays, holidays or regular days of rest, unless hours worked exceed forty per week.\nb) The Act does not require holiday, vacation, sick pay or other similar causes be included in the regular rate of the employee.');
    expect(s.sourceNote).toBeUndefined();
    expect(s.effectiveDate).toBeUndefined();
    const a = p.sections[0]!;
    expect(a.subpart).toBe('A');
    expect(a.sourceNote).toBe('Amended at 46 Ill. Reg. 2144, effective January 21, 2022');
    expect(a.effectiveDate).toBe('2022-01-21');
    expect(a.illRegCite).toBe('46 Ill. Reg. 2144');
    const r = p.sections[1]!;
    expect(r.heading).toContain('(Repealed)');
    expect(r.text).toBe('');
  });
  test('a Part without subparts places every section in "00"; exhibits parse as sections; a wrapped Source line still dates', () => {
    const p = parseIacPart(part919(), { title: '50', part: '919' });
    const s = p.sections.find((x) => x.num === '919.80')!;
    expect(s.subpart).toBe('00');
    expect(s.heading).toBe('Required Claim Practices – Private Passenger Automobile – Property and Casualty Companies');
    expect(s.effectiveDate).toBe('2002-07-22');
    expect(s.illRegCite).toBe('26 Ill. Reg. 11915');
    expect(s.text).toContain('Storage/Towing and Betterment, Replacement Crash Parts and Automobile Repairs.');
    const e = p.sections.find((x) => x.num === '919.EXHIBIT A')!;
    expect(e.heading).toBe('Total Loss Automobile Claims');
    expect(e.effectiveDate).toBe('2025-01-17');
    expect(e.text.startsWith('1) Total Loss Claims\nWhen you are involved in an automobile accident')).toBe(true);
    expect(p.partAdoptedDate).toBe('1974-07-01');
  });
  test('the wrong Part, a missing SOURCE block, a foreign section, and a missing block all throw by name', () => {
    expect(() => parseIacPart(part919(), { title: '50', part: '918' })).toThrow(/PART 918/);
    expect(() => parseIacPart(part919().replace('SOURCE:', 'SOURCX:'), { title: '50', part: '919' })).toThrow(/SOURCE/);
    expect(() => parseIacPart(part919().replace('<b>Section 919.80', '<b>Section 918.80'), { title: '50', part: '919' })).toThrow(/does not belong/);
    expect(() => parseIacPart('<html><body>nope</body></html>', { title: '50', part: '919' })).toThrow(IlParseError);
  });
});
