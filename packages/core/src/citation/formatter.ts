import type { Citation } from './schema.js';

export interface CitationInput {
  sourceId: string;
  sourceName: string;
  /** Short brand label used in the short-form citation, e.g. "DEG", "I-CAR". */
  sourceShortName: string;
  itemId: string;
  url: string;
  /** Singular noun for the item type, e.g. "inquiry", "article", "tip". Defaults to "entry". */
  itemNoun?: string;
  publishedAt?: Date;
  resolvedAt?: Date;
}

export function buildCitation(input: CitationInput): Citation {
  const noun = input.itemNoun ?? 'entry';
  const dateForShort = input.resolvedAt ?? input.publishedAt;
  const dateStr = dateForShort
    ? dateForShort.toLocaleDateString('en-US')
    : 'date unknown';

  const shortForm = `${input.sourceShortName} #${input.itemId} (${dateStr})`;

  const longForm = input.resolvedAt
    ? `${input.sourceName} ${noun} #${input.itemId}, resolved ${input.resolvedAt.toLocaleDateString('en-US')}, ${input.url}`
    : `${input.sourceName} ${noun} #${input.itemId}, ${input.url}`;

  return {
    shortForm,
    longForm,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    itemId: input.itemId,
    url: input.url,
    retrievedAt: new Date(),
    publishedAt: input.publishedAt,
    resolvedAt: input.resolvedAt,
  };
}
