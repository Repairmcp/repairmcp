/**
 * Base search over the ~645-section law corpus. Ported from
 * packages/nhtsa/src/laws/search.ts (the copy-once-more decision — extract at
 * state #2): term coverage, a heading boost, bounded density, deterministic
 * ties. The one extension is that hits carry their score components, so the
 * find-supporting composition can report an honest breakdown — the May branch
 * shipped a breakdown with a permanently-dead component and no test noticed.
 *
 * Scoring: 0–1.
 *   0.6 × text coverage    (fraction of query terms present in the section text)
 * + 0.3 × heading coverage (fraction present in the heading)
 * + 0.1 × density          (how often terms recur, capped)
 * Ties break to the lower cite, so results are deterministic.
 */

import type { WaSection } from './schema.js';

export interface WaBaseComponents {
  text: number;
  heading: number;
  density: number;
}

export interface WaBaseHit {
  section: WaSection;
  score: number;
  snippet: string;
  components: WaBaseComponents;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(normalizeToken);
}

/**
 * Light plural folding so "remedies" matches "remedy" and "estimates" matches
 * "estimate". Not a stemmer — statutes are consistent enough that these two
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

/**
 * Words that carry no retrieval signal against statute text. The base list is
 * the May branch's; the question/auxiliary words are what shop-floor questions
 * are made of ("can the insurer…", "do I have to…"), and "washington" is
 * stopped because in an all-Washington corpus it matches everything and means
 * nothing. Applied to QUERY tokens only — section text is never filtered.
 */
const QUERY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with',
  'what', 'when', 'where', 'which', 'who', 'whom', 'why', 'how',
  'can', 'could', 'should', 'would', 'shall', 'will', 'may', 'might', 'must',
  'do', 'does', 'did', 'done', 'have', 'has', 'had', 'having',
  'am', 'was', 'were', 'be', 'been', 'being',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'this', 'that', 'these', 'those', 'there', 'here',
  'washington',
]);

/** Query tokens that actually discriminate: tokenized, deduplicated, stopwords out. */
export function contentTokens(query: string): string[] {
  return [...new Set(tokenize(query))].filter((token) => !QUERY_STOPWORDS.has(token));
}

function coverage(queryTokens: string[], targetTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) matched += 1;
  }
  return matched / queryTokens.length;
}

export function buildSnippet(text: string, queryTokens: string[]): string {
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

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function searchWaSections(
  sections: readonly WaSection[],
  query: string,
  limit = 10,
): WaBaseHit[] {
  const queryTokens = contentTokens(query);
  if (queryTokens.length === 0) return [];

  const hits: WaBaseHit[] = [];
  for (const section of sections) {
    const textTokens = tokenize(section.text);
    const textSet = new Set(textTokens);
    const headingSet = new Set(tokenize(section.heading));

    const textCoverage = coverage(queryTokens, textSet);
    const headingCoverage = coverage(queryTokens, headingSet);
    if (textCoverage === 0 && headingCoverage === 0) continue;

    let occurrences = 0;
    for (const token of textTokens) {
      if (queryTokens.includes(token)) occurrences += 1;
    }

    const components: WaBaseComponents = {
      text: round3(0.6 * textCoverage),
      heading: round3(0.3 * headingCoverage),
      density: round3(0.1 * Math.min(1, occurrences / 20)),
    };

    hits.push({
      section,
      score: round3(components.text + components.heading + components.density),
      snippet: buildSnippet(section.text, queryTokens),
      components,
    });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.section.cite.localeCompare(b.section.cite, 'en', { numeric: true }),
  );
  return hits.slice(0, limit);
}
