/**
 * The FAC capture pipeline. Two tiers (parse-fac.ts): the chapter page
 * resolves every rule's notice id, title, and effective date; the rule card
 * states the history line; the Word document holds the text. The notice id
 * is the drift shortcut: when the chapter page still lists the id the served
 * corpus was captured from, the document fetch is skipped and the served
 * section reused — the Florida analog of Colorado's CCR ruleVersionId, with
 * the same gate that the shortcut only applies to a rule the CURRENT
 * manifest still names (a manifest edit re-fetches).
 *
 * Cross-checks, all hard failures: a manifest rule absent from the chapter
 * page; a card whose effective date differs from the chapter row; a
 * document whose first line does not open with the requested rule number;
 * a document whose trailing history line disagrees with the card's on the
 * dates it lists.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { extractDocText } from './doc-text.js';
import { parseFacChapterPage, parseFacDocumentText, parseFacRuleCard } from './parse-fac.js';
import type { FlSection } from './schema.js';
import { FLRULES_BASE, facChapterUrl, facRuleCardUrl, type FlFacCaptureSource } from './sources-fac.js';

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

/** The dates a history line states, in order — the comparable core of card vs. document. */
export function historyDates(line: string): string[] {
  return [...line.matchAll(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g)].map((m) => m[0]);
}

export async function captureFlFac(
  io: CaptureIo,
  sources: readonly FlFacCaptureSource[],
  opts: {
    previousSections?: readonly FlSection[];
    /** Injected in tests so the fixtures need not be real Word documents. */
    extractText?: (bytes: Uint8Array) => Promise<string>;
  } = {},
): Promise<{ sections: FlSection[]; report: { warnings: string[] } }> {
  if (!io.fetchBinary) {
    throw new Error('FAC capture needs io.fetchBinary (Word documents) — wire makeCaptureIo.');
  }
  const extract = opts.extractText ?? extractDocText;
  const sections: FlSection[] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    const chapterHtml = await io.fetchText(facChapterUrl(source.chapter), {
      rawName: `fac-chapter-${source.chapter}.html`,
    });
    const rows = parseFacChapterPage(chapterHtml);

    for (const spec of source.rules) {
      const row = rows.find((r) => r.cite === spec.cite);
      if (!row) {
        throw new Error(
          `Fla. Admin. Code ${spec.cite} was requested by name but chapter ${source.chapter} ` +
            `lists ${rows.map((r) => r.cite).join(', ')} — repealed or renumbered upstream; ` +
            'reconcile the manifest consciously.',
        );
      }

      const previous = (opts.previousSections ?? []).find(
        (s) => s.code === 'Fla. Admin. Code' && s.cite === spec.cite,
      );
      if (previous && previous.facNoticeId === row.noticeId && previous.effectiveDate === row.effectiveDate) {
        io.log(`  ${spec.cite}: notice ${row.noticeId} unchanged — document fetch skipped.`);
        sections.push(previous);
        continue;
      }

      const cardHtml = await io.fetchText(facRuleCardUrl(spec.cite), {
        rawName: `fac-rule-${spec.cite}.html`,
      });
      const card = parseFacRuleCard(cardHtml);
      if (card.effectiveDate !== row.effectiveDate) {
        throw new Error(
          `${spec.cite}: the rule card states effective ${card.effectiveDate} but the chapter ` +
            `page states ${row.effectiveDate} — the site is mid-update; re-run.`,
        );
      }
      if (card.noticeId !== row.noticeId) {
        throw new Error(
          `${spec.cite}: the rule card links notice ${card.noticeId} but the chapter page ` +
            `links ${row.noticeId} — the site is mid-update; re-run.`,
        );
      }

      const docUrl = card.docHref.startsWith('http') ? card.docHref : `${FLRULES_BASE}${card.docHref}`;
      const bytes = await io.fetchBinary(docUrl, {
        rawName: `fac-doc-${spec.cite}.doc.b64`,
        accept: 'application/msword',
      });
      if (!OLE_MAGIC.every((b, i) => bytes[i] === b)) {
        throw new Error(
          `${spec.cite}: the download is not a Word 97 document (it starts ` +
            `${[...bytes.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ')}) — ` +
            'an error page, or the site changed formats. Inspect the saved raw.',
        );
      }
      const body = await extract(bytes);
      const parsed = parseFacDocumentText(body, spec.cite);

      if (parsed.historyLine) {
        const docDates = historyDates(parsed.historyLine);
        const cardDates = historyDates(card.historyNote);
        if (docDates.join('|') !== cardDates.join('|')) {
          throw new Error(
            `${spec.cite}: the document's history line lists dates [${docDates.join(', ')}] but ` +
              `the rule card lists [${cardDates.join(', ')}] — the notice delivered a different ` +
              'version than the card describes.',
          );
        }
      } else {
        warnings.push(`${spec.cite}: the document carries no trailing history line; the card's is used.`);
      }

      sections.push({
        cite: spec.cite,
        code: 'Fla. Admin. Code',
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: parsed.title,
        text: parsed.text,
        effectiveDate: card.effectiveDate,
        historyNote: card.historyNote,
        domain: source.domain,
        sourceUrl: facRuleCardUrl(spec.cite),
        facNoticeId: row.noticeId,
      });
    }
  }

  return { sections, report: { warnings } };
}
