import type { CorpusFreshness } from '@repairmcp/core';
import { displayCite, resolveCitationQuery } from './identity.js';
import {
  WaAnnotationsFileSchema,
  WaCorpusFileSchema,
  type WaAnnotation,
  type WaAnnotationsFile,
  type WaCorpusFile,
  type WaCorpusMeta,
  type WaDomain,
  type WaSection,
} from './schema.js';
import { buildSnippet, contentTokens, searchWaSections, tokenize, type WaBaseHit } from './search.js';
import { WA_DOMAINS } from './schema.js';
import { WA_TOPICS, baselineTopics, type WaTopic } from './taxonomy.js';

export interface WaScoreBreakdown {
  citation: number;
  text: number;
  heading: number;
  density: number;
  useCase: number;
  phrase: number;
}

export interface WaHit {
  section: WaSection;
  score: number;
  snippet: string;
  breakdown: WaScoreBreakdown;
  topics: WaTopic[];
  annotation?: WaAnnotation;
}

export interface WaQueryResult {
  hits: WaHit[];
  /** Display cite of a section-shaped query that matched nothing; fuzzy hits follow. */
  citationMiss?: string;
  /** True when the query was a bare chapter cite and hits are that chapter in order. */
  chapterListing?: boolean;
}

export interface WaQueryOpts {
  domain?: WaDomain;
  topics?: WaTopic[];
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/** A chapter listing answers "what is in WAC 284-30" — relevant, but not a term match. */
const CHAPTER_LISTING_SCORE = 0.5;
/**
 * One ranking for search and find-supporting, ceiling exactly 1.0:
 *   0.65 × base (term coverage + heading + density, from search.ts)
 * + 0.25 × use-case coverage (fraction of the query's content tokens present
 *          in the annotation's claimUseCases — the vocabulary bridge: the
 *          statute says "rest period", the painter asks about "breaks")
 * + 0.10 × phrase (the whole normalized query appears verbatim in the heading,
 *          text, or a quote-safe excerpt)
 * Only an exact citation reaches 1.0, via its own short-circuit.
 */
const BASE_WEIGHT = 0.65;
const USE_CASE_WEIGHT = 0.25;
const PHRASE_BOOST = 0.1;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function zeroBreakdown(): WaScoreBreakdown {
  return { citation: 0, text: 0, heading: 0, density: 0, useCase: 0, phrase: 0 };
}

/**
 * In-memory corpus over the captured leg.wa.gov JSON plus the hand-maintained
 * annotation layer. Both validate at construction — a malformed corpus, an
 * annotation key that no longer matches a section (renumbering), an excerpt
 * that is not a literal substring of the captured text (paraphrase), or a
 * topic outside the taxonomy all fail at deploy time, not at query time.
 */
export class WaCorpus {
  private readonly file: WaCorpusFile;
  private readonly annotations: WaAnnotationsFile;
  private readonly byKey: Map<string, WaSection>;

  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    this.file = WaCorpusFileSchema.parse(corpusData);
    this.annotations = WaAnnotationsFileSchema.parse(annotationsData);
    this.byKey = new Map(this.file.sections.map((s) => [displayCite(s), s]));

    const knownTopics = new Set<string>(WA_TOPICS);
    for (const [key, annotation] of Object.entries(this.annotations)) {
      const section = this.byKey.get(key);
      if (!section) {
        throw new Error(
          `Annotation key ${key} matches no captured section — renumbered or removed upstream.`,
        );
      }
      for (const excerpt of annotation.quoteSafeExcerpts ?? []) {
        if (!section.text.includes(excerpt)) {
          throw new Error(
            `Annotation ${key}: quoteSafeExcerpt is not a literal substring of the captured text — ` +
              `paraphrase is exactly what this corpus exists to prevent.`,
          );
        }
      }
      for (const topic of annotation.topics) {
        if (!knownTopics.has(topic)) {
          throw new Error(`Annotation ${key}: unknown topic "${topic}".`);
        }
      }
    }
  }

  get meta(): WaCorpusMeta {
    return this.file.meta;
  }

  get sections(): readonly WaSection[] {
    return this.file.sections;
  }

  annotationFor(section: Pick<WaSection, 'code' | 'cite'>): WaAnnotation | undefined {
    return this.annotations[displayCite(section)];
  }

  /** Baseline (cite-prefix) topics unioned with the hand annotation's. */
  topicsFor(section: WaSection): WaTopic[] {
    const topics = new Set<WaTopic>(baselineTopics(section.cite));
    for (const topic of this.annotationFor(section)?.topics ?? []) {
      topics.add(topic as WaTopic);
    }
    return [...topics];
  }

  /** Accepts "WAC 284-30-330", "wac:284-30-330", "wac-284-30-330", "284-30-330", "46.71.025"… */
  getSection(input: string): WaSection | null {
    const resolved = resolveCitationQuery(input);
    if (resolved?.kind !== 'section') return null;
    return this.byKey.get(`${resolved.code} ${resolved.cite}`) ?? null;
  }

  freshness(): CorpusFreshness {
    return {
      currentThrough: this.file.meta.currentThrough,
      syncedAt: this.file.meta.capturedAt,
      recordCount: this.file.sections.length,
    };
  }

