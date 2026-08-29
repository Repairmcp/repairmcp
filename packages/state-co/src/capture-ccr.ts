/**
 * The CCR capture pipeline. Two-tier discovery (names → ids → current
 * version), then ONE DOCX per series, unzipped here (fflate stays out of
 * the barrel) and split by parseCcrDocumentXml. The ruleVersionId is the
 * drift shortcut: when the rule-info page still states the version the
 * served corpus was captured from, the document fetch is skipped entirely
 * and the served text is reused — the CCR analog of ARM's content hashes.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { CaptureIo } from '@repairmcp/state-law';
import {
  findAgencyIds, findCurrentVersion, findRuleId, parseCcrDocumentXml,
} from './parse-ccr.js';
import type { CoSection } from './schema.js';
import { CCR_BASE, type CcrCaptureSource } from './sources-ccr.js';

/**
 * Second half of the shortcut gate: an unchanged ruleVersionId is not
 * sufficient — the previous cite set must still be what the CURRENT
 * manifest filter would select, or a manifest edit (regCite added/removed,
 * citePrefix narrowed/widened) between captures would silently ship the
 * stale set with no signal. 'regs' requires an exact set match; 'prefix'
 * requires every previous cite to still satisfy the current prefix (a
 * WIDENED prefix can't be detected this way — see the shortcut's log line).
 */
function previousMatchesCurrentFilter(
  source: CcrCaptureSource,
  previous: readonly CoSection[],
): boolean {
  const { filter } = source;
  if (filter.kind === 'regs') {
    if (previous.length !== filter.regCites.length) return false;
    const previousCites = new Set(previous.map((s) => s.cite));
    return filter.regCites.every((cite) => previousCites.has(cite));
  }
  return previous.every((s) => s.cite.startsWith(filter.citePrefix));
}

export function regNumberToCite(source: CcrCaptureSource, regNumber: string): string {
  if (source.headerKind === 'regulation') {
    // DOI regs print "5-1-14"; the leading series digit is already the
    // chapter's tail, so the cite is chapterKey + the reg minus that digit:
    // 702-5 + 5-1-14 → 702-5-1-14.
    const withoutSeriesDigit = regNumber.replace(/^\d+-/, '');
    return `${source.chapterKey}-${withoutSeriesDigit}`;
  }
  // COMPS rules ("5.2") and PUC rules ("6511") append whole: 1103-1-5.2, 723-6-6511.
  return `${source.chapterKey}-${regNumber}`;
}

export async function captureCcr(
  io: CaptureIo,
  sources: readonly CcrCaptureSource[],
  opts: { previousSections?: readonly CoSection[] } = {},
): Promise<{ sections: CoSection[]; report: { skippedEmpty: string[]; warnings: string[] } }> {
  if (!io.fetchBinary) {
    throw new Error('CCR capture needs io.fetchBinary (DOCX documents) — wire makeCaptureIo.');
  }
  const sections: CoSection[] = [];
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];

  const deptListHtml = await io.fetchText(`${CCR_BASE}/NumericalDeptList.do`, {
    rawName: 'ccr-deptlist.html',
  });

  for (const source of sources) {
    const { deptID, agencyID } = findAgencyIds(deptListHtml, source.deptName, source.agencyName);
    const docListHtml = await io.fetchText(
      `${CCR_BASE}/NumericalCCRDocList.do?deptID=${deptID}&agencyID=${agencyID}`,
      { rawName: `ccr-doclist-${source.chapterKey}.html` },
    );
    const ruleId = findRuleId(docListHtml, source.seriesNum);
    const ruleInfoUrl = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${ruleId}&deptID=${deptID}&agencyID=${agencyID}`;
    const ruleInfoHtml = await io.fetchText(ruleInfoUrl, {
      rawName: `ccr-ruleinfo-${source.chapterKey}.html`,
    });
    const version = findCurrentVersion(ruleInfoHtml);

    const previous = (opts.previousSections ?? []).filter(
      (s) => s.code === source.code && s.chapter === source.chapterKey,
    );
    if (
      previous.length > 0 &&
      previous.every((s) => s.ccrRuleVersionId === version.ruleVersionId) &&
      previousMatchesCurrentFilter(source, previous)
    ) {
      const residualNote = source.filter.kind === 'prefix'
        ? ` (prefix ${source.filter.citePrefix} — a WIDENED prefix can't be detected without the document; force a refetch if it changed)`
        : '';
      io.log(`  ${source.seriesNum}: version ${version.ruleVersionId} unchanged — document fetch skipped${residualNote}.`);
      sections.push(...previous);
      continue;
    }

    const docUrl = version.docDownload.url.startsWith('http')
      ? version.docDownload.url
      : `${CCR_BASE}/${version.docDownload.url.replace(/^\/?(?:CCR\/)?/, '')}`;
    const docxBytes = await io.fetchBinary(docUrl, {
      rawName: `ccr-doc-${source.chapterKey}.docx.b64`,
      accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(docxBytes);
    } catch {
      throw new Error(
        `${source.seriesNum}: the word-document download is not a zip (DOCX) — it may be a legacy .doc or an error page. Inspect the saved raw.`,
      );
    }
    const documentXml = files['word/document.xml'];
    if (!documentXml) {
      throw new Error(`${source.seriesNum}: DOCX has no word/document.xml — inspect the saved raw.`);
    }

    const parsed = parseCcrDocumentXml(strFromU8(documentXml), {
      headerKind: source.headerKind,
      seriesNum: source.seriesNum,
    });
    warnings.push(...parsed.warnings);

    const byCite = new Map(parsed.regs.map((r) => [regNumberToCite(source, r.regNumber), r]));

    let wantedCites: string[];
    if (source.filter.kind === 'regs') {
      for (const cite of source.filter.regCites) {
        if (!byCite.has(cite)) {
          throw new Error(
            `${source.seriesNum}: ${cite} was requested by name but is not in the document. ` +
              'The series may have renumbered (COMPS orders do) — reconcile the manifest against the real document.',
          );
        }
      }
      wantedCites = [...source.filter.regCites];
    } else {
      const prefix = source.filter.citePrefix;
      wantedCites = [...byCite.keys()].filter((cite) => cite.startsWith(prefix));
      const dropped = byCite.size - wantedCites.length;
      io.log(`  ${source.seriesNum}: prefix ${prefix} kept ${wantedCites.length}, dropped ${dropped}.`);
      if (wantedCites.length === 0) {
        throw new Error(`${source.seriesNum}: prefix ${prefix} matched nothing — renumbered?`);
      }
    }

    for (const cite of wantedCites) {
      const reg = byCite.get(cite)!;
      sections.push({
        cite,
        code: source.code,
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: reg.heading,
        text: reg.text,
        effectiveDate: reg.statedEffectiveDate ?? version.effectiveDate,
        domain: source.domain,
        sourceUrl: ruleInfoUrl,
        ccrRuleVersionId: version.ruleVersionId,
      });
    }
  }

  return { sections, report: { skippedEmpty, warnings } };
}
