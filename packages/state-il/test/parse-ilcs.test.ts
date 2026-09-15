import { describe, expect, test } from 'bun:test';
import { IlParseError, parseEffDate, parseIlcsPage, parseSourceNote, selectVersion } from '../src/parse-ilcs.js';

const F = `<code><font size="2" face="Courier New">`;
const E = `</font></code>`;
const IND = `<code>&nbsp;&nbsp;&nbsp;&nbsp;</code>`;
const WS = `${F}\n\t\t${E}`;
export const run = (text: string): string => `${F}${text}${E}`;

/**
 * One section table in the real ilga.gov markup (verified 2026-09-15). `lines`
 * are the <br>-separated lines AFTER the cite line; each line is a list of
 * runs. The "Sec. N. " run is the caller's first run of the first line.
 */
export function ilcsSectionTable(opts: { cite: string; formerCite?: string; versionLabel?: string; lines: string[][]; source: string }): string {
  const citeLine = `${IND}${run(`(${opts.cite})`)}${opts.formerCite ? ` ${run(`(${opts.formerCite})`)}` : ''}${WS}`;
  const versionLine = opts.versionLabel ? `<br>${IND}${run(`(Text of Section ${opts.versionLabel}`)}${run(')')}` : '';
  const body = opts.lines.map((runs) => `<br>${IND}${runs.map((r) => run(r)).join(WS)}`).join('');
  return `<table align="center" border="0" cellspacing="0" cellpadding="0" width="500"><tr><td><div align="justify">${F}\n\t${E}<p></p>${WS}${WS}${citeLine}${versionLine}${body}${WS}<br>${run(`(Source: ${opts.source})`)}${WS}${F}\n${E}</div></td></tr></table></html>                                                        <br>\n`;
}
/** Two consecutive versions of one section share one table: the second version follows the first's Source note. */
export function ilcsDualTable(opts: { cite: string; formerCite?: string; versions: Array<{ label: string; lines: string[][]; source: string }> }): string {
  const citeLine = `${IND}${run(`(${opts.cite})`)}${opts.formerCite ? ` ${run(`(${opts.formerCite})`)}` : ''}${WS}`;
  const versions = opts.versions
    .map((v) => `<br>${IND}${run(`(Text of Section ${v.label})`)}${v.lines.map((runs) => `<br>${IND}${runs.map((r) => run(r)).join(WS)}`).join('')}${WS}<br>${run(`(Source: ${v.source})`)}`)
    .join('');
  return `<table align="center" border="0" cellspacing="0" cellpadding="0" width="500"><tr><td><div align="justify">${F}\n\t${E}<p></p>${citeLine}${versions}${F}\n${E}</div></td></tr></table></html><br>\n`;
}
const CHROME_TOP = `<!DOCTYPE html><html lang="en"><head><title>x</title></head><body><div class="card"><div class="card-body content"><p>Updating the database of the Illinois Compiled Statutes (ILCS) is an ongoing process.</p></div></div><div id="content" class="p-3"><div class="centered-container"><div class="row"><div class="left-aligned-content pl-lg-5 embed-container" translate="no"><div class="text-left" id="billtextanchor"><div class="billtext-host"><div class="billtext-scale">\n`;
const CHROME_BOTTOM = `</div></div></div></div></div></div><footer><p>This site is maintained for the Illinois General Assembly by the Legislative Information System</p></footer></body></html>`;
export function ilcsPage(tables: string[]): string {
  return `${CHROME_TOP}${tables.join('')}${CHROME_BOTTOM}`;
}
export function emptyIlcsPage(): string {
  return ilcsPage([]);
}

describe('helpers', () => {
  test('parseEffDate: two-digit years pivot at 50, four-digit accepted', () => {
    expect(parseEffDate('1-1-98')).toBe('1998-01-01');
    expect(parseEffDate('7-12-19')).toBe('2019-07-12');
    expect(parseEffDate('1-1-2004')).toBe('2004-01-01');
    expect(parseEffDate('6-1-26')).toBe('2026-06-01');
    expect(parseEffDate('13-1-98')).toBeUndefined();
    expect(parseEffDate('x')).toBeUndefined();
  });
  test('parseSourceNote: every act, newest eff wins, silence when none', () => {
    expect(parseSourceNote('P.A. 93-565, eff. 1-1-04.')).toEqual({ publicActs: ['P.A. 93-565'], effectiveDate: '2004-01-01' });
    expect(parseSourceNote('P.A. 101-81, eff. 7-12-19; 102-550, eff. 8-20-21.')).toEqual({ publicActs: ['P.A. 101-81', 'P.A. 102-550'], effectiveDate: '2021-08-20' });
    expect(parseSourceNote('P.A. 80-926.')).toEqual({ publicActs: ['P.A. 80-926'] });
    expect(parseSourceNote('P.A. 86-1234; 86-1475.')).toEqual({ publicActs: ['P.A. 86-1234', 'P.A. 86-1475'] });
    expect(parseSourceNote('Laws 1921, p. 508.')).toEqual({ publicActs: [] });
    expect(parseSourceNote('P.A. 104-457, eff. 6-1-26.')).toEqual({ publicActs: ['P.A. 104-457'], effectiveDate: '2026-06-01' });
    expect(parseSourceNote('P.A. 101-40, eff. 1-1-20; 102-37, eff. 7-1-21; 103-590, eff. 6-5-24.').effectiveDate).toBe('2024-06-05');
  });
});

describe('parseIlcsPage', () => {
  test('variant A: the catchline in its own run before a <br> (308/15), formerCite absent, soft wraps joined, indents dropped', () => {
    const page = ilcsPage([ilcsSectionTable({ cite: '815 ILCS 308/15', lines: [['Sec. 15. ', 'Disclosure to consumers; estimates. '], ['(a) No work for compensation that exceeds $100 shall be commenced without\nspecific\nauthorization from the consumer after the disclosure set forth in this Section.'], ['(b) Every motor vehicle collision repair facility shall either (i) give to\neach\nconsumer a written\nestimated price for labor and parts.']], source: 'P.A. 93-565, eff. 1-1-04.' })]);
    const [s] = parseIlcsPage(page, 'act 2500');
    expect(s!.cite).toBe('815 ILCS 308/15');
    expect(s!.formerCite).toBeUndefined();
    expect(s!.versions.length).toBe(1);
    const v = s!.versions[0]!;
    expect(v.heading).toBe('Disclosure to consumers; estimates.');
    expect(v.bodyLines).toEqual([
      '(a) No work for compensation that exceeds $100 shall be commenced without specific authorization from the consumer after the disclosure set forth in this Section.',
      '(b) Every motor vehicle collision repair facility shall either (i) give to each consumer a written estimated price for labor and parts.',
    ]);
    expect(v.sourceNote).toBe('P.A. 93-565, eff. 1-1-04.');
    expect(v.publicActs).toEqual(['P.A. 93-565']);
    expect(v.effectiveDate).toBe('2004-01-01');
    expect(v.label).toBeUndefined();
  });
  test('variant B: "Sec. 10. " + "Definitions. " + body on one line (308/10); the remainder is the first body line', () => {
    const page = ilcsPage([ilcsSectionTable({ cite: '815 ILCS 308/10', lines: [['Sec. 10. ', 'Definitions. ', 'As used in this Act:'], ['"New part" means a part or component manufactured or supplied by the original\nmotor vehicle\nmanufacturer in an unused condition.']], source: 'P.A. 102-982, eff. 7-1-23.' })]);
    const v = parseIlcsPage(page, 'act 2500')[0]!.versions[0]!;
    expect(v.heading).toBe('Definitions.');
    expect(v.bodyLines[0]).toBe('As used in this Act:');
    expect(v.bodyLines[1]).toBe('"New part" means a part or component manufactured or supplied by the original motor vehicle manufacturer in an unused condition.');
  });
  test('no catchline when the run opens with "(" (155.29) or is a long paragraph (770 ILCS 45/1) or ends with ":" (105/3); formerCite kept', () => {
    const page = ilcsPage([
      ilcsSectionTable({ cite: '215 ILCS 5/155.29', formerCite: 'from Ch. 73, par. 767.29', lines: [['Sec. 155.29. ', '(a) Purpose. The purpose of this Section\nis to regulate the use of aftermarket crash parts.'], ['(b) Definitions.  As used in this Section the following terms have\nthe following meanings:']], source: 'P.A. 86-1234; 86-1475.' }),
      ilcsSectionTable({ cite: '770 ILCS 45/1', formerCite: 'from Ch. 82, par. 40', lines: [['Sec. 1. ', `Every person, firm or corporation who has\nexpended labor, skill or materials upon any chattel, or has furnished\nstorage for said chattel, at the request of its owner, reputed owner, or\nauthorized agent of the owner, or lawful possessor thereof, shall have a\nlien upon such chattel beginning on the date of the commencement of such\nexpenditure of labor, skill and materials or of such storage.`]], source: 'Laws 1921, p. 508.' }),
      ilcsSectionTable({ cite: '820 ILCS 105/3', formerCite: 'from Ch. 48, par. 1003', lines: [['Sec. 3. ', 'As used in this Act: '], ['(a) "Director" means the Director of the Department of Labor.']], source: 'P.A. 104-480, eff. 7-1-26.' }),
    ]);
    const [a, b, c] = parseIlcsPage(page, 'x');
    expect(a!.formerCite).toBe('from Ch. 73, par. 767.29');
    expect(a!.versions[0]!.heading).toBeUndefined();
    expect(a!.versions[0]!.bodyLines[0]).toBe('(a) Purpose. The purpose of this Section is to regulate the use of aftermarket crash parts.');
    expect(a!.versions[0]!.effectiveDate).toBeUndefined();
    expect(a!.versions[0]!.publicActs).toEqual(['P.A. 86-1234', 'P.A. 86-1475']);
    expect(b!.versions[0]!.heading).toBeUndefined();
    expect(b!.versions[0]!.bodyLines[0]!.startsWith('Every person, firm or corporation who has expended labor')).toBe(true);
    expect(b!.versions[0]!.bodyLines[0]).not.toContain('\n');
    expect(c!.versions[0]!.heading).toBeUndefined();
    expect(c!.versions[0]!.bodyLines).toEqual(['As used in this Act:', '(a) "Director" means the Director of the Department of Labor.']);
  });
  test('the catchline run followed by body text in the SAME run is not a catchline (154.5)', () => {
    const page = ilcsPage([ilcsSectionTable({ cite: '215 ILCS 5/154.5', formerCite: 'from Ch. 73, par. 766.5', lines: [['Sec. 154.5. ', 'Improper Claims Practices)  It is an improper claims practice\nfor any domestic, foreign or alien company transacting business in this\nState to commit any of the acts contained in Section 154.6 if:'], ['(a) it is committed knowingly in violation of this Act or any rules promulgated\nhereunder; or']], source: 'P.A. 80-926.' })]);
    const v = parseIlcsPage(page, 'x')[0]!.versions[0]!;
    expect(v.heading).toBeUndefined();
    expect(v.bodyLines[0]!.startsWith('Improper Claims Practices) It is an improper claims practice for any')).toBe(true);
  });
  test('internal NBSP indents inside an outline item collapse to one space', () => {
    const page = ilcsPage([ilcsSectionTable({ cite: '625 ILCS 5/3-117.1', lines: [['Sec. 3-117.1. ', 'When junking certificates or salvage certificates must\nbe obtained. '], ['(1) The business name, address, and dealer license&nbsp;&nbsp;&nbsp;&nbsp; number of the person disposing of the vehicle;']], source: 'P.A. 102-982, eff. 5-13-22.' })]);
    const v = parseIlcsPage(page, 'x')[0]!.versions[0]!;
    expect(v.heading).toBe('When junking certificates or salvage certificates must be obtained.');
    expect(v.bodyLines[0]).toBe('(1) The business name, address, and dealer license number of the person disposing of the vehicle;');
  });
  test('dual-printed before/after: two versions in one table with their own Source notes', () => {
    const page = ilcsPage([ilcsDualTable({ cite: '820 ILCS 115/9', formerCite: 'from Ch. 48, par. 39m-9', versions: [
      { label: 'before amendment by P.A. 104-457', lines: [['Sec. 9. ', 'Except as hereinafter provided, deductions by employers from wages\nor final\ncompensation are prohibited unless such deductions are (1) required by law.']], source: 'P.A. 97-120, eff. 1-1-12.' },
      { label: 'after amendment by P.A. 104-457', lines: [['Sec. 9. ', 'Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless such deductions are (1) required by law; (2) to the benefit of the employee.']], source: 'P.A. 104-457, eff. 6-1-26.' },
    ] })]);
    const s = parseIlcsPage(page, 'x')[0]!;
    expect(s.versions.map((v) => v.label)).toEqual(['before amendment by P.A. 104-457', 'after amendment by P.A. 104-457']);
    expect(s.versions[0]!.effectiveDate).toBe('2012-01-01');
    expect(s.versions[1]!.effectiveDate).toBe('2026-06-01');
    expect(s.versions[1]!.bodyLines[0]).toContain('(2) to the benefit of the employee');
  });
  test('the absent page returns []; a missing block throws; a table without a cite throws; a duplicate cite throws', () => {
    expect(parseIlcsPage(emptyIlcsPage(), 'act 999999')).toEqual([]);
    expect(() => parseIlcsPage('<html><body>nope</body></html>', 'x')).toThrow(IlParseError);
    expect(() => parseIlcsPage(ilcsPage([`<table width="500"><tr><td>${run('Sec. 1. ')}${run('Short title.')}</td></tr></table>`]), 'x')).toThrow(/does not open with a cite marker/);
    const t = ilcsSectionTable({ cite: '815 ILCS 308/5', lines: [['Sec. 5. ', 'Purpose. ']], source: 'P.A. 93-565, eff. 1-1-04.' });
    expect(() => parseIlcsPage(ilcsPage([t, t]), 'x')).toThrow(/appears twice/);
  });
  test('the delayed-effective-date notice above a head is recorded, not text (215 ILCS 5/143.21e)', () => {
    const page = ilcsPage([ilcsSectionTable({ cite: '215 ILCS 5/143.21e', versionLabel: undefined, lines: [['Sec. 143.21e. ', 'Notice. ']], source: 'P.A. 104-1, eff. 1-1-27.' }).replace('<br><code>&nbsp;&nbsp;&nbsp;&nbsp;</code><code><font size="2" face="Courier New">Sec. 143.21e. ', '<br><code>&nbsp;&nbsp;&nbsp;&nbsp;</code><code><font size="2" face="Courier New">(This Section may contain text from a Public Act with a delayed effective date)</font></code><br><code>&nbsp;&nbsp;&nbsp;&nbsp;</code><code><font size="2" face="Courier New">Sec. 143.21e. ')]);
    const s = parseIlcsPage(page, 'x')[0]!;
    expect(s.delayedEffectiveNotice).toBe(true);
    expect(s.versions[0]!.heading).toBe('Notice.');
    expect(s.versions[0]!.bodyLines).toEqual([]);
  });
  test('a head whose number disagrees with the cite marker throws', () => {
    expect(() => parseIlcsPage(ilcsPage([ilcsSectionTable({ cite: '815 ILCS 308/5', lines: [['Sec. 6. ', 'Purpose. ']], source: 'P.A. 93-565, eff. 1-1-04.' })]), 'x')).toThrow(/Sec\. 6/);
  });
});

describe('selectVersion (decision 4)', () => {
  const v = (label: string | undefined, effectiveDate: string | undefined, acts: string[]) => ({ ...(label ? { label } : {}), bodyLines: ['x'], sourceNote: 's', publicActs: acts, ...(effectiveDate ? { effectiveDate } : {}) });
  test('a single version is the section; futureEffective when its date is after the capture', () => {
    const r = selectVersion({ cite: 'c', versions: [v(undefined, '2004-01-01', ['P.A. 93-565'])] }, '2026-09-15');
    expect(r.chosen.effectiveDate).toBe('2004-01-01');
    expect(r.futureEffective).toBe(false);
    expect(r.versionNote).toBeUndefined();
    expect(selectVersion({ cite: 'c', versions: [v(undefined, '2027-01-01', ['P.A. 104-742'])] }, '2026-09-15').futureEffective).toBe(true);
  });
  test('before/after resolves by date, both ways', () => {
    const versions = [v('before amendment by P.A. 104-457', '2012-01-01', ['P.A. 97-120']), v('after amendment by P.A. 104-457', '2026-06-01', ['P.A. 104-457'])];
    const late = selectVersion({ cite: '820 ILCS 115/9', versions }, '2026-09-15');
    expect(late.chosen.label).toBe('after amendment by P.A. 104-457');
    expect(late.futureEffective).toBe(false);
    expect(late.versionNote).toBe('Printed in 2 versions on ilga.gov at capture: before amendment by P.A. 104-457; after amendment by P.A. 104-457 — this corpus carries "after amendment by P.A. 104-457".');
    const early = selectVersion({ cite: '820 ILCS 115/9', versions }, '2026-05-01');
    expect(early.chosen.label).toBe('before amendment by P.A. 104-457');
    expect(early.printed.length).toBe(2);
  });
  test('"from" sets resolve to the newest effective at or before capture; ties by the higher act number; none in force → newest overall, future-flagged', () => {
    const versions = [v('from P.A. 104-480', '2026-07-01', ['P.A. 104-480']), v('from P.A. 104-525', '2026-06-26', ['P.A. 104-525'])];
    expect(selectVersion({ cite: '820 ILCS 105/3', versions }, '2026-09-15').chosen.label).toBe('from P.A. 104-480');
    expect(selectVersion({ cite: '820 ILCS 105/3', versions }, '2026-06-28').chosen.label).toBe('from P.A. 104-525');
    const tied = [v('from P.A. 101-40, 102-37, and 103-590', '2024-06-05', ['P.A. 101-40', 'P.A. 102-37', 'P.A. 103-590']), v('from P.A. 101-384, 102-37, and 103-590', '2024-06-05', ['P.A. 101-384', 'P.A. 102-37', 'P.A. 103-590'])];
    expect(selectVersion({ cite: '820 ILCS 305/4', versions: tied }, '2026-09-15').chosen.label).toBe('from P.A. 101-384, 102-37, and 103-590');
    const none = selectVersion({ cite: 'c', versions }, '2026-01-01');
    expect(none.chosen.label).toBe('from P.A. 104-480');
    expect(none.futureEffective).toBe(true);
  });
});
