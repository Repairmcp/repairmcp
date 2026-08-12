/**
 * Corpus freshness — how a source says what it does *not* know yet.
 *
 * A model asked "what has DEG resolved lately?" will answer from whatever it
 * has. If the server never states its cutoff, the model supplies one, and the
 * one it supplies is today's date. That is not a hypothetical: a ChatGPT session
 * described this corpus as running "through August 12" when the newest record in
 * it was dated July 31 and the last crawl ran August 2. For a tool whose whole
 * value is that a shop can quote it to an insurer's auditor, a confidently wrong
 * currency claim is the worst failure mode available.
 *
 * So freshness is stated three times, because a model can miss any one of them:
 *
 *   1. in every tool description  — before it ever decides to call anything
 *   2. in every tool result       — at the moment it composes an answer
 *   3. as an explicit note        — when the question was itself about recency
 *
 * Nothing here is vertical-specific. "A corpus has a cutoff and should say so"
 * is as true for I-CAR or NHTSA as it is for DEG, so the type, the wording and
 * the heuristic live in core; only the values come from the vertical.
 *
 * Dates are plain `YYYY-MM-DD` strings and never `Date` objects. They are
 * therefore not subject to the timezone divergence `buildCitation` has to defend
 * against — there is no rendering step in which a cutoff could shift a day.
 */

