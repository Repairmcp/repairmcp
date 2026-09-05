import { describe, expect, test } from 'bun:test';
import { entryEffectiveDates, newestRegulationEffectiveDate } from '../src/history-dates.js';

/** Every shape below was copied from a live Register history on 2026-09-04. */
describe('entryEffectiveDates', () => {
  test('explicit operative and effective dates, hyphen and slash forms, two- and four-digit years', () => {
    expect(entryEffectiveDates('1. New section filed 12-15-92; operative 1-14-93 (Register 92, No. 52).')).toEqual(['1993-01-14']);
    expect(entryEffectiveDates('1. Amendment filed 6-26-74; designated effective 8-1-74 (Register 74, No. 26).')).toEqual(['1974-08-01']);
    expect(entryEffectiveDates('4. Amendment of section and Note filed 4-24-2003; operative 7-23-2003 (Register 2003, No. 17).')).toEqual(['2003-07-23']);
    expect(
      entryEffectiveDates('11. Amendment of subsection (e)(2) filed 12-12-2016; operative 1/1/2017 pursuant to Government Code section 11343.4(b)(3) ( Register 2016, No. 51 ).'),
    ).toEqual(['2017-01-01']);
  });

  test('"effective thirtieth day thereafter" is the filing date plus thirty days', () => {
    expect(entryEffectiveDates('1. Amendment filed 7-16-76; effective thirtieth day thereafter (Register 76, No. 29).')).toEqual(['1976-08-15']);
    expect(entryEffectiveDates('2. Amendment of subsection (h) filed 12-5-86; effective thirtieth day thereafter (Register 86, No. 51).')).toEqual(['1987-01-04']);
  });

  test('"effective upon filing" is the filing date', () => {
    expect(entryEffectiveDates('3. Amendment filed 3-6-2007 as an emergency; effective upon filing (Register 2007, No. 10).')).toEqual(['2007-03-06']);
  });

  test('changes without regulatory effect and editorial corrections contribute nothing', () => {
    expect(
      entryEffectiveDates('12. Change without regulatory effect amending subsections (b)(1)(A) filed 7-14-2021 pursuant to section 100, title 1, California Code of Regulations (Register 2021, No. 29).'),
    ).toEqual([]);
    expect(entryEffectiveDates('10. Editorial correction of Note (Register 2015, No. 21).')).toEqual([]);
  });
});

describe('newestRegulationEffectiveDate', () => {
  test('the newest candidate across entries wins, and a dateless note yields silence', () => {
    expect(
      newestRegulationEffectiveDate([
        '1. New section filed 12-15-92; operative 1-14-93 (Register 92, No. 52).',
        '9. Amendment filed 12-31-2012; operative 1-30-2013 (Register 2013, No. 1).',
        '10. Editorial correction of Note (Register 2015, No. 21).',
        '11. Amendment filed 12-12-2016; operative 1/1/2017 (Register 2016, No. 51).',
        '12. Change without regulatory effect filed 7-14-2021 (Register 2021, No. 29).',
      ]),
    ).toBe('2017-01-01');
    expect(newestRegulationEffectiveDate(['5. Editorial correction (Register 91, No. 32).'])).toBeUndefined();
    expect(newestRegulationEffectiveDate([])).toBeUndefined();
  });

  test('an operative date earlier than its filing date still counts (Wage Order 9 entry 9)', () => {
    expect(
      newestRegulationEffectiveDate([
        '9. Repealer and new section filed 5-7-2002; operative 1-1-2001. Submitted to OAL for printing only (Register 2002, No. 19).',
      ]),
    ).toBe('2001-01-01');
  });
});
