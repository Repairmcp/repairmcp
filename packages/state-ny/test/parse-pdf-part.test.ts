import { describe, expect, test } from 'bun:test';
import { splitPartText } from '../src/parse-pdf-part.js';
import { NY_PART142_SOURCE, NY_PART82_SOURCE, readCr82Edition, readPart142EffectiveDate } from '../src/sources-parts.js';

export const CR82_TEXT = [
  'CR-82 (5/26) MOTOR VEHICLE REPAIR SHOP REGULATIONS',
  'CONTENTS',
  '82.1 Introduction . . . . . . . . 1',
  '82.2 Definitions . . . . . . . . 1',
  'Vehicle Safety Region 6',
  'Counties: Kings, Queens, Richmond',
  'Section 82.1 Introduction.',
  'Chapter 946 of the Laws of 1974 created article 12-A of the Vehicle and Traffic Law.',
  'This Part is promulgated to realize those purposes.',
  '82.2 Definitions.',
  'The following definitions shall apply to this Part:',
  '(a) Day. Means calendar day.',
  'Part 82 - Page 1',
  '(b) Estimate. The repair shop\'s determination of the cost of parts.',
  ...Array.from({ length: 17 }, (_, i) => {
    const n = i + 3;
    if (n === 5) {
      return '82.5 Obligations of the repair shop.\nEvery repair shop shall furnish the customer an estimate in writing before beginning repairs.';
    }
    if (n === 18) {
      return '82.18 Insurers and repair shops.\nBody 18.';
    }
    return `82.${n} Title ${n}.\nBody ${n}.`;
  }),
  'Part 82 - Page 16',
  'APPENDIX A - Official Indoor Repair Shop Sign',
  'NOTICE TO CONSUMERS',
].join('\n');

export const CR142_TEXT = [
  'Part', '142', 'Minimum Wage Order for Miscellaneous Industries and Occupations',
  'As amended', 'Effective June 24, 2020', 'CR 142 (12/25)',
  'PART 142', 'Subpart 142-1 Coverage', 'Sec. 142-1.1 Coverage of Part.',
  '§ 142-1.1 Coverage of Part',
  'This Part shall apply to all employees.',
  // The real CR 142 extraction wraps the Subpart 142-2 banner sentence
  // across several bare lines, and that wrapped sentence itself contains
  // the literal text "SUBPART 142-3" (it is explaining what 142-2 does
  // NOT cover) — a false-positive match for the bodyEnd/skipFrom markers
  // that must not end the body or leak into skipOnly's line-shape check.
  // The contents list's "Sec." header also prints on its OWN line in the
  // real PDF, separate from the cite that follows.
  'SUBPART 142-2',
  'PROVISIONS APPLICABLE TO ALL EMPLOYEES SUBJECT TO THIS PART, EXCEPT',
  'EMPLOYEES IN NONPROFITMAKING INSTITUTIONS COVERED BY THE PROVISIONS OF',
  'SUBPART 142-3',
  'Sec.',
  '142-2.1 Basic minimum hourly wage rate and allowances',
  '142-2.2 Overtime rate',
  '142-2.3 Call-in pay',
  'REGULATIONS',
  ...Array.from({ length: 23 }, (_, i) => {
    const n = i + 1;
    if (n === 4) {
      return '§ 142-2.4 Additional rate for split shift and spread of hours.\nAn employee shall receive one additional hour of pay at the basic minimum hourly rate when the spread of hours exceeds 10 hours in a day.';
    }
    return `§ 142-2.${n} Title ${n}.\nBody ${n}.`;
  }),
  'SUBPART 142-3',
  'PROVISIONS APPLICABLE TO EMPLOYEES IN NONPROFITMAKING INSTITUTIONS',
  '§ 142-3.1 Basic minimum hourly wage rate.', 'Nonprofit body.',
].join('\n');

