/**
 * The TAC capture pipeline: for each manifest entry, fetch the browse JSON
 * (resolving each wanted rule's recordId and heading), then each rule's
 * summary JSON. Named rule cites hard-fail when absent from the browse page;
 * the summary's own "Rule §…" breadcrumb is cross-checked against the cite
 * that was asked for, so a recordId can never silently deliver the wrong
 * rule's text.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseTacBrowseRules, parseTacRuleSummary } from './parse-tac.js';
import type { TxSection } from './schema.js';
import {
  TAC_ACCEPT,
  TAC_APPIAN_HEADERS,
  tacBrowseUrl,
  tacRuleSourceUrl,
  tacRuleUrl,
  type TacCaptureSource,
} from './sources-tac.js';

export interface TacCaptureResult {
  sections: TxSection[];
  report: { skippedEmpty: string[]; warnings: string[] };
}

const APPIAN_OPTS = { accept: TAC_ACCEPT, headers: TAC_APPIAN_HEADERS };

function todayQueryAsDate(): string {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${now.getUTCFullYear()}`;
}

export async function captureTac(
  io: CaptureIo,
  sources: readonly TacCaptureSource[],
): Promise<TacCaptureResult> {
  const warnings: string[] = [];
  const out: TxSection[] = [];
  const queryAsDate = todayQueryAsDate();

  for (const source of sources) {
    const browseName = `tac-${source.chapter}${source.subchapter}${source.division ?? ''}.json`;
    const browseDoc = await io.fetchJson(tacBrowseUrl(source), {
      rawName: browseName,
      ...APPIAN_OPTS,
    });
    const rules = parseTacBrowseRules(browseDoc);
    const byCite = new Map(rules.map((r) => [r.cite, r]));

    for (const cite of source.ruleCites) {
      const rule = byCite.get(cite);
      if (!rule) {
        throw new Error(
          `28 TAC ${cite} was requested by name but the ${source.chapter}` +
            `${source.subchapter}${source.division ? `-${source.division}` : ''} browse page ` +
            `lists only [${rules.map((r) => r.cite).join(', ')}] — renumbered or repealed ` +
            'upstream; reconcile the manifest consciously.',
        );
      }
      const summaryDoc = await io.fetchJson(tacRuleUrl(rule.recordId, queryAsDate), {
        rawName: `tac-rule-${cite}.json`,
        ...APPIAN_OPTS,
      });
      const parsed = parseTacRuleSummary(summaryDoc);
      if (parsed.cite !== cite) {
        throw new Error(
          `28 TAC ${cite}: recordId ${rule.recordId} delivered a document that states ` +
            `"Rule §${parsed.cite}" — the browse pairing drifted; inspect the saved raw.`,
        );
      }
      if (!parsed.effectiveDate) {
        warnings.push(`28 TAC ${cite}: no effective date parsed from the Source Note.`);
      }
      out.push({
        cite,
        code: '28 TAC',
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: rule.heading,
        text: parsed.text,
        ...(parsed.effectiveDate ? { effectiveDate: parsed.effectiveDate } : {}),
        ...(parsed.historyNote ? { historyNote: parsed.historyNote } : {}),
        domain: source.domain,
        sourceUrl: tacRuleSourceUrl(rule.recordId),
        tacRecordId: rule.recordId,
      });
    }
  }

  return { sections: out, report: { skippedEmpty: [], warnings } };
}
