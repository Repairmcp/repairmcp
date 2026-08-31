/**
 * Parsers for the SOS Appian portal's SAIL JSON (kickoff §3.2). Two halves:
 *
 * (1) parseTacBrowseRules: a VIEW_TAC browse document lists each rule as a
 *     "§5.501"-shaped rich-text number followed by a SafeLink whose label is
 *     the rule's title and whose uri carries the recordId. Both are found by
 *     an ORDERED recursive walk of the parsed JSON (insertion order IS
 *     document order); each number pairs with the next link. A count
 *     mismatch is template drift and throws.
 *
 * (2) parseTacRuleSummary: a VIEW_TAC_SUMMARY document embeds the rule text
 *     and its Source Note as JSON-in-string values
 *     ({"protocolVersion":1,…,"value":{"richText":"<p>…"}}); the breadcrumb
 *     fields carry "Rule §5.501" and the title. The Source Note ("The
 *     provisions of this §5.501 adopted to be effective July 12, 1998, 23
 *     TexReg 6962; amended to be effective October 12, 2006, 31 TexReg
 *     8372.") is the historyNote verbatim, and its NEWEST "effective" date
 *     is the rule's effectiveDate.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class TacParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TacParseError';
  }
}

export interface TacBrowseRule {
  cite: string;
  heading: string;
  recordId: string;
}

/**
 * The rule's heading is NOT parsed here — the browse SafeLink's label is the
 * title (verified against the real pages), and adjacent-string guessing in
 * the summary chrome would be fragile. Capture merges the browse heading.
 */
export interface ParsedTacRule {
  cite: string;
  text: string;
  historyNote?: string;
  effectiveDate?: string;
}

/** Ordered leaf-string walk. JSON.parse preserves document order. */
function walkStrings(node: unknown, visit: (value: string) => void): void {
  if (typeof node === 'string') {
    visit(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkStrings(item, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) walkStrings(value, visit);
  }
}

const RULE_NUMBER = /^§(\d+\.\d+)$/;
const SUMMARY_LINK = /recordId=(\d+)[^"']*interface=VIEW_TAC_SUMMARY/;

export function parseTacBrowseRules(doc: unknown): TacBrowseRule[] {
  // Ordered events: rule numbers, and SafeLink objects (label + uri). Links
  // are matched at the OBJECT level so the label/uri pairing cannot drift.
  const events: Array<{ kind: 'number'; cite: string } | { kind: 'link'; heading: string; recordId: string }> = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const uri = record['uri'];
    if (typeof uri === 'string') {
      const match = SUMMARY_LINK.exec(uri);
      if (match) {
        events.push({
          kind: 'link',
          heading: String(record['label'] ?? '').trim(),
          recordId: match[1]!,
        });
        return;
      }
    }
    for (const value of Object.values(record)) {
      if (typeof value === 'string') {
        const match = RULE_NUMBER.exec(value.trim());
        if (match) events.push({ kind: 'number', cite: match[1]! });
      } else {
        walk(value);
      }
    }
  };
  walk(doc);

  const rules: TacBrowseRule[] = [];
  let pendingCite: string | null = null;
  for (const event of events) {
    if (event.kind === 'number') {
      pendingCite = event.cite;
    } else if (pendingCite) {
      // Prev/Next navigation links have no preceding §number and are skipped.
      rules.push({ cite: pendingCite, heading: event.heading, recordId: event.recordId });
      pendingCite = null;
    }
  }
  if (rules.length === 0) {
    throw new TacParseError(
      'The TAC browse document lists no rules — template drift, or the portal answered a shell. ' +
        'Inspect the saved raw.',
    );
  }
  return rules;
}

function richTextToLines(richText: string): string[] {
  return richText
    .split(/<\/p>/i)
    .map((piece) => decodeEntities(piece.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

const TAC_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Newest "… to be effective <Month D, YYYY>" in a Source Note, as ISO. */
export function tacNewestEffectiveDate(sourceNote: string): string | undefined {
  let best: string | undefined;
  for (const match of sourceNote.matchAll(/effective\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/gi)) {
    const month = TAC_MONTHS[match[1]!.toLowerCase()];
    if (!month) continue;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
    if (!best || iso > best) best = iso;
  }
  return best;
}

export function parseTacRuleSummary(doc: unknown): ParsedTacRule {
  const richTexts: string[] = [];
  let cite: string | undefined;

  walkStrings(doc, (value) => {
    if (value.startsWith('{')) {
      try {
        const embedded = JSON.parse(value) as { value?: { richText?: unknown } };
        const richText = embedded?.value?.richText;
        if (typeof richText === 'string') richTexts.push(richText);
      } catch {
        // Not an embedded document — ignore.
      }
      return;
    }
    const match = /^Rule\s+§(\d+\.\d+)$/.exec(decodeEntities(value).trim());
    if (match) cite = match[1]!;
  });

  if (!cite) {
    throw new TacParseError(
      'The TAC rule document does not state its own "Rule §…" breadcrumb — template drift. ' +
        'Inspect the saved raw.',
    );
  }

  const sourceNoteRich = richTexts.find((r) => r.includes('Source Note:'));
  const bodyRich = richTexts.find((r) => !r.includes('Source Note:'));
  if (!bodyRich) {
    throw new TacParseError(`TAC ${cite}: no rule text in the summary document — template drift.`);
  }

  const text = richTextToLines(bodyRich).join('\n');
  const historyNote = sourceNoteRich
    ? richTextToLines(sourceNoteRich).join(' ').replace(/^Source Note:\s*/, 'Source Note: ')
    : undefined;
  const effectiveDate = historyNote ? tacNewestEffectiveDate(historyNote) : undefined;

  return {
    cite,
    text,
    ...(historyNote ? { historyNote } : {}),
    ...(effectiveDate ? { effectiveDate } : {}),
  };
}
