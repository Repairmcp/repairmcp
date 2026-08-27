/**
 * NHTSA's source identity and citation construction, in one place — the same
 * single-producer discipline as packages/deg/src/identity.ts. Three record
 * kinds share one id namespace (`recall:`, `complaint:`, `law:`), and every
 * citation string a shop might paste into a supplement or dispute letter is
 * built here and nowhere else.
 *
 * Citations construct core's `Citation` interface directly rather than going
 * through `buildCitation`: its `#id` short form is right for DEG inquiry
 * numbers and wrong for "Recall 21V978000" or "49 U.S.C. §30122". Dates still
 * route through `fmtDateUtc` — that part of the discipline is absolute.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { campaignUrl, complaintUrl } from './urls.js';
import type { NhtsaComplaint, NhtsaRecall } from './schema.js';
import type { NhtsaLawCorpusMeta, NhtsaLawSection } from './laws/schema.js';

export const NHTSA_IDENTITY = {
  sourceId: 'nhtsa',
  sourceName: 'National Highway Traffic Safety Administration',
  sourceShortName: 'NHTSA',
  sourceUrl: 'https://www.nhtsa.gov',
  description:
    'Federal vehicle safety data: recall campaigns and consumer complaints queried live, plus the federal motor vehicle safety statute (49 U.S.C. chapter 301).',
  itemNoun: 'record',
  itemNounPlural: 'records',
} as const;

export type NhtsaItemKind = 'recall' | 'complaint' | 'law';

export function recallId(campaignNumber: string): string {
  return `recall:${campaignNumber}`;
}

export function complaintId(odiNumber: string): string {
  return `complaint:${odiNumber}`;
}

export function lawId(section: string): string {
  return `law:${section}`;
}

export function parseNhtsaId(id: string): { kind: NhtsaItemKind; key: string } | null {
  const match = /^(recall|complaint|law):(.+)$/.exec(id.trim());
  if (!match) return null;
  return { kind: match[1] as NhtsaItemKind, key: (match[2] ?? '').trim() };
}

/** `YYYY-MM-DD` → UTC-locked `M/D/YYYY`, or undefined when the date is absent. */
function isoDateToDisplay(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

function isoDateToDate(iso: string | undefined): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatRecallCitation(recall: NhtsaRecall): Citation {
  const date = isoDateToDisplay(recall.reportReceivedDate);
  const url = campaignUrl(recall.campaignNumber);
  return {
    shortForm: date
      ? `NHTSA Recall ${recall.campaignNumber} (reported ${date})`
      : `NHTSA Recall ${recall.campaignNumber}`,
    longForm: date
      ? `${NHTSA_IDENTITY.sourceName} recall campaign ${recall.campaignNumber}, reported ${date}, ${url}`
      : `${NHTSA_IDENTITY.sourceName} recall campaign ${recall.campaignNumber}, ${url}`,
    sourceId: NHTSA_IDENTITY.sourceId,
    sourceName: NHTSA_IDENTITY.sourceName,
    itemId: recall.campaignNumber,
    url,
    retrievedAt: new Date(),
    publishedAt: isoDateToDate(recall.reportReceivedDate),
  };
}

export function formatComplaintCitation(complaint: NhtsaComplaint): Citation {
  const date = isoDateToDisplay(complaint.dateComplaintFiled);
  const url = complaintUrl(complaint.odiNumber);
  return {
    shortForm: date
      ? `NHTSA Complaint ODI ${complaint.odiNumber} (filed ${date})`
      : `NHTSA Complaint ODI ${complaint.odiNumber}`,
    longForm: date
      ? `${NHTSA_IDENTITY.sourceName} consumer complaint ODI ${complaint.odiNumber}, filed ${date}, ${url}`
      : `${NHTSA_IDENTITY.sourceName} consumer complaint ODI ${complaint.odiNumber}, ${url}`,
    sourceId: NHTSA_IDENTITY.sourceId,
    sourceName: NHTSA_IDENTITY.sourceName,
    itemId: complaint.odiNumber,
    url,
    retrievedAt: new Date(),
    publishedAt: isoDateToDate(complaint.dateComplaintFiled),
  };
}

/**
 * `49 U.S.C. §30122 (current through P.L. 119-87, 4/30/2026)` — the currency
 * comes from the corpus's own OLRC marker, never hardcoded, so a re-capture
 * moves every law citation at once.
 */
export function formatLawCitation(
  section: NhtsaLawSection,
  meta: NhtsaLawCorpusMeta,
): Citation {
  const currentThrough = isoDateToDisplay(meta.currentThrough) ?? meta.currentThrough;
  return {
    shortForm: `49 U.S.C. §${section.section} (current through ${meta.publicLaw}, ${currentThrough})`,
    longForm: `49 U.S.C. §${section.section} (${section.heading}), United States Code current through ${meta.publicLaw} (${currentThrough}), ${section.sourceUrl}`,
    sourceId: NHTSA_IDENTITY.sourceId,
    sourceName: NHTSA_IDENTITY.sourceName,
    itemId: section.section,
    url: section.sourceUrl,
    retrievedAt: new Date(),
  };
}
