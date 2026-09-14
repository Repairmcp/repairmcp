import { describe, expect, test } from 'bun:test';
import {
  actAmendmentDates, actAmendmentNotes, consolidatedNoteDates, newestActAmendmentDate,
  newestConsolidatedEffectiveDate, newestPacodeEffectiveDate, pacodeSourceDates, parseActTitleLine,
  parseMonthDate, plusDays,
} from '../src/history-dates.js';

describe('parseMonthDate', () => {
  test('full and abbreviated month names, both statute conventions', () => {
    expect(parseMonthDate('December 9, 2002')).toBe('2002-12-09');
    expect(parseMonthDate('Oct. 24, 2012')).toBe('2012-10-24');
    expect(parseMonthDate('Apr. 14, 2016')).toBe('2016-04-14');
    expect(parseMonthDate('Sept. 1, 2020')).toBe('2020-09-01');
    expect(parseMonthDate('July 14, 1977')).toBe('1977-07-14');
    expect(parseMonthDate('Jul. 14, 1961')).toBe('1961-07-14');
    expect(parseMonthDate('no date here')).toBeUndefined();
    expect(parseMonthDate('Foo. 3, 2020')).toBeUndefined();
  });
  test('plusDays is UTC-safe across month and year ends', () => {
    expect(plusDays('2012-10-24', 60)).toBe('2012-12-23');
    expect(plusDays('2002-12-09', 60)).toBe('2003-02-07');
    expect(plusDays('2022-05-06', 90)).toBe('2022-08-04');
  });
});

describe('consolidated statute notes (kickoff §3.1)', () => {
  test('a section note with a relative effective clause: act date plus N days', () => {
    expect(consolidatedNoteDates('(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)')).toEqual(['2012-12-23']);
    expect(consolidatedNoteDates('(June 28, 2018, P.L.498, No.74, eff. 180 days)')).toEqual(['2018-12-25']);
  });
  test('immediate and explicit clauses', () => {
    expect(consolidatedNoteDates('(Feb. 7, 1990, P.L.11, No.6, eff. imd.)')).toEqual(['1990-02-07']);
    expect(consolidatedNoteDates('(Feb. 7, 1990, P.L.11, No.6, eff. July 1, 1990)')).toEqual(['1990-07-01']);
  });
  test('a multi-act note yields one candidate per entry', () => {
    expect(consolidatedNoteDates('(Dec. 9, 2002, P.L.1278, No.152, eff. 60 days; Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)')).toEqual(['2003-02-07', '2012-12-23']);
  });
  test('Enactment prose, three shapes', () => {
    expect(consolidatedNoteDates('Enactment. Subchapter D was added December 9, 2002, P.L.1278, No.152, effective in 60 days.')).toEqual(['2003-02-07']);
    expect(consolidatedNoteDates('Enactment. Unless otherwise noted, Chapter 73 was added June 17, 1976, P.L.162, No.81, effective July 1, 1977.')).toEqual(['1977-07-01']);
    expect(consolidatedNoteDates('Enactment. Subchapter G was added February 7, 1990, P.L.11, No.6, effective July 1, 1990.')).toEqual(['1990-07-01']);
    expect(consolidatedNoteDates('Enactment. Chapter 1 was added June 17, 1976, P.L.162, No.81, effective immediately.')).toEqual(['1976-06-17']);
  });
  test('a note with a P.L. citation but no effective clause contributes nothing', () => {
    expect(consolidatedNoteDates('Cross References. Section 1161 is referred to in sections 1162, 6308 of this title.')).toEqual([]);
    expect(consolidatedNoteDates('2012 Amendment. Act 178 amended subsec. (b).')).toEqual([]);
  });
  test('newest wins across notes', () => {
    expect(newestConsolidatedEffectiveDate(['(Dec. 9, 2002, P.L.1278, No.152, eff. 60 days)', '(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)'])).toBe('2012-12-23');
    expect(newestConsolidatedEffectiveDate([])).toBeUndefined();
  });
});

