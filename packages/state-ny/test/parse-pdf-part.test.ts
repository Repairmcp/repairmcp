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
  '(c) Guarantee. An obligation undertaken by a repair shop to re-repair a vehicle at no charge.',
  // The real CR-82 booklet interrupts 82.2's definitions here (page 6) with
  // a sidebar: the running "Sec." contents list (all 19 entries, some
  // wrapped onto a lowercase continuation line, with a SECOND bare "Sec."
  // partway through), the title block, and four "Please note: ..."
  // sentences about DMV's non-official formatting. It occurs exactly once
  // and must not reach 82.2's text — skipUntil ends the region inclusively
  // at the "...in this document in any way." line.
  'Sec.',
  '82.1 Introduction',
  '82.2 Definitions',
  '82.3 Registration',
  '82.4 Suspension, revocation or refusal to issue',
  'registration',
  '82.5 Obligations of the repair shop',
  '82.6 Civil penalty and restitution',
  '82.7 Signs',
  '82.8 Charges',
  '82.9 Records',
  '82.10 Consumer complaints',
  'Sec.',
  '82.11 Local law and ordinances',
  '82.12 Change of ownership, name or location',
  '82.13 Quality repairs, repair shop standards,',
  'subcontractors',
  '82.14 Hearings',
  '82.15 Appeals',
  '82.16 Review board',
  '82.17 Unregistered, suspended or revoked repair',
  'shops',
  '82.18 Insurers and repair shops',
  '82.19 Consumers and repair shops',
  'PART 82',
  'MOTOR VEHICLE REPAIR SHOP',
  '(Statutory authority: VTL Sections 215, 398-g)',
  'Please note: The text of a Part of the Commissioner’s Regulations in this document is not an exact duplicate of',
  'the official version of the Regulation. DMV staff may have changed some tabs/spacing, and may have changed',
  'the text to correct any typographical errors that appear in the official Regulations. These corrections do not',
  'change the meaning or intent of the Regulation in this document in any way.',
  '(d) Invoice. A bill in writing listing the details of the transaction between the repair shop and the customer.',
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
  // The real Subpart 142-3 banner, its OWN "Sec." contents list (which also
  // repeats the "MINIMUM WAGE AND REGULATIONS" running head and a bare
  // cite-only contents entry with no §), and finally the unique
  // `§ 142-3.1` head that bodyEnd matches on first occurrence — everything
  // from "SUBPART 142-3" through the line just before the § head sits
  // inside the same skipFrom region opened after 142-1.1's body and is
  // discarded when the body is truncated at bodyEnd (truncatedAtBodyEnd).
  'SUBPART 142-3',
  'PROVISIONS APPLICABLE TO EMPLOYEES IN NONPROFITMAKING INSTITUTIONS WHICH',
  'Sec.',
  'MINIMUM WAGE AND REGULATIONS',
  '142-3.1 Basic minimum hourly wage rate',
  '§ 142-3.1 Basic minimum hourly wage rate.', 'Nonprofit body.',
].join('\n');

describe('splitPartText', () => {
  test('CR-82: 19 sections, contents and appendices discarded, page footers dropped', () => {
    const s = splitPartText(CR82_TEXT, NY_PART82_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART82_SOURCE.cites);
    expect(s[0]).toEqual({ cite: '82.1', heading: 'Introduction.', text: 'Chapter 946 of the Laws of 1974 created article 12-A of the Vehicle and Traffic Law.\nThis Part is promulgated to realize those purposes.' });
    expect(s[4]).toEqual({ cite: '82.5', heading: 'Obligations of the repair shop.', text: 'Every repair shop shall furnish the customer an estimate in writing before beginning repairs.' });
    expect(s[17]!.heading).toBe('Insurers and repair shops.');
    expect(s[18]!.text).toBe('Body 19.');
    expect(JSON.stringify(s)).not.toContain('APPENDIX');
    expect(JSON.stringify(s)).not.toContain('Part 82 - Page');
  });
  test('CR-82: the page-6 sidebar (contents list, title block, Please note disclaimer) does not leak into 82.2', () => {
    const s = splitPartText(CR82_TEXT, NY_PART82_SOURCE.split);
    expect(s[1]).toEqual({
      cite: '82.2',
      heading: 'Definitions.',
      text:
        "The following definitions shall apply to this Part:\n" +
        '(a) Day. Means calendar day.\n' +
        "(b) Estimate. The repair shop's determination of the cost of parts.\n" +
        '(c) Guarantee. An obligation undertaken by a repair shop to re-repair a vehicle at no charge.\n' +
        '(d) Invoice. A bill in writing listing the details of the transaction between the repair shop and the customer.',
    });
    const text82_2 = s[1]!.text;
    expect(text82_2).not.toContain('Sec.');
    expect(text82_2).not.toContain('82.1 Introduction');
    expect(text82_2).not.toContain('PART 82');
    expect(text82_2).not.toContain('Please note');
    expect(text82_2).not.toContain('registration\n');
    expect(text82_2).not.toContain('subcontractors');
  });
  test('a skip region exceeding skipMaxLines throws naming the region', () => {
    const longSidebar = [
      'Section 82.1 Introduction.',
      'Chapter 946 of the Laws of 1974 created article 12-A of the Vehicle and Traffic Law.',
      '82.2 Definitions.',
      'The following definitions shall apply to this Part:',
      '(a) Day. Means calendar day.',
      'Sec.',
      ...Array.from({ length: 41 }, (_, i) => `filler line ${i + 1}`),
      'in this document in any way.',
      '(b) Estimate. The cost of parts.',
    ].join('\n');
    expect(() => splitPartText(longSidebar, NY_PART82_SOURCE.split)).toThrow(/exceeds/);
  });
  test('a spec with skipFrom but neither skipOnly nor skipUntil fails loudly', () => {
    expect(() => splitPartText(CR82_TEXT, { ...NY_PART82_SOURCE.split, skipUntil: undefined, skipOnly: undefined })).toThrow(/exactly one of skipOnly or skipUntil/);
  });
  test('a spec with skipFrom and both skipOnly and skipUntil fails loudly', () => {
    expect(() => splitPartText(CR82_TEXT, { ...NY_PART82_SOURCE.split, skipOnly: /^.*$/ })).toThrow(/exactly one of skipOnly or skipUntil/);
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
    // Nothing from the trailing Subpart 142-3 banner or its own contents
    // list (which repeats "MINIMUM WAGE AND REGULATIONS" and prints a bare
    // "142-3.1 ..." cite line) reaches any section's text.
    expect(JSON.stringify(s)).not.toContain('NONPROFITMAKING');
    expect(JSON.stringify(s)).not.toContain('MINIMUM WAGE AND REGULATIONS');
    expect(JSON.stringify(s)).not.toContain('142-3.1');
  });
  test('a third SUBPART 142-3 occurrence after the real § 142-3.1 head is beyond bodyEnd and changes nothing', () => {
    // bodyEnd is the FIRST match of the unique `§ 142-3.1` head, so
    // anything after it — including another literal "SUBPART 142-3" line —
    // sits outside the sliced body and cannot affect the split.
    const extra = `${CR142_TEXT}\nSUBPART 142-3\nSome further nonprofit provisions.`;
    const s = splitPartText(extra, NY_PART142_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART142_SOURCE.cites);
    expect(s.length).toBe(24);
    expect(JSON.stringify(s)).not.toContain('Some further nonprofit provisions');
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
