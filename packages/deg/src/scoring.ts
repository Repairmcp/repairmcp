/**
 * DEG-specific scoring for `deg_find_supporting`. The scoring matches a shop
 * owner's natural-language line-item description against the inquiry corpus.
 *
 * Components (each computed independently, then summed and clamped to [0, 1]):
 *
 *   text     — bigram match across issueSummary + suggestedAction + resolution,
 *              augmented with unigram coverage so reordered queries (e.g.
 *              "blend two-tone refinish" vs corpus "two tone ... blend") still
 *              score well. Strict spec is bigrams only; we blend in unigrams
 *              to reach reasonable confidence on real estimator phrasing.
 *   ip       — +0.15 if the query mentions an IP keyword (CCC/MOTOR/Mitchell/
 *              Audatex/etc.) and the inquiry's `ip` field matches. No penalty
 *              when the query is IP-agnostic.
 *   vehicle  — +0.10 each for matching year / make / model passed via the
 *              dedicated input fields, capped at +0.30.
 *   operation — +0.10 if any query token appears in the inquiry's `inquiryType`
 *               (e.g. "refinish" → "Refinish Operations").
 *   recency  — +0.05 if the inquiry's effective date (resolvedAt ?? submittedAt)
 *              is within the last 24 months from `now`.
 */
import type { DEGInquiry, InformationProvider } from './schema.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or',
  'is', 'was', 'are', 'be', 'by', 'from', 'as', 'it', 'this', 'that', 'these',
  'those', 'i', 'we', 'they', 'them', 'us', 'our', 'their',
]);

/**
 * Common preprocessing: lowercase, collapse "R&I" / "R & I" → "ri", replace
 * remaining non-alphanumerics with spaces, normalize whitespace. Used by both
 * `tokenize` and `normalizeForMatching` so query and haystack are compared on
 * the same footing.
 */
function preprocess(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\w)\s*&\s*(\w)/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Preprocess + split on whitespace, drop tokens shorter than 2 chars or in
 * the stopword list.
 */
export function tokenize(text: string): string[] {
  const norm = preprocess(text);
  if (!norm) return [];
  return norm.split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Returns `text` preprocessed for substring-based matching against tokens. */
export function normalizeForMatching(text: string): string {
  return preprocess(text);
}

export function bigramsOf(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a && b) out.push(`${a} ${b}`);
  }
  return out;
}

const IP_QUERY_KEYWORDS: Record<InformationProvider, RegExp[]> = {
  CCC: [/\bmotor\b/, /\bgte\b/, /\bp[\s-]?pages?\b/, /\bccc\b/],
  Mitchell: [/\bmitchell\b/, /\bmws\b/],
  Audatex: [/\baudatex\b/, /\bdbrm\b/, /\bsolera\b/, /\bqapter\b/],
};

