import type { NhtsaComplaint } from './schema.js';

const COLLISION_TERMS = [
  'air bag',
  'airbag',
  'srs',
  'seat belt',
  'restraint',
  'pretensioner',
  'adas',
  'camera',
  'radar',
  'lidar',
  'calibration',
  'steering',
  'suspension',
  'wheel',
  'tire',
  'brake',
  'structure',
  'frame',
  'pillar',
  'roof',
  'glass',
  'windshield',
  'visibility',
  'electrical',
  'fire',
  'battery',
  'high voltage',
  'ev',
  'door',
  'latch',
  'lock',
  'lighting',
  'headlamp',
];

export interface ComplaintRelevanceOpts {
  keyword?: string;
  component?: string;
  now?: Date;
}

export interface ComplaintRelevance {
  score: number;
  matchedTerms: string[];
  breakdown: {
    keyword: number;
    category: number;
    severity: number;
    recency: number;
  };
}

function normalize(text: string | undefined): string {
  return (text ?? '').toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function textContainsSearchTerm(
  haystack: string,
  term: string | undefined,
): boolean {
  const normalizedTerm = normalize(term).trim().replace(/\s+/g, ' ');
  if (!normalizedTerm) return false;

  const pattern = normalizedTerm.split(' ').map(escapeRegExp).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(
    haystack,
  );
}

function startOfUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function shiftUtcMonthsClamped(date: Date, months: number): Date {
  const firstOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const year = firstOfTargetMonth.getUTCFullYear();
  const month = firstOfTargetMonth.getUTCMonth();
  const day = Math.min(date.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

function filedWithin36Months(complaint: NhtsaComplaint, now: Date): boolean {
  if (!complaint.dateComplaintFiled) return false;
  const filed = new Date(complaint.dateComplaintFiled);
  if (Number.isNaN(filed.getTime())) return false;
  const filedDay = startOfUtcDate(filed);
  const nowDay = startOfUtcDate(now);
  const cutoffDay = shiftUtcMonthsClamped(nowDay, -36);
  return filedDay.getTime() <= nowDay.getTime() && filedDay.getTime() >= cutoffDay.getTime();
}

export function scoreComplaintRelevance(
  complaint: NhtsaComplaint,
  opts: ComplaintRelevanceOpts = {},
): ComplaintRelevance {
  const summary = normalize(complaint.summary);
  const component = normalize(complaint.component);
  const haystack = `${summary} ${component}`;
  const matchedTerms = COLLISION_TERMS.filter((term) =>
    textContainsSearchTerm(haystack, term),
  );

  let keyword = 0;
  if (textContainsSearchTerm(haystack, opts.keyword)) keyword += 0.5;
  if (textContainsSearchTerm(component, opts.component)) keyword += 0.5;

  const category = matchedTerms.length > 0 ? 0.25 : 0;
  const severity =
    complaint.crash ||
    complaint.fire ||
    (complaint.injuryCount ?? 0) > 0 ||
    (complaint.deathCount ?? 0) > 0
      ? 0.2
      : 0;
  const recency = filedWithin36Months(complaint, opts.now ?? new Date()) ? 0.05 : 0;

  const score = Math.min(1, keyword + category + severity + recency);
  return {
    score,
    matchedTerms,
    breakdown: { keyword, category, severity, recency },
  };
}
