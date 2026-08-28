/**
 * The WA vertical's source identity and citation construction, in one place —
 * the same single-producer discipline as packages/nhtsa/src/identity.ts. Two
 * cite codes share one id namespace (`wac:`, `rcw:`), and every citation
 * string a shop might paste into a dispute letter is built here and nowhere
 * else.
 *
 * Citations construct core's `Citation` directly rather than going through
 * `buildCitation`: its `#id` short form is right for DEG inquiry numbers and
 * wrong for "WAC 284-30-330". Dates still route through `fmtDateUtc` — that
 * part of the discipline is absolute. The short form carries the date the
 * CURRENT text took effect ("WAC 284-30-330, effective 10/30/2016") and omits
 * the clause entirely when the date is unknown — which is the normal case for
 * RCW, whose history notes are session-law citations without dates.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import type { WaCode, WaSection } from './schema.js';

export const WA_IDENTITY = {
  sourceId: 'state-wa',
  sourceName: 'Washington State Legislature',
  sourceShortName: 'WA Law',
  sourceUrl: 'https://leg.wa.gov',
  description:
    'Washington state law for collision repair facilities: insurance claims handling (WAC 284-30, RCW 48.30), auto repair law (RCW 46.71), workplace safety (WISHA), and employment rules — captured verbatim from leg.wa.gov.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const CODE_LONG_NAME: Record<WaCode, string> = {
  WAC: 'Washington Administrative Code',
  RCW: 'Revised Code of Washington',
};

export function waId(code: WaCode, cite: string): string {
  return `${code.toLowerCase()}:${cite}`;
}

export function parseWaId(id: string): { code: WaCode; cite: string } | null {
  const match = /^(wac|rcw):(.+)$/.exec(id.trim());
  if (!match) return null;
  return { code: match[1]!.toUpperCase() as WaCode, cite: (match[2] ?? '').trim() };
}

/** "WAC 284-30-330" / "RCW 46.71.025" — the display cite everything renders. */
export function displayCite(section: Pick<WaSection, 'code' | 'cite'>): string {
  return `${section.code} ${section.cite}`;
}

export type CitationQuery =
  | { kind: 'section'; code: WaCode; cite: string }
  | { kind: 'chapter'; code: WaCode; chapter: string }
  | null;

/**
 * Is the WHOLE query a citation? Three groups make a section, two make a
 * chapter — so "WAC 284-30" constrains to the chapter instead of hard-zeroing,
 * which is the May branch bug this replaces. Accepts the code word ("WAC
 * 284-30-330"), id form ("wac:284-30-330"), the branch's normalized ids
 * ("wac-284-30-390", "rcw-48-30-015"), and bare cites, whose separators name
 * the code: hyphens are WAC, dots are RCW. Embedded citations inside longer
 * text are NOT resolved here — the fuzzy scorer handles those.
 */
export function resolveCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let code: WaCode | undefined;
  let body = trimmed;
  const codeMatch = /^(wac|rcw)[\s:.-]+(.+)$/i.exec(trimmed);
  if (codeMatch) {
    code = codeMatch[1]!.toUpperCase() as WaCode;
    body = (codeMatch[2] ?? '').trim();
  }

  body = body.toUpperCase();
  if (!/^[0-9A-Z.-]+$/.test(body)) return null;

  const groups = body.split(/[.-]/).filter((g) => g.length > 0);
  if (!groups.every((g) => /^\d+[A-Z]?$/.test(g))) return null;
  if (groups.length !== 2 && groups.length !== 3) return null;

  if (!code) {
    if (body.includes('-')) code = 'WAC';
    else if (body.includes('.')) code = 'RCW';
    else return null;
  }

  const joined = groups.join(code === 'WAC' ? '-' : '.');
  return groups.length === 3
    ? { kind: 'section', code, cite: joined }
    : { kind: 'chapter', code, chapter: joined };
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

export function formatWaCitation(section: WaSection): Citation {
  const display = displayCite(section);
  const effective = isoDateToDisplay(section.effectiveDate);
  const chapterPart = `chapter ${section.chapter} ${section.code} (${section.chapterTitle})`;
  return {
    shortForm: effective ? `${display}, effective ${effective}` : display,
    longForm: effective
      ? `${CODE_LONG_NAME[section.code]} ${section.cite} (${section.heading}), ${chapterPart}, effective ${effective}, ${section.sourceUrl}`
      : `${CODE_LONG_NAME[section.code]} ${section.cite} (${section.heading}), ${chapterPart}, ${section.sourceUrl}`,
    sourceId: WA_IDENTITY.sourceId,
    sourceName: WA_IDENTITY.sourceName,
    itemId: waId(section.code, section.cite),
    url: section.sourceUrl,
    retrievedAt: new Date(),
    publishedAt: isoDateToDate(section.effectiveDate),
  };
}
