/**
 * The composite SourceAdapter over NHTSA: live recall/complaint lookups plus
 * the static 49 U.S.C. ch. 301 law corpus, one id namespace.
 *
 * This exists so core's OpenAI connector builders (`buildOpenAiSearchTool` /
 * `buildOpenAiFetchTool`) work unchanged — they need only `search`, `getById`,
 * and a `toDocument` mapper. The `nhtsa_*` tools do NOT go through this
 * adapter's free-text search; they take structured year/make/model and call
 * the client directly. `listRecent` and `refresh` satisfy the interface and
 * are never registered as tools: a live source has no meaningful "recent
 * across everything" and nothing to refresh.
 *
 * Search is three-armed:
 *   - law corpus, always, with the raw query — "can a shop disable a safety
 *     device" answers §30122 with no vehicle in sight
 *   - recalls + complaints, when the query parses to year/make/model, via
 *     Promise.allSettled so one arm down still returns the other
 * An unparseable vehicle with zero law hits returns [], which the connector
 * contract renders as an empty result set — honest, since there is nothing
 * to search without a vehicle.
 */
import type {
  Citation,
  ListRecentOpts,
  RefreshResult,
  SearchQuery,
  SearchResult,
  SourceAdapter,
} from '@repairmcp/core';
import type { BaseItem } from '@repairmcp/core';
import { NhtsaClient } from './client.js';
import type { LawCorpus } from './laws/adapter.js';
import type { NhtsaLawSection } from './laws/schema.js';
import type { NhtsaComplaint, NhtsaRecall } from './schema.js';
import { scoreComplaintRelevance } from './relevance.js';
import {
  NHTSA_IDENTITY,
  complaintId,
  formatComplaintCitation,
  formatLawCitation,
  formatRecallCitation,
  lawId,
  parseNhtsaId,
  recallId,
  type NhtsaItemKind,
} from './identity.js';
import { parseVehicleQuery } from './parse-query.js';

export interface NhtsaItem extends BaseItem {
  metadata: {
    kind: NhtsaItemKind;
    record: NhtsaRecall | NhtsaComplaint | NhtsaLawSection;
    [key: string]: unknown;
  };
}

function isoToDate(iso: string | undefined, fallback: Date): Date {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback;
  return new Date(`${iso}T00:00:00.000Z`);
}

const EPOCH = new Date(0);

