import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type {
  Citation,
  ListRecentOpts,
  RefreshResult,
  SearchQuery,
  SearchResult,
} from '@repairmcp/core';
import { DEG_IDENTITY, formatDegCitation } from './identity.js';
import { DEGInquirySchema, type DEGInquiry } from './schema.js';
import { inquiryMatchesFilters, parseFilters } from './filters.js';
import type { DegSource, FindSupportingHit, FindSupportingOpts } from './ports.js';
import {
  compareSupportingHits,
  scoreInquiry,
  snippetForQuery,
  type ScoreInquiryOpts,
} from './scoring.js';
import { buildHaystack, extractSnippet, scoreText } from './text-match.js';

const DEGInquiryArraySchema = z.array(DEGInquirySchema);

export class DEGAdapter implements DegSource {
  readonly sourceId = DEG_IDENTITY.sourceId;
  readonly sourceName = DEG_IDENTITY.sourceName;
  readonly sourceShortName = DEG_IDENTITY.sourceShortName;
  readonly sourceUrl = DEG_IDENTITY.sourceUrl;
  readonly description = DEG_IDENTITY.description;
  readonly itemNoun = DEG_IDENTITY.itemNoun;
  readonly itemNounPlural = DEG_IDENTITY.itemNounPlural;

  constructor(private readonly inquiries: DEGInquiry[]) {}

  /** Load + validate inquiries from a JSON file on disk (Node-only). */
  static fromJsonFile(filePath: string): DEGAdapter {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const inquiries = DEGInquiryArraySchema.parse(raw);
    return new DEGAdapter(inquiries);
  }

  /** Number of inquiries currently held in memory. */
  size(): number {
    return this.inquiries.length;
  }

  async search(query: SearchQuery): Promise<SearchResult<DEGInquiry>[]> {
    const filters = parseFilters(query.filters);
    const text = query.text?.trim() ?? '';
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 10;

    const filtered = this.inquiries.filter((inq) => inquiryMatchesFilters(inq, filters));

    let scored = filtered.map((inq) => {
      const haystack = buildHaystack(inq);
      const score = text ? scoreText(haystack, text) : 1;
      const snippet = text ? extractSnippet(inq, text) : extractSnippet(inq, '');
      return { item: inq, score, snippet };
    });

    if (text) scored = scored.filter((r) => r.score > 0);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.item.submittedAt.getTime() - a.item.submittedAt.getTime();
    });

    return scored.slice(offset, offset + limit).map((r) => {
      const result: SearchResult<DEGInquiry> = {
        item: r.item,
        score: r.score,
        citation: this.formatCitation(r.item),
      };
      if (r.snippet) result.snippet = r.snippet;
      return result;
    });
  }

  async getById(id: string): Promise<DEGInquiry | null> {
    return this.inquiries.find((inq) => inq.id === id) ?? null;
  }

  async listRecent(opts: ListRecentOpts): Promise<DEGInquiry[]> {
    const limit = opts.limit ?? 10;
    const filters = parseFilters(opts.filters);
    let items = this.inquiries.filter((inq) => inquiryMatchesFilters(inq, filters));
    if (opts.since) {
      const sinceTime = opts.since.getTime();
      items = items.filter((inq) => inq.submittedAt.getTime() >= sinceTime);
    }
    items = items.slice().sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
    return items.slice(0, limit);
  }

  formatCitation(item: DEGInquiry): Citation {
    return formatDegCitation(item);
  }

  /** In-memory adapter does not refresh from a live source. Returns zero counts. */
  async refresh(_opts?: { since?: Date }): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }

  /**
   * DEG-specific killer scoring for `deg_find_supporting`. Iterates the corpus,
   * scores each inquiry against the natural-language line item description,
   * and returns the top-`limit` results ranked by score descending.
   *
   * Scoring the whole corpus is only affordable because it is already resident
   * in memory. `D1DEGAdapter` reaches the same ranking by retrieving a bounded
   * candidate pool with FTS5 first and running this same `scoreInquiry` over it.
   */
  async findSupporting(opts: FindSupportingOpts): Promise<FindSupportingHit[]> {
    const limit = opts.limit ?? 5;
    const scoreOpts: ScoreInquiryOpts = {};
    if (opts.vehicleYear !== undefined) scoreOpts.vehicleYear = opts.vehicleYear;
    if (opts.vehicleMake) scoreOpts.vehicleMake = opts.vehicleMake;
    if (opts.vehicleModel) scoreOpts.vehicleModel = opts.vehicleModel;
    if (opts.now) scoreOpts.now = opts.now;

    const scored = this.inquiries.map((inq) => {
      const { score, breakdown } = scoreInquiry(opts.lineItemText, inq, scoreOpts);
      return {
        inquiry: inq,
        score,
        breakdown,
        snippet: snippetForQuery(opts.lineItemText, inq),
      };
    });

    scored.sort(compareSupportingHits);

    return scored.slice(0, limit);
  }
}