  domainBreakdown(): Record<WaDomain, number> {
    const counts = Object.fromEntries(WA_DOMAINS.map((d) => [d, 0])) as Record<WaDomain, number>;
    for (const section of this.file.sections) counts[section.domain] += 1;
    return counts;
  }

  /**
   * search and findSupporting share one ranking pipeline on purpose — the two
   * tools frame the input differently (a query vs dispute prose), but two
   * rankings would mean two answers for the same question, which is exactly
   * the divergence the DEG parity suite exists to prevent over there.
   */
  search(query: string, opts: WaQueryOpts = {}): WaQueryResult {
    return this.run(query, opts);
  }

  findSupporting(disputeText: string, opts: WaQueryOpts = {}): WaQueryResult {
    return this.run(disputeText, opts);
  }

  private candidates(opts: WaQueryOpts): WaSection[] {
    return this.file.sections.filter((section) => {
      if (opts.domain && section.domain !== opts.domain) return false;
      if (opts.topics && opts.topics.length > 0) {
        const topics = new Set(this.topicsFor(section));
        if (!opts.topics.some((topic) => topics.has(topic))) return false;
      }
      return true;
    });
  }

  private toHit(section: WaSection, score: number, snippet: string, breakdown: WaScoreBreakdown): WaHit {
    const annotation = this.annotationFor(section);
    return {
      section,
      score,
      snippet,
      breakdown,
      topics: this.topicsFor(section),
      ...(annotation ? { annotation } : {}),
    };
  }

  private run(query: string, opts: WaQueryOpts): WaQueryResult {
    const limit = normalizeLimit(opts.limit);
    const resolved = resolveCitationQuery(query);

    if (resolved?.kind === 'section') {
      const key = `${resolved.code} ${resolved.cite}`;
      const section = this.byKey.get(key);
      if (section) {
        // Asked for by name: the exact cite answers, filters do not veto it.
        return {
          hits: [
            this.toHit(section, 1, buildSnippet(section.text, []), {
              ...zeroBreakdown(),
              citation: 1,
            }),
          ],
        };
      }
      // A cite-shaped miss falls through to fuzzy scoring over the same text —
      // sections that reference the missing cite surface — with the miss named.
      return { ...this.fuzzy(query, opts, limit), citationMiss: key };
    }

    if (resolved?.kind === 'chapter') {
      const inChapter = this.candidates(opts)
        .filter((s) => s.code === resolved.code && s.chapter === resolved.chapter)
        .sort((a, b) => a.cite.localeCompare(b.cite, 'en', { numeric: true }))
        .slice(0, limit);
      return {
        chapterListing: true,
        hits: inChapter.map((section) =>
          this.toHit(section, CHAPTER_LISTING_SCORE, buildSnippet(section.text, []), {
            ...zeroBreakdown(),
            citation: CHAPTER_LISTING_SCORE,
          }),
        ),
      };
    }

    return this.fuzzy(query, opts, limit);
  }

  private fuzzy(query: string, opts: WaQueryOpts, limit: number): WaQueryResult {
    const candidates = this.candidates(opts);
    const queryTokens = contentTokens(query);
    if (queryTokens.length === 0) return { hits: [] };
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();

    // Base components for every candidate, not just coverage hits — a section
    // with zero term coverage can still surface on its use-case vocabulary.
    const baseByKey = new Map<string, WaBaseHit>();
    for (const hit of searchWaSections(candidates, query, candidates.length)) {
      baseByKey.set(displayCite(hit.section), hit);
    }

    const hits: WaHit[] = [];
    for (const section of candidates) {
      const base = baseByKey.get(displayCite(section));
      const annotation = this.annotationFor(section);

      let useCase = 0;
      if (annotation?.claimUseCases) {
        const useCaseTokens = new Set(tokenize(annotation.claimUseCases.join(' ')));
        const matched = queryTokens.filter((token) => useCaseTokens.has(token)).length;
        useCase = round3(USE_CASE_WEIGHT * (matched / queryTokens.length));
      }

      let phrase = 0;
      if (normalizedQuery.length > 0) {
        const haystacks = [
          section.heading,
          section.text,
          ...(annotation?.quoteSafeExcerpts ?? []),
        ];
        if (
          haystacks.some((h) => h.toLowerCase().replace(/\s+/g, ' ').includes(normalizedQuery))
        ) {
          phrase = PHRASE_BOOST;
        }
      }

      const breakdown: WaScoreBreakdown = {
        citation: 0,
        text: round3(BASE_WEIGHT * (base?.components.text ?? 0)),
        heading: round3(BASE_WEIGHT * (base?.components.heading ?? 0)),
        density: round3(BASE_WEIGHT * (base?.components.density ?? 0)),
        useCase,
        phrase,
      };
      const score = round3(
        breakdown.text + breakdown.heading + breakdown.density + useCase + phrase,
      );
      if (score === 0) continue;

      hits.push(
        this.toHit(
          section,
          score,
          base?.snippet ?? buildSnippet(section.text, queryTokens),
          breakdown,
        ),
      );
    }

    hits.sort(
      (a, b) =>
        b.score - a.score ||
        a.section.cite.localeCompare(b.section.cite, 'en', { numeric: true }),
    );
    return { hits: hits.slice(0, limit) };
  }
}
