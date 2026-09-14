import { describe, expect, test } from 'bun:test';
import { ConsolidatedParseError, parseConsolidatedChapterHtml } from '../src/parse-consolidated.js';

const P = (inner: string, opts: { center?: boolean } = {}): string =>
  `<p style="text-align:${opts.center ? 'center' : 'left'};padding-left:0.0000in;text-indent:0.3016in;line-height:0.1610in;">${inner}</p>\n`;
const B = (inner: string): string => `<b>${inner}</b>`;

/** A WU01 chapter page in the real markup: title, chapter TOC, subchapter regions with Comment markers. */
export function chapterPage(opts: {
  title: number; chapter: number; enactment?: string;
  subchapters: Array<{ letter: string; name: string; enactment?: string; sections: Array<{ cite: string; heading: string; body: string[]; notes?: string[]; glosses?: string[] }> }>;
}): string {
  const tt = String(opts.title).padStart(2, '0');
  let html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Chapter ${opts.chapter}. - Title ${tt} - VEHICLES</title></head><body>`;
  html += P(B(`CHAPTER ${opts.chapter}`), { center: true }) + P(B('SOME CHAPTER NAME'), { center: true });
  html += P('Subchapter') + P('Sec.');
  for (const s of opts.subchapters) for (const sec of s.sections) html += P(`${sec.cite}. &nbsp;${sec.heading}`);
  if (opts.enactment) html += P(`${B('Enactment.')} &nbsp;${opts.enactment}`);
  html += P(`${B('Cross References.')} &nbsp;Chapter ${opts.chapter} is referred to in section 1 of this title.`);
  for (const s of opts.subchapters) {
    const first = s.sections[0]!;
    html += `<div class="Comment">${tt}c${first.cite}h</div>\n`;
    html += P(B(`SUBCHAPTER ${s.letter}`), { center: true }) + P(B(s.name), { center: true }) + P('Sec.');
    for (const sec of s.sections) html += P(`${sec.cite}. &nbsp;${sec.heading}`);
    if (s.enactment) html += P(`${B('Enactment.')} &nbsp;${s.enactment}`);
    for (const sec of s.sections) {
      html += `<div class="Comment">${tt}c${sec.cite}s</div>\n`;
      html += P(B(`&#167; ${sec.cite}. &nbsp;${sec.heading}`));
      for (const line of sec.body) html += P(line);
      for (const n of sec.notes ?? []) html += P(n);
      for (const g of sec.glosses ?? []) html += P(`${B(g.split(' ').slice(0, 2).join(' '))} &nbsp;${g.split(' ').slice(2).join(' ')}`);
      html += P(`${B('Cross References.')} &nbsp;Section ${sec.cite} is referred to in section 1 of this title.`);
    }
  }
  return `${html}</body></html>`;
}

const page = chapterPage({
  title: 75, chapter: 73, enactment: 'Unless otherwise noted, Chapter 73 was added June 17, 1976, P.L.162, No.81, effective\n            July 1, 1977.',
  subchapters: [
    { letter: 'A', name: 'ABANDONED VEHICLES AND SALVORS', sections: [
      { cite: '7301', heading: 'Authorization of salvors.', body: ['(a) &nbsp;General rule.--The department shall authorize and shall issue a certificate\n            of authorization to every salvor.', '(b) &nbsp;Fee.--A fee applies.'] },
      { cite: '7306', heading: 'Payment of costs upon reclaiming vehicle.', body: ['In the event the owner reclaims the vehicle, the reclaiming party shall pay the costs.'], notes: ['(Dec. 9, 2002, P.L.1278, No.152, eff. 60 days)'], glosses: ['2002 Amendment. Act 152 amended the section.'] },
      { cite: '7311', heading: 'Reports by garage keepers of abandoned vehicles.', body: ['The person in charge of any garage or repair shop in which a vehicle of unknown ownership\n            has been left for a period of 15 consecutive days shall report.'], notes: ['(Dec. 9, 2002, P.L.1278, No.152, eff. 60 days; Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)'] },
    ] },
    { letter: 'B', name: 'ABANDONED CARGO', enactment: 'Subchapter B was added December 9, 2002, P.L.1278, No.152, effective in 60 days.', sections: [
      { cite: '7321', heading: 'Scope of subchapter and legislative intent.', body: ['This subchapter applies to cargo.'] },
      { cite: '7322', heading: 'Definitions (Repealed).', body: [] },
    ] },
  ],
});

describe('parseConsolidatedChapterHtml', () => {
  test('finds every bold § head, skips the two tables of contents, keeps one paragraph per line, joins wrapped lines', () => {
    const r = parseConsolidatedChapterHtml(page, { title: 75, chapter: 73 });
    expect(r.sections.map((s) => s.cite)).toEqual(['7301', '7306', '7311', '7321', '7322']);
    const s7301 = r.sections[0]!;
    expect(s7301.heading).toBe('Authorization of salvors.');
    expect(s7301.text).toBe('(a) General rule.--The department shall authorize and shall issue a certificate of authorization to every salvor.\n(b) Fee.--A fee applies.');
    expect(s7301.subchapter).toBe('A');
    expect(s7301.repealed).toBe(false);
  });
  test('own history notes are kept verbatim; glosses and cross references are not text', () => {
    const r = parseConsolidatedChapterHtml(page, { title: 75, chapter: 73 });
    const s7306 = r.sections[1]!;
    expect(s7306.historyNotes).toEqual(['(Dec. 9, 2002, P.L.1278, No.152, eff. 60 days)']);
    expect(s7306.text).toBe('In the event the owner reclaims the vehicle, the reclaiming party shall pay the costs.');
    expect(s7306.text).not.toContain('Amendment');
    expect(s7306.text).not.toContain('Cross References');
  });
  test('Enactment inheritance: chapter note for subchapter A, subchapter note for subchapter B, joined across the wrap', () => {
    const r = parseConsolidatedChapterHtml(page, { title: 75, chapter: 73 });
    expect(r.sections[0]!.inheritedEnactment).toBe('Enactment. Unless otherwise noted, Chapter 73 was added June 17, 1976, P.L.162, No.81, effective July 1, 1977.');
    expect(r.sections[3]!.inheritedEnactment).toBe('Enactment. Subchapter B was added December 9, 2002, P.L.1278, No.152, effective in 60 days.');
    expect(r.sections[3]!.subchapter).toBe('B');
  });
  test('a repealed catchline is flagged, not captured as an empty section', () => {
    const r = parseConsolidatedChapterHtml(page, { title: 75, chapter: 73 });
    expect(r.sections[4]!.repealed).toBe(true);
    expect(r.warnings).toEqual([]);
  });
  test('a head outside the chapter is template drift', () => {
    expect(() => parseConsolidatedChapterHtml(page, { title: 75, chapter: 11 })).toThrow(ConsolidatedParseError);
  });
  test('a page with no bold § head at all fails by name', () => {
    expect(() => parseConsolidatedChapterHtml('<html><body><p>nothing</p></body></html>', { title: 75, chapter: 73 })).toThrow(/no section heads/);
  });
});