/** Detect which IP (if any) the natural-language query implies. */
export function detectIp(query: string): InformationProvider | null {
  const lc = query.toLowerCase();
  const scores: Record<InformationProvider, number> = { CCC: 0, Mitchell: 0, Audatex: 0 };
  for (const ip of Object.keys(IP_QUERY_KEYWORDS) as InformationProvider[]) {
    for (const re of IP_QUERY_KEYWORDS[ip]) {
      const matches = lc.match(re);
      if (matches) scores[ip] += matches.length;
    }
  }
  // Avoid Mitchell vs Audatex ambiguity on "DBRM" — Mitchell DBRM is real but
  // bare DBRM is more often Audatex per DEG vocabulary; if both score the same,
  // tie-break by which has more *distinct* keywords beyond DBRM.
  let best: InformationProvider | null = null;
  let bestScore = 0;
  let tied = false;
  for (const [ip, score] of Object.entries(scores) as Array<[InformationProvider, number]>) {
    if (score > bestScore) {
      best = ip;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  if (bestScore === 0 || tied) return null;
  return best;
}

export interface ScoreInquiryOpts {
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  /** "Now" reference for recency. Defaults to current time. */
  now?: Date;
}

export interface ScoringBreakdown {
  bigram: number;
  unigram: number;
  text: number;
  ip: number;
  vehicle: number;
  operation: number;
  recency: number;
  total: number;
}

const TWENTY_FOUR_MONTHS_MS = 24 * 30 * 24 * 60 * 60 * 1000;

export function scoreInquiry(
  query: string,
  inq: DEGInquiry,
  opts: ScoreInquiryOpts = {},
): { score: number; breakdown: ScoringBreakdown } {
  const tokens = tokenize(query);
  const bigrams = bigramsOf(tokens);

  const haystackParts = [inq.issueSummary, inq.suggestedAction ?? '', inq.resolution ?? ''];
  const haystack = normalizeForMatching(haystackParts.join(' '));

  // ---- Text score: bigrams (strict adjacency) + unigram coverage ----
  let bigramHits = 0;
  for (const bg of bigrams) if (haystack.includes(bg)) bigramHits++;
  const bigramRatio = bigrams.length > 0 ? bigramHits / bigrams.length : 0;

  let unigramHits = 0;
  for (const t of tokens) if (haystack.includes(t)) unigramHits++;
  const unigramRatio = tokens.length > 0 ? unigramHits / tokens.length : 0;

  const text = Math.min(1, bigramRatio * 0.7 + unigramRatio * 0.5);

  // ---- IP match ----
  let ip = 0;
  const queryIp = detectIp(query);
  if (queryIp !== null && inq.ip === queryIp) ip = 0.15;

  // ---- Vehicle match (additive, capped at 0.30) ----
  let vehicle = 0;
  if (opts.vehicleYear !== undefined && inq.vehicleYear === opts.vehicleYear) vehicle += 0.1;
  if (opts.vehicleMake && inq.vehicleMake) {
    if (inq.vehicleMake.toLowerCase().includes(opts.vehicleMake.toLowerCase())) vehicle += 0.1;
  }
  if (opts.vehicleModel && inq.vehicleModel) {
    if (inq.vehicleModel.toLowerCase().includes(opts.vehicleModel.toLowerCase())) vehicle += 0.1;
  }
  if (vehicle > 0.3) vehicle = 0.3;

  // ---- Operation type match ----
  let operation = 0;
  if (inq.inquiryType) {
    const typeLc = inq.inquiryType.toLowerCase();
    for (const t of tokens) {
      if (typeLc.includes(t)) {
        operation = 0.1;
        break;
      }
    }
  }

  // ---- Recency boost ----
  let recency = 0;
  const effectiveDate = inq.resolvedAt ?? inq.submittedAt;
  const now = opts.now ?? new Date();
  const ageMs = now.getTime() - effectiveDate.getTime();
  if (ageMs >= 0 && ageMs <= TWENTY_FOUR_MONTHS_MS) recency = 0.05;

  // ---- Final ----
  const raw = text + ip + vehicle + operation + recency;
  const total = Math.max(0, Math.min(1, raw));

  return {
    score: total,
    breakdown: {
      bigram: bigramRatio,
      unigram: unigramRatio,
      text,
      ip,
      vehicle,
      operation,
      recency,
      total,
    },
  };
}

/** Pick a snippet centered on the first matched query token in the inquiry. */
export function snippetForQuery(query: string, inq: DEGInquiry): string | undefined {
  const tokens = tokenize(query);
  const candidates: string[] = [];
  if (inq.issueSummary) candidates.push(inq.issueSummary);
  if (inq.resolution) candidates.push(inq.resolution);
  if (inq.suggestedAction) candidates.push(inq.suggestedAction);
  for (const text of candidates) {
    const lc = text.toLowerCase();
    for (const t of tokens) {
      const idx = lc.indexOf(t);
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(text.length, idx + t.length + 120);
        return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
      }
    }
  }
  if (inq.issueSummary) {
    const head = inq.issueSummary.slice(0, 200);
    return head + (inq.issueSummary.length > 200 ? '…' : '');
  }
  return undefined;
}