describe('unconsolidated act notes (kickoff §3.2)', () => {
  test('section-level, subsection-level, definition-level, and blank-P.L. notes all yield the act date', () => {
    expect(actAmendmentDates('(5 amended July 14, 1977, P.L.82, No.30)')).toEqual(['1977-07-14']);
    expect(actAmendmentDates('(2.1 added July 14, 1977, P.L.82, No.30)')).toEqual(['1977-07-14']);
    expect(actAmendmentDates('such payment shall be made by certified mail. ((a) amended July 14, 1977, P.L.82, No.30)')).toEqual(['1977-07-14']);
    expect(actAmendmentDates('(Def. amended July 7, 2006, P.L.363, No.78)')).toEqual(['2006-07-07']);
    expect(actAmendmentDates('(b) ((b) repealed July 15, 2024, P.L. , No.62).')).toEqual(['2024-07-15']);
    expect(actAmendmentDates('((e) amended Apr. 14, 2016, P.L.79, No.13)')).toEqual(['2016-04-14']);
  });
  test('a wrapped note (joined by the parser) still parses; prose dates without a note verb do not', () => {
    expect(actAmendmentDates('((f) repealed in part Oct. 5, 1980, P.L.693, No.142)')).toEqual(['1980-10-05']);
    expect(actAmendmentDates('This act shall take effect on July 1, 1977.')).toEqual([]);
  });
  test('newest wins; none yields undefined', () => {
    expect(newestActAmendmentDate('(3 amended July 14, 1977, P.L.82, No.30) x ((a) amended June 24, 1996, P.L.350, No.57)')).toBe('1996-06-24');
    expect(newestActAmendmentDate('Section 1. Short Title.--This act shall be known')).toBeUndefined();
  });
  test('actAmendmentNotes returns the note SPANS themselves, in page order, closing paren included', () => {
    expect(actAmendmentNotes('(5 amended July 14, 1977, P.L.82, No.30)')).toEqual(['(5 amended July 14, 1977, P.L.82, No.30)']);
    expect(actAmendmentNotes('(d) No appraiser shall require repairs in any specified shop. ((d) amended Apr. 14, 2016, P.L.79, No.13)')).toEqual(['((d) amended Apr. 14, 2016, P.L.79, No.13)']);
    expect(actAmendmentNotes('(b) ((b) repealed July 15, 2024, P.L. , No.62).')).toEqual(['((b) repealed July 15, 2024, P.L. , No.62)']);
    // A compound note is ONE span, run through to its single closing paren.
    expect(actAmendmentNotes('(318 amended Dec. 28, 1959, P.L.2034, No.747; repealed in part Apr. 28, 1978, P.L.202, No.53)'))
      .toEqual(['(318 amended Dec. 28, 1959, P.L.2034, No.747; repealed in part Apr. 28, 1978, P.L.202, No.53)']);
    // Page order, and a wrapped note is collapsed the way the parser collapses it.
    expect(actAmendmentNotes('(3 amended July 14, 1977, P.L.82,\n            No.30) prose ((a) amended June 24, 1996, P.L.350, No.57)'))
      .toEqual(['(3 amended July 14, 1977, P.L.82, No.30)', '((a) amended June 24, 1996, P.L.350, No.57)']);
    expect(actAmendmentNotes('Section 1. Short Title.--This act shall be known')).toEqual([]);
  });
  test('the act title line', () => {
    expect(parseActTitleLine('Act of Jul. 14, 1961,P.L. 637, No. 329 Cl. 43 - WAGE PAYMENT AND COLLECTION LAW')).toEqual({ actDate: '1961-07-14', pl: '637', actNo: '329' });
    expect(parseActTitleLine("Act of Jun. 2, 1915,P.L. 736, No. 338 Cl. 77 - WORKERS' COMPENSATION ACT")).toEqual({ actDate: '1915-06-02', pl: '736', actNo: '338' });
    expect(parseActTitleLine('Chapter 73. - Title 75 - VEHICLES')).toBeUndefined();
  });
});

describe('Pennsylvania Code Source notes (kickoff §3.3)', () => {
  test('explicit, relative, and absent effective clauses', () => {
    expect(pacodeSourceDates('The provisions of this § 146.7 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575; amended May 21, 1982, effective May 22, 1982, 12 Pa.B. 1639. Immediately preceding text appears at serial pages (39830) and (48154).')).toEqual(['1978-12-16', '1982-05-22']);
    expect(pacodeSourceDates('The provisions of this § 231.43 amended May 6, 2022, effective in 90 days, 52 Pa.B. 2701.')).toEqual(['2022-08-04']);
    expect(pacodeSourceDates('The provisions of this § 62.1 amended May 10, 1974, 4 Pa.B. 916; amended October 22, 1999, effective October 23, 1999, 29 Pa.B. 5511.')).toEqual(['1974-05-10', '1999-10-23']);
    expect(pacodeSourceDates('The provisions of this § 62.3 amended through August 17, 1984, effective August 18, 1984, 14 Pa.B. 3032; amended July 21, 1995, effective July 22, 1995, 25 Pa.B. 2884.')).toEqual(['1984-08-18', '1995-07-22']);
    expect(pacodeSourceDates('The provisions of this Chapter 62 adopted December 28, 1973, 3 Pa.B. 2959, unless otherwise noted.')).toEqual(['1973-12-28']);
  });
  test('an authority line contributes nothing', () => {
    expect(pacodeSourceDates('The provisions of this § 146.7 issued under the Unfair Insurance Practices Act (40 P. S. § § 1171.1—1171.15).')).toEqual([]);
  });
  test('newest wins, including over a transcription whose effective date precedes its correction date', () => {
    expect(newestPacodeEffectiveDate(['The provisions of this § 231.1 amended May 4, 1979, effective May 5, 1979, 9 Pa.B. 1467; corrected March 3, 1995, effective March 5, 1994, 25 Pa.B. 765; amended October 2, 2020, effective October 3, 2020, 50 Pa.B. 5459; amended May 6, 2022, effective in 90 days, 52 Pa.B. 2701.'])).toBe('2022-08-04');
    expect(newestPacodeEffectiveDate([])).toBeUndefined();
  });
});
