/**
 * The citation identity factory: one per-state config produces the id
 * namespace, the citation-shaped-query resolver, and the citation formatter.
 * Single-producer discipline as everywhere in this repo — every citation
 * string a shop might paste into a dispute letter is built here.
 *
 * Bare-cite inference is CONFIG, not code: hyphens mean WAC in Washington
 * and MCA in Montana; dots mean RCW there and ARM here. Dates still route
 * through fmtDateUtc — that part of the discipline is absolute.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import type { StateSection } from './schema.js';

export interface CodeConfig {
  /** 'WAC' | 'RCW' | 'MCA' | 'ARM' … */
  code: string;
  /** 'Washington Administrative Code' … — the long form's leading name. */
  longName: string;
  /** Canonical joiner for resolved cites of this code. */
  separator: '.' | '-';
  /** Which bare-cite separators this code claims, checked in config order. */
  claimsBareSeparators?: readonly ('.' | '-')[];
  /** Per-group shape; default allows a trailing letter (Title 50A style). */
  groupShape?: RegExp;
  /**
   * The clause appended to citations after the display cite. Default: the
   * effective-date clause when the section has one ("effective 10/30/2016"),
   * silence when it does not. MCA overrides with its edition note.
   */
  citationNote?: (section: StateSection) => string | undefined;
}

export interface StateIdentityConfig {
  sourceId: string;
  sourceName: string;
  sourceShortName: string;
  sourceUrl: string;
  description: string;
  itemNoun: string;
  itemNounPlural: string;
  codes: readonly CodeConfig[];
}

export type CitationQuery =
  | { kind: 'section'; code: string; cite: string }
  | { kind: 'chapter'; code: string; chapter: string }
  | null;

export interface StateIdentity {
  readonly config: StateIdentityConfig;
  id(code: string, cite: string): string;
  parseId(id: string): { code: string; cite: string } | null;
  displayCite(section: Pick<StateSection, 'code' | 'cite'>): string;
  resolveCitationQuery(query: string): CitationQuery;
  formatCitation(section: StateSection): Citation;
}

const DEFAULT_GROUP_SHAPE = /^\d+[A-Z]?$/;

/** `YYYY-MM-DD` → UTC-locked `M/D/YYYY`, or undefined when the date is absent. */
function isoDateToDisplay(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

function isoDateToDate(iso: string | undefined): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return new Date(`${iso}T00:00:00.000Z`);
}

function defaultCitationNote(section: StateSection): string | undefined {
  const effective = isoDateToDisplay(section.effectiveDate);
  return effective ? `effective ${effective}` : undefined;
}

export function makeStateIdentity(config: StateIdentityConfig): StateIdentity {
  const byCode = new Map(config.codes.map((c) => [c.code, c]));
  const codeAlternation = config.codes.map((c) => c.code.toLowerCase()).join('|');
  const idPattern = new RegExp(`^(${codeAlternation}):(.+)$`);
  const codeWordPattern = new RegExp(`^(${codeAlternation})[\\s:.-]+(.+)$`, 'i');

  function resolveCitationQuery(query: string): CitationQuery {
    const trimmed = query.trim();
    if (!trimmed) return null;

    let code: string | undefined;
    let body = trimmed;
    const codeMatch = codeWordPattern.exec(trimmed);
    if (codeMatch) {
      code = codeMatch[1]!.toUpperCase();
      body = (codeMatch[2] ?? '').trim();
    }

    body = body.toUpperCase();
    if (!/^[0-9A-Z.-]+$/.test(body)) return null;

    const groups = body.split(/[.-]/).filter((g) => g.length > 0);
    if (groups.length !== 2 && groups.length !== 3) return null;

    if (!code) {
      // Config order decides ties, exactly like the WA original's '-' then
      // '.' checks: the first code claiming a separator present in the body
      // wins.
      for (const candidate of config.codes) {
        if (candidate.claimsBareSeparators?.some((sep) => body.includes(sep))) {
          code = candidate.code;
          break;
        }
      }
      if (!code) return null;
    }

    const codeConfig = byCode.get(code);
    if (!codeConfig) return null;
    const groupShape = codeConfig.groupShape ?? DEFAULT_GROUP_SHAPE;
    if (!groups.every((g) => groupShape.test(g))) return null;

    const joined = groups.join(codeConfig.separator);
    return groups.length === 3
      ? { kind: 'section', code, cite: joined }
      : { kind: 'chapter', code, chapter: joined };
  }

  function formatCitation(section: StateSection): Citation {
    const codeConfig = byCode.get(section.code);
    const display = `${section.code} ${section.cite}`;
    const note = codeConfig?.citationNote
      ? codeConfig.citationNote(section)
      : defaultCitationNote(section);
    const longName = codeConfig?.longName ?? section.code;
    const chapterPart = `chapter ${section.chapter} ${section.code} (${section.chapterTitle})`;
    return {
      shortForm: note ? `${display}, ${note}` : display,
      longForm: note
        ? `${longName} ${section.cite} (${section.heading}), ${chapterPart}, ${note}, ${section.sourceUrl}`
        : `${longName} ${section.cite} (${section.heading}), ${chapterPart}, ${section.sourceUrl}`,
      sourceId: config.sourceId,
      sourceName: config.sourceName,
      itemId: `${section.code.toLowerCase()}:${section.cite}`,
      url: section.sourceUrl,
      retrievedAt: new Date(),
      publishedAt: isoDateToDate(section.effectiveDate),
    };
  }

  return {
    config,
    id: (code, cite) => `${code.toLowerCase()}:${cite}`,
    parseId: (id) => {
      const match = idPattern.exec(id.trim());
      if (!match) return null;
      return { code: match[1]!.toUpperCase(), cite: (match[2] ?? '').trim() };
    },
    displayCite: (section) => `${section.code} ${section.cite}`,
    resolveCitationQuery,
    formatCitation,
  };
}
