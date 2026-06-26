import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDetailHtml } from '../src/parser.js';

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseDetailHtml - resolved inquiry', () => {
  test('extracts all body fields', () => {
    const result = parseDetailHtml(41477, fixture('inquiry-resolved.html'));
    expect(result.inquiryType).toBe('Refinish Operations');
    expect(result.areaOfVehicle).toBe('Hood');
    expect(result.oemPartNumber).toBe('90189A0002 and 7539535070');
    expect(result.issueSummary).toBe('Is blend time included for two-tone refinish?');
    expect(result.suggestedAction).toBe('Include blend time per P-pages.');
    expect(result.resolution).toBe('CCC confirmed blend time is included per P-pages.');
    expect(result.resolutionStatus).toBe('resolved');
  });

  test('extracts vehicle fields', () => {
    const result = parseDetailHtml(41477, fixture('inquiry-resolved.html'));
    expect(result.year).toBe(2022);
    expect(result.make).toBe('Toyota');
    expect(result.model).toBe('Camry');
    expect(result.vehicleBody).toBe('Sedan');
  });

  test('extracts submitted datetime', () => {
    const result = parseDetailHtml(41477, fixture('inquiry-resolved.html'));
    expect(result.submittedDatetime).toBe('2023-01-15 10:30:00');
  });
});

describe('parseDetailHtml - pending inquiry', () => {
  test('sets resolution to "Awaiting resolution" when Resolution cell is empty', () => {
    const result = parseDetailHtml(41999, fixture('inquiry-pending.html'));
    expect(result.resolution).toBe('Awaiting resolution');
    expect(result.resolutionStatus).toBe('pending');
  });

  test('still extracts other fields when pending', () => {
    const result = parseDetailHtml(41999, fixture('inquiry-pending.html'));
    expect(result.issueSummary).toBe('Is OEM part number required for supplement?');
    expect(result.oemPartNumber).toBe('7539635020');
    expect(result.year).toBe(2023);
  });
});

describe('parseDetailHtml - old format with Description field', () => {
  test('extracts issueSummary from Section6_IssueSummary marker', () => {
    const result = parseDetailHtml(18849, fixture('inquiry-old-format.html'));
    expect(result.issueSummary).toBe('Does blend time apply to non-adjacent panels?');
  });

  test('extracts suggestedAction from Section6_SuggestedAction marker', () => {
    const result = parseDetailHtml(18849, fixture('inquiry-old-format.html'));
    expect(result.suggestedAction).toBe('Blend time should be allowed per estimating guide.');
  });

  test('extracts areaOfVehicle from Section6_AreaVehicle marker', () => {
    const result = parseDetailHtml(18849, fixture('inquiry-old-format.html'));
    expect(result.areaOfVehicle).toBe('Hood');
  });

  test('resolution is present and marked resolved', () => {
    const result = parseDetailHtml(18849, fixture('inquiry-old-format.html'));
    expect(result.resolution).toBe('No change; estimating guide is clear on this point.');
    expect(result.resolutionStatus).toBe('resolved');
  });
});
