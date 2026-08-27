/**
 * Search over the ~60-section law corpus. Deliberately small and local to
 * this vertical: DEG's scorer is calibrated for 22k shop inquiries with IP
 * and vehicle signals; a statute chapter needs term coverage, a heading
 * boost, and stable ordering, nothing more.
 *
 * Scoring: 0–1.
 *   0.6 × text coverage    (fraction of query terms present in the statute text)
 * + 0.3 × heading coverage (fraction present in the heading)
 * + 0.1 × density          (how often terms recur, capped)
 * Ties break to the lower section number, so results are deterministic.
 */

import type { NhtsaLawSection } from './schema.js';

export interface LawSearchHit {
  section: NhtsaLawSection;
  score: number;
  snippet: string;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(normalizeToken);
}

/**
 * Light plural folding so "remedies" matches "remedy" and "devices" matches
 * "device". Not a stemmer — statutes are consistent enough that these two
 * rules cover the real cases, and anything cleverer starts matching words
 * that are not the same word.
 */
export function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function coverage(queryTokens: string[], targetTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) matched += 1;
  }
  return matched / queryTokens.length;
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0 && (at < 0 || idx < at)) at = idx;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 60);
  const raw = text.slice(start, start + 240).trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = start + 240 < text.length ? '…' : '';
  return `${prefix}${raw}${suffix}`;
}

export function searchLawSections(
  sections: readonly NhtsaLawSection[],
  query: string,
  limit = 10,
): LawSearchHit[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const hits: LawSearchHit[] = [];
  for (const section of sections) {
    const textTokens = tokenize(section.text);
    const textSet = new Set(textTokens);
    const headingSet = new Set(tokenize(section.heading));

    const textCoverage = coverage(queryTokens, textSet);
    if (textCoverage === 0 && coverage(queryTokens, headingSet) === 0) continue;

    let occurrences = 0;
    for (const token of textTokens) {
      if (queryTokens.includes(token)) occurrences += 1;
    }

    const score =
      0.6 * textCoverage +
      0.3 * coverage(queryTokens, headingSet) +
      0.1 * Math.min(1, occurrences / 20);

    hits.push({
      section,
      score: Math.round(score * 1000) / 1000,
      snippet: buildSnippet(section.text, queryTokens),
    });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.section.section.localeCompare(b.section.section, 'en', { numeric: true }),
  );
  return hits.slice(0, limit);
}