describe('splitPartText', () => {
  test('CR-82: 19 sections, contents and appendices discarded, page footers dropped', () => {
    const s = splitPartText(CR82_TEXT, NY_PART82_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART82_SOURCE.cites);
    expect(s[0]).toEqual({ cite: '82.1', heading: 'Introduction.', text: 'Chapter 946 of the Laws of 1974 created article 12-A of the Vehicle and Traffic Law.\nThis Part is promulgated to realize those purposes.' });
    expect(s[1]!.text).toBe('The following definitions shall apply to this Part:\n(a) Day. Means calendar day.\n(b) Estimate. The repair shop\'s determination of the cost of parts.');
    expect(s[4]).toEqual({ cite: '82.5', heading: 'Obligations of the repair shop.', text: 'Every repair shop shall furnish the customer an estimate in writing before beginning repairs.' });
    expect(s[17]!.heading).toBe('Insurers and repair shops.');
    expect(s[18]!.text).toBe('Body 19.');
    expect(JSON.stringify(s)).not.toContain('APPENDIX');
    expect(JSON.stringify(s)).not.toContain('Part 82 - Page');
  });
  test('CR 142: 24 sections, subpart 142-3 excluded, contents lines are not heads', () => {
    const s = splitPartText(CR142_TEXT, NY_PART142_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART142_SOURCE.cites);
    expect(s[0]).toEqual({ cite: '142-1.1', heading: 'Coverage of Part', text: 'This Part shall apply to all employees.' });
    // The SUBPART banner and its Sec./bare-cite contents lines sit between
    // 142-1.1's body and 142-2.1's head — skipFrom must discard all of them,
    // leaving each section's text as exactly its own body line.
    expect(s[1]).toEqual({
      cite: '142-2.1',
      heading: 'Title 1',
      text: 'Body 1.',
    });
    expect(s[23]!.cite).toBe('142-2.23');
    expect(JSON.stringify(s)).not.toContain('Nonprofit body');
    expect(JSON.stringify(s)).not.toContain('SUBPART');
    expect(JSON.stringify(s)).not.toContain('Sec. 142-2.1');
    expect(JSON.stringify(s)).not.toContain('142-2.2 Overtime rate');
  });
  test('the cover readers', () => {
    expect(readCr82Edition(CR82_TEXT)).toBe('CR-82 (5/26)');
    expect(readPart142EffectiveDate(CR142_TEXT)).toBe('2020-06-24');
    expect(() => readCr82Edition('nothing')).toThrow(/CR-82/);
    expect(() => readPart142EffectiveDate('nothing')).toThrow(/Effective/);
  });
  test('a body with no start marker fails loudly', () => {
    expect(() => splitPartText('just text', NY_PART82_SOURCE.split)).toThrow(/body start/);
  });
  test('skipOnly rejects a non-contents-shaped line inside the skip region', () => {
    // A real prose sentence in mixed case sitting inside the SUBPART skip
    // region: not a contents entry and not an all-caps banner line, so
    // skipOnly must reject it rather than silently discarding it.
    const rogue = CR142_TEXT.replace(
      '142-2.1 Basic minimum hourly wage rate and allowances',
      '142-2.1 Basic minimum hourly wage rate and allowances\nEmployers must post this order where employees can see it.',
    );
    expect(() => splitPartText(rogue, NY_PART142_SOURCE.split)).toThrow(/not contents-shaped/);
  });
  test('skipOnly fails loudly when the skip region runs to the end of the body', () => {
    // The SUBPART banner is the last thing in the body — no section head
    // follows it, so the split must fail rather than silently drop text.
    const noHeadAfterBanner = [
      '§ 142-1.1 Coverage of Part',
      'This Part shall apply to all employees.',
      'SUBPART 142-2 PROVISIONS APPLICABLE TO ALL EMPLOYEES',
    ].join('\n');
    expect(() => splitPartText(noHeadAfterBanner, NY_PART142_SOURCE.split)).toThrow(/ran to the end of the body/);
  });
});
