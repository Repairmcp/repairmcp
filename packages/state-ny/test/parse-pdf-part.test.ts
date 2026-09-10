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
  ...Array.from({ length: 17 }, (_, i) => `82.${i + 3} Title ${i + 3}.\nBody ${i + 3}.`),
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
  'SUBPART 142-2', 'Sec. 142-2.1 Basic minimum hourly wage rate and allowances',
  ...Array.from({ length: 23 }, (_, i) => `§ 142-2.${i + 1} Title ${i + 1}.\nBody ${i + 1}.`),
  '§ 142-3.1 Basic minimum hourly wage rate.', 'Nonprofit body.',
].join('\n');

describe('splitPartText', () => {
  test('CR-82: 19 sections, contents and appendices discarded, page footers dropped', () => {
    const s = splitPartText(CR82_TEXT, NY_PART82_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART82_SOURCE.cites);
    expect(s[0]).toEqual({ cite: '82.1', heading: 'Introduction.', text: 'Chapter 946 of the Laws of 1974 created article 12-A of the Vehicle and Traffic Law.\nThis Part is promulgated to realize those purposes.' });
    expect(s[1]!.text).toBe('The following definitions shall apply to this Part:\n(a) Day. Means calendar day.\n(b) Estimate. The repair shop\'s determination of the cost of parts.');
    expect(s[18]!.text).toBe('Body 19.');
    expect(JSON.stringify(s)).not.toContain('APPENDIX');
    expect(JSON.stringify(s)).not.toContain('Part 82 - Page');
  });
  test('CR 142: 24 sections, subpart 142-3 excluded, contents lines are not heads', () => {
    const s = splitPartText(CR142_TEXT, NY_PART142_SOURCE.split);
    expect(s.map((x) => x.cite)).toEqual(NY_PART142_SOURCE.cites);
    expect(s[0]).toEqual({ cite: '142-1.1', heading: 'Coverage of Part', text: 'This Part shall apply to all employees.' });
    expect(s[23]!.cite).toBe('142-2.23');
    expect(JSON.stringify(s)).not.toContain('Nonprofit body');
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
});