function truncate(text: string | undefined, max = 200): string {
  const value = (text ?? '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

export class NhtsaLiveAdapter implements SourceAdapter<NhtsaItem> {
  readonly sourceId = NHTSA_IDENTITY.sourceId;
  readonly sourceName = NHTSA_IDENTITY.sourceName;
  readonly sourceShortName = NHTSA_IDENTITY.sourceShortName;
  readonly sourceUrl = NHTSA_IDENTITY.sourceUrl;
  readonly description = NHTSA_IDENTITY.description;
  readonly itemNoun = NHTSA_IDENTITY.itemNoun;
  readonly itemNounPlural = NHTSA_IDENTITY.itemNounPlural;

  constructor(
    private readonly client: NhtsaClient,
    private readonly laws: LawCorpus,
  ) {}

  recallToItem(recall: NhtsaRecall, vehicle?: string): NhtsaItem {
    const parts = [
      `Recall ${recall.campaignNumber}`,
      recall.component,
      vehicle,
    ].filter(Boolean);
    return {
      id: recallId(recall.campaignNumber),
      title: parts.join(' — '),
      url: formatRecallCitation(recall).url,
      lastUpdated: isoToDate(recall.reportReceivedDate, EPOCH),
      metadata: { kind: 'recall', record: recall },
    };
  }

  complaintToItem(complaint: NhtsaComplaint): NhtsaItem {
    const vehicle = [complaint.modelYear, complaint.make, complaint.model]
      .filter(Boolean)
      .join(' ');
    const parts = [
      `Complaint ODI ${complaint.odiNumber}`,
      complaint.component,
      vehicle || undefined,
    ].filter(Boolean);
    return {
      id: complaintId(complaint.odiNumber),
      title: parts.join(' — '),
      url: formatComplaintCitation(complaint).url,
      lastUpdated: isoToDate(complaint.dateComplaintFiled, EPOCH),
      metadata: { kind: 'complaint', record: complaint },
    };
  }

  lawToItem(section: NhtsaLawSection): NhtsaItem {
    return {
      id: lawId(section.section),
      title: `49 U.S.C. §${section.section} — ${section.heading}`,
      url: section.sourceUrl,
      lastUpdated: isoToDate(this.laws.meta.currentThrough, EPOCH),
      metadata: { kind: 'law', record: section },
    };
  }

  async search(query: SearchQuery): Promise<SearchResult<NhtsaItem>[]> {
    const text = query.text?.trim() ?? '';
    if (!text) return [];

    const results: SearchResult<NhtsaItem>[] = [];

    for (const hit of this.laws.searchLaws(text, query.limit)) {
      const item = this.lawToItem(hit.section);
      results.push({
        item,
        score: hit.score,
        snippet: hit.snippet,
        citation: formatLawCitation(hit.section, this.laws.meta),
      });
    }

    const parsed = parseVehicleQuery(text);
    if (parsed) {
      const vehicleLabel = `${parsed.modelYear} ${parsed.make} ${parsed.model}`.toUpperCase();
      const [recalls, complaints] = await Promise.allSettled([
        this.client.getRecalls(parsed),
        this.client.searchComplaints(parsed),
      ]);

      if (recalls.status === 'fulfilled') {
        for (const recall of recalls.value) {
          results.push({
            item: this.recallToItem(recall, vehicleLabel),
            score: 1,
            snippet: truncate(recall.summary),
            citation: formatRecallCitation(recall),
          });
        }
      }

      if (complaints.status === 'fulfilled') {
        for (const complaint of complaints.value) {
          const relevance = scoreComplaintRelevance(complaint, {
            keyword: parsed.keyword,
          });
          results.push({
            item: this.complaintToItem(complaint),
            score: relevance.score,
            snippet: truncate(complaint.summary),
            citation: formatComplaintCitation(complaint),
          });
        }
      }
      // Both arms rejected AND no law hits: surface the outage instead of
      // returning an empty set that reads as "no records exist".
      if (
        recalls.status === 'rejected' &&
        complaints.status === 'rejected' &&
        results.length === 0
      ) {
        throw recalls.reason;
      }
    }

    results.sort(
      (a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id),
    );
    return results.slice(query.offset, query.offset + query.limit);
  }

  async getById(id: string): Promise<NhtsaItem | null> {
    const parsed = parseNhtsaId(id);
    if (!parsed) return null;

    if (parsed.kind === 'law') {
      const section = this.laws.getSection(parsed.key);
      return section ? this.lawToItem(section) : null;
    }

    if (parsed.kind === 'recall') {
      const recalls = await this.client.getCampaign(parsed.key);
      const recall = recalls[0];
      return recall ? this.recallToItem(recall) : null;
    }

    const complaints = await this.client.getComplaint(parsed.key);
    const complaint = complaints[0];
    return complaint ? this.complaintToItem(complaint) : null;
  }

  /** A live source has no global "recent" — never registered as a tool. */
  async listRecent(_opts: ListRecentOpts): Promise<NhtsaItem[]> {
    return [];
  }

  formatCitation(item: NhtsaItem): Citation {
    switch (item.metadata.kind) {
      case 'recall':
        return formatRecallCitation(item.metadata.record as NhtsaRecall);
      case 'complaint':
        return formatComplaintCitation(item.metadata.record as NhtsaComplaint);
      case 'law':
        return formatLawCitation(item.metadata.record as NhtsaLawSection, this.laws.meta);
    }
  }

  /** Nothing to refresh: live upstream + a corpus refreshed by re-capture. */
  async refresh(): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }
}
