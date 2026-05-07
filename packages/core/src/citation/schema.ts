/**
 * Standard citation format returned alongside every item.
 * AIs are instructed to use shortForm or longForm verbatim in generated text.
 */
export interface Citation {
  shortForm: string;
  longForm: string;
  sourceId: string;
  sourceName: string;
  itemId: string;
  url: string;
  retrievedAt: Date;
  publishedAt?: Date;
  resolvedAt?: Date;
}
