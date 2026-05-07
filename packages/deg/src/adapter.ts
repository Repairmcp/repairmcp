import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  buildCitation,
  type Citation,
  type ListRecentOpts,
  type RefreshResult,
  type SearchQuery,
  type SearchResult,
  type SourceAdapter,
} from '@repairmcp/core';
import { DEGInquirySchema, type DEGInquiry, type InformationProvider } from './schema.js';

const DEGInquiryArraySchema = z.array(DEGInquirySchema);

const SEARCHABLE_FIELDS: Array<keyof DEGInquiry> = [
  'title',
  'issueSummary',
  'suggestedAction',
  'resolution',
  'inquiryType',
  'areaOfVehicle',
  'vehicleMake',
  'vehicleModel',
  'body',
];

interface DEGFilters {
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  ip?: InformationProvider | 'unknown';
  status?: DEGInquiry['status'];
  inquiryType?: string;
}

function parseFilters(raw: Record<string, unknown> | undefined): DEGFilters {
  if (!raw) return {};
  const out: DEGFilters = {};
  if (typeof raw['vehicleYear'] === 'number') out.vehicleYear = raw['vehicleYear'];
  if (typeof raw['vehicleMake'] === 'string') out.vehicleMake = raw['vehicleMake'];
  if (typeof raw['vehicleModel'] === 'string') out.vehicleModel = raw['vehicleModel'];
  if (typeof raw['ip'] === 'string') {
    const ip = raw['ip'];
    if (ip === 'CCC' || ip === 'Mitchell' || ip === 'Audatex' || ip === 'unknown') {
      out.ip = ip;
    }
  }
  if (typeof raw['status'] === 'string') {
    const s = raw['status'];
    if (s === 'pending' || s === 'resolved' || s === 'closed') out.status = s;
  }
  if (typeof raw['inquiryType'] === 'string') out.inquiryType = raw['inquiryType'];
  return out;
}

function inquiryMatchesFilters(inq: DEGInquiry, filters: DEGFilters): boolean {
  if (filters.vehicleYear !== undefined && inq.vehicleYear !== filters.vehicleYear) return false;
  if (filters.vehicleMake) {
    const want = filters.vehicleMake.toLowerCase();
    const got = (inq.vehicleMake ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  if (filters.vehicleModel) {
    const want = filters.vehicleModel.toLowerCase();
    const got = (inq.vehicleModel ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  if (filters.ip !== undefined) {
    if (filters.ip === 'unknown') {
      if (inq.ip !== null) return false;
    } else if (inq.ip !== filters.ip) return false;
  }
  if (filters.status && inq.status !== filters.status) return false;
  if (filters.inquiryType) {
    const want = filters.inquiryType.toLowerCase();
    const got = (inq.inquiryType ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  return true;
}

function buildHaystack(inq: DEGInquiry): string {
  const parts: string[] = [];
  for (const f of SEARCHABLE_FIELDS) {
    const v = inq[f];
    if (typeof v === 'string') parts.push(v);
  }
  return parts.join(' \n ').toLowerCase();
}

/** Score how well a haystack matches a free-text query. */
function scoreText(haystack: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return 0;
  let hits = 0;
  for (const w of words) if (haystack.includes(w)) hits++;
  return hits / words.length;
}

function extractSnippet(inq: DEGInquiry, query: string): string | undefined {
  const queryLc = query.toLowerCase();
  const candidates: string[] = [];
  if (inq.issueSummary) candidates.push(inq.issueSummary);
  if (inq.resolution) candidates.push(inq.resolution);
  if (inq.suggestedAction) candidates.push(inq.suggestedAction);
  for (const text of candidates) {
    const idx = text.toLowerCase().indexOf(queryLc);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + queryLc.length + 120);
      const slice = text.slice(start, end);
      return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
    }
  }
  // No exact match — fall back to first 200 chars of issueSummary.
  if (inq.issueSummary) {
    const head = inq.issueSummary.slice(0, 200);
    return head + (inq.issueSummary.length > 200 ? '…' : '');
  }
  return undefined;
}

export class DEGAdapter implements SourceAdapter<DEGInquiry> {
  readonly sourceId = 'deg';
  readonly sourceName = 'Database Enhancement Gateway';
  readonly sourceShortName = 'DEG';
  readonly sourceUrl = 'https://degweb.org';
  readonly description =
    'Industry-funded inquiry resolution system for collision estimating database accuracy.';
  readonly itemNoun = 'inquiry';
  readonly itemNounPlural = 'inquiries';

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
    return buildCitation({
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceShortName: this.sourceShortName,
      itemId: item.inquiryNumber,
      url: item.url,
      itemNoun: this.itemNoun,
      publishedAt: item.submittedAt,
      resolvedAt: item.resolvedAt,
    });
  }

  /** In-memory adapter does not refresh from a live source. Returns zero counts. */
  async refresh(_opts?: { since?: Date }): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }
}