/** What a source knows about its own currency. */
export interface CorpusFreshness {
  /** Date of the newest item in the corpus, `YYYY-MM-DD`. */
  currentThrough: string;
  /** Date the corpus was last synced from its upstream source, `YYYY-MM-DD`. */
  syncedAt: string;
  /** Items held. Stated so "current through" cannot be read as "complete through". */
  recordCount: number;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * The sentence appended to every tool description.
 *
 * Written as an instruction, not a fact, because a fact competes with the
 * model's prior about what today is and an instruction does not. "Do not state
 * or imply coverage past that date" is the part that actually changes behaviour.
 */
export function freshnessSentence(f: CorpusFreshness, itemNounPlural: string): string {
  return (
    `CORPUS FRESHNESS: this corpus is current through ${f.currentThrough} and was ` +
    `last synced ${f.syncedAt}; it holds ${f.recordCount.toLocaleString('en-US')} ` +
    `${itemNounPlural}. Nothing dated after ${f.currentThrough} is in it. Do not state ` +
    `or imply coverage past that date — if the user asks about newer activity, say ` +
    `plainly that the corpus ends there.`
  );
}

/**
 * The explicit warning carried in results when the question implied recency.
 *
 * Separate from the description sentence on purpose: this one arrives *with the
 * data*, at the point where the model is deciding how to characterize it.
 */
export function recencyNote(f: CorpusFreshness, itemNounPlural: string): string {
  return (
    `${capitalize(itemNounPlural)} dated after ${f.currentThrough} are not yet in ` +
    `this corpus — it was last synced ${f.syncedAt}. Do not describe these results ` +
    `as current beyond ${f.currentThrough}.`
  );
}

/**
 * Phrases that mean the user is asking about recency.
 *
 * Deliberately narrow. A note attached to every call is a note the model stops
 * reading, so the goal is to fire on questions whose *answer* would be wrong
 * without it and stay silent otherwise. "blend two-tone refinish" gets no note;
 * "any recent rulings on blend time" does.
 *
 * `new` is matched only in the phrasings that mean recency ("what's new",
 * "anything new", "newer", "newest"). A bare `\bnew\b` would fire on "new
 * quarter panel", which is a part, not a date.
 */
const RECENCY_PATTERNS: RegExp[] = [
  /\brecent(ly)?\b/,
  /\blatest\b/,
  /\bnew(er|est)\b/,
  /\b(what'?s|whats|anything|something)\s+new\b/,
  /\bcurrent(ly)?\b/,
  /\bup[-\s]to[-\s]date\b/,
  /\blately\b/,
  /\bso far\b/,
  /\bto date\b/,
  /\bthis (year|month|week|quarter)\b/,
  /\b(last|past) (year|month|week|quarter)\b/,
  /\b(last|past) \d+ (days?|weeks?|months?|years?)\b/,
  /\btoday\b/,
  /\bright now\b/,
];

/**
 * Does this query text imply the user wants current information?
 *
 * Pure and side-effect free so the truth table can be tested directly — the list
 * above is the kind of thing that rots silently, and a test is the only thing
 * that notices.
 *
 * The year rule is the one judgement call: a 4-digit year at or past the cutoff
 * year counts as a recency signal. In this domain that will occasionally fire on
 * a vehicle year ("2026 Silverado") rather than a date reference. That is an
 * acceptable trade — the note it produces is true either way, and a model
 * reasoning about a current-model-year vehicle benefits from knowing where the
 * corpus stops.
 */
export function impliesRecency(text: string | undefined, f?: CorpusFreshness): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (RECENCY_PATTERNS.some((re) => re.test(lower))) return true;

  if (f) {
    const cutoffYear = Number(f.currentThrough.slice(0, 4));
    if (Number.isFinite(cutoffYear)) {
      for (const m of lower.matchAll(/\b(\d{4})\b/g)) {
        if (Number(m[1]) >= cutoffYear) return true;
      }
    }
  }

  return false;
}

/**
 * Is `since` past the point the corpus can answer for?
 *
 * Plain string comparison: both sides are `YYYY-MM-DD`, which sorts
 * lexicographically in date order — the same property the D1 schema relies on
 * for `submitted_at`.
 */
export function sinceIsBeyondCorpus(since: Date | undefined, f: CorpusFreshness): boolean {
  if (!since) return false;
  return since.toISOString().slice(0, 10) > f.currentThrough;
}

/**
 * The note for a request whose window starts after the corpus ends.
 *
 * This case earns stronger wording than `recencyNote` because the result is
 * guaranteed empty, and an empty result reads as an answer. "No inquiries since
 * August 10" is a factual claim about the world; what actually happened is that
 * the question fell entirely outside what we hold. The two are opposite in
 * meaning and identical in appearance, which is precisely the confusion this
 * whole module exists to prevent.
 */
export function beyondCutoffNote(f: CorpusFreshness, itemNounPlural: string): string {
  return (
    `This request covers a period starting after ${f.currentThrough}, which is past ` +
    `the end of this corpus (last synced ${f.syncedAt}). An empty result here means ` +
    `the corpus cannot answer for that period — it does not mean no ${itemNounPlural} ` +
    `exist. Say that plainly instead of reporting no activity.`
  );
}

/**
 * The freshness fields every tool payload carries.
 *
 * One producer, so `deg_search_inquiries` and the ChatGPT `search` tool cannot
 * report the cutoff differently. `corpusNote` is present only when earned.
 */
export interface FreshnessPayload {
  corpusCurrentThrough?: string;
  corpusSyncedAt?: string;
  corpusNote?: string;
}

export function freshnessFields(
  f: CorpusFreshness | undefined,
  opts: { note?: boolean | string; itemNounPlural?: string } = {},
): FreshnessPayload {
  if (!f) return {};
  const fields: FreshnessPayload = {
    corpusCurrentThrough: f.currentThrough,
    corpusSyncedAt: f.syncedAt,
  };
  // A string is an explicit note (e.g. `beyondCutoffNote`); `true` asks for the
  // standard recency wording.
  if (typeof opts.note === 'string') fields.corpusNote = opts.note;
  else if (opts.note) fields.corpusNote = recencyNote(f, opts.itemNounPlural ?? 'records');
  return fields;
}

/** Append the freshness sentence to a tool description, when one is known. */
export function withFreshness(
  description: string,
  f: CorpusFreshness | undefined,
  itemNounPlural: string,
): string {
  return f ? `${description}\n\n${freshnessSentence(f, itemNounPlural)}` : description;
}
