/**
 * DEG's source identity and citation construction, in one place.
 *
 * Two adapters now serve the same corpus — `DEGAdapter` over a JSON file for
 * the local STDIO server, `D1DEGAdapter` over Cloudflare D1 for the remote one.
 * The identity strings feed tool *names* (`${sourceId}_search_${itemNounPlural}`)
 * and the citation feeds text a shop drops verbatim into a supplement. Two
 * copies of either would be two things to keep in sync, and a divergence would
 * show up as an insurer's auditor failing to cross-reference a citation.
 */
import { buildCitation, type Citation } from '@repairmcp/core';
import type { DEGInquiry } from './schema.js';

export const DEG_IDENTITY = {
  sourceId: 'deg',
  sourceName: 'Database Enhancement Gateway',
  sourceShortName: 'DEG',
  sourceUrl: 'https://degweb.org',
  description:
    'Industry-funded inquiry resolution system for collision estimating database accuracy.',
  itemNoun: 'inquiry',
  itemNounPlural: 'inquiries',
} as const;

/** UTC-locked citation for a DEG inquiry. Never format dates outside this path. */
export function formatDegCitation(item: DEGInquiry): Citation {
  return buildCitation({
    sourceId: DEG_IDENTITY.sourceId,
    sourceName: DEG_IDENTITY.sourceName,
    sourceShortName: DEG_IDENTITY.sourceShortName,
    itemId: item.inquiryNumber,
    url: item.url,
    itemNoun: DEG_IDENTITY.itemNoun,
    publishedAt: item.submittedAt,
    resolvedAt: item.resolvedAt,
  });
}
