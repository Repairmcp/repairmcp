import { describe, expect, test } from 'bun:test';
import {
  complaintId,
  formatComplaintCitation,
  formatLawCitation,
  formatRecallCitation,
  lawId,
  parseNhtsaId,
  recallId,
} from '../src/identity';
import type { NhtsaLawCorpusMeta, NhtsaLawSection } from '../src/laws/schema';

const RECALL = {
  campaignNumber: '21V978000',
  component: 'POWER TRAIN:DRIVELINE:DRIVESHAFT',
  summary: 'Driveshaft bolts may loosen.',
  reportReceivedDate: '2021-12-16',
  sourceUrl: 'https://api.nhtsa.gov/recalls/recallsByVehicle?make=ford&model=transit&modelYear=2020',
};

const COMPLAINT = {
  odiNumber: '11753468',
  summary: 'Odometer discrepancy.',
  dateComplaintFiled: '2026-07-29',
  sourceUrl: 'https://api.nhtsa.gov/complaints/odinumber?odinumber=11753468',
  allegationCaveat: 'Consumer complaint; not a NHTSA defect finding.',
};

const LAW_META: NhtsaLawCorpusMeta = {
  title: 49,
  chapter: 301,
  chapterName: 'MOTOR VEHICLE SAFETY',
  currentThrough: '2026-04-30',
  publicLaw: 'P.L. 119-87',
  capturedAt: '2026-08-27',
  sourceUrl: 'https://uscode.house.gov/view.xhtml?path=/prelim@title49/subtitle6/partA/chapter301&edition=prelim',
};

const LAW_SECTION: NhtsaLawSection = {
  section: '30122',
  heading: 'Making safety devices and elements inoperative',
  subchapter: 'SUBCHAPTER II',
  text: '(a) Definition.—...',
  sourceUrl:
    'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section30122&num=0&edition=prelim',
};

describe('id namespace', () => {
  test('round-trips all three kinds', () => {
    expect(parseNhtsaId(recallId('21V978000'))).toEqual({ kind: 'recall', key: '21V978000' });
    expect(parseNhtsaId(complaintId('11753468'))).toEqual({ kind: 'complaint', key: '11753468' });
    expect(parseNhtsaId(lawId('30122'))).toEqual({ kind: 'law', key: '30122' });
  });

  test('rejects unprefixed and junk ids', () => {
    expect(parseNhtsaId('21V978000')).toBeNull();
    expect(parseNhtsaId('inquiry:40990')).toBeNull();
    expect(parseNhtsaId('')).toBeNull();
  });
});

describe('citations (single producer, UTC-locked)', () => {
  test('recall shortForm reads for a supplement note', () => {
    const citation = formatRecallCitation(RECALL);
    expect(citation.shortForm).toBe('NHTSA Recall 21V978000 (reported 12/16/2021)');
    expect(citation.url).toContain('campaignNumber=21V978000');
    expect(citation.publishedAt?.toISOString()).toBe('2021-12-16T00:00:00.000Z');
  });

  test('recall without a report date omits the parenthetical rather than guessing', () => {
    const citation = formatRecallCitation({ ...RECALL, reportReceivedDate: undefined });
    expect(citation.shortForm).toBe('NHTSA Recall 21V978000');
  });

  test('complaint shortForm uses the filed date', () => {
    const citation = formatComplaintCitation(COMPLAINT);
    expect(citation.shortForm).toBe('NHTSA Complaint ODI 11753468 (filed 7/29/2026)');
    expect(citation.url).toContain('odinumber=11753468');
  });

  test('law shortForm states the corpus currency, from meta, never hardcoded', () => {
    const citation = formatLawCitation(LAW_SECTION, LAW_META);
    expect(citation.shortForm).toBe('49 U.S.C. §30122 (current through P.L. 119-87, 4/30/2026)');
    expect(citation.longForm).toContain('Making safety devices and elements inoperative');
    expect(citation.url).toContain('section30122');

    const moved = formatLawCitation(LAW_SECTION, {
      ...LAW_META,
      currentThrough: '2027-01-15',
      publicLaw: 'P.L. 120-1',
    });
    expect(moved.shortForm).toBe('49 U.S.C. §30122 (current through P.L. 120-1, 1/15/2027)');
  });

  test('citation dates are invariant to process.env.TZ', () => {
    const before = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatRecallCitation(RECALL).shortForm).toContain('12/16/2021');
      process.env.TZ = 'Asia/Tokyo';
      expect(formatRecallCitation(RECALL).shortForm).toContain('12/16/2021');
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
