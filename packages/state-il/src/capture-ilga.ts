/**
 * The Illinois pipeline: twelve whole-act pages, six article-range pages,
 * and five whole-Part Administrative Code pages from ilga.gov at the site's
 * own 10 s crawl delay, parsed once per page, selected per manifest cite.
 * Hard-fails, all by name: a named cite absent from its page (the act page
 * exists but the Legislature renumbered or repealed the section, or the
 * article range moved), a named cite with no body text, a named
 * Administrative Code section the Part marks "(Repealed)", a Part whose
 * table of contents does not list a named section.
 *
 * Decision 4 (kickoff) is applied here through selectVersion: every
 * dual-printed section records every printed version and which one the
 * corpus carries, and the capture report lists them so the log prints
 * them. A chosen version whose effective date is after the capture date is
 * kept as printed, flagged futureEffective, and warned about.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseIacPart, sectionPageUrl } from './parse-iac.js';
import { parseIlcsPage, selectVersion } from './parse-ilcs.js';
import type { IlDualPrinted, IlSection } from './schema.js';
import { IL_MIN_DELAY_MS, iacCite, ilcsCite, partChapter, rawName, unitUrl, type IlActSource, type IlArticleSource, type IlPartSource, type IlSource } from './sources.js';

export interface IlCaptureResult {
  sections: IlSection[];
  report: {
    warnings: string[];
    dualPrinted: IlDualPrinted[];
    /** Cites that carry the manifest's heading because the page prints no catchline. */
    manifestHeadings: string[];
    futureEffective: string[];
  };
}

function versionLabel(label: string | undefined): string {
  return label ?? 'only version';
}

async function captureStatutes(io: CaptureIo, src: IlActSource | IlArticleSource, capturedAt: string, result: IlCaptureResult): Promise<void> {
  const unitLabel = src.kind === 'act' ? `${src.chapter} (ActID ${src.actId})` : `${src.chapter} ${src.articleName} (${src.seqStart}–${src.seqEnd})`;
  const html = await io.fetchText(unitUrl(src), { rawName: rawName(src), minDelayMs: IL_MIN_DELAY_MS });
  const parsed = parseIlcsPage(html, unitLabel);
  if (parsed.length === 0) {
    throw new Error(`${unitLabel}: the page's text block is EMPTY — ilga.gov answers an unknown ActID this way (HTTP 200, no sections); the act was renumbered or the id changed. Read the chapter listing before capturing.`);
  }
  const byCite = new Map(parsed.map((s) => [s.cite, s]));
  for (const entry of src.sections) {
    const cite = ilcsCite(src.chapter, entry.section);
    const section = byCite.get(cite);
    if (!section) {
      throw new Error(`${cite} was requested by name but is absent from ${unitLabel} — renumbered or repealed upstream, or the article range moved; correct the manifest after reading the page.`);
    }
    const choice = selectVersion(section, capturedAt);
    const text = choice.chosen.bodyLines.join('\n');
    if (!text) throw new Error(`${cite} captured no body text — the parser lost the section or the site changed; re-derive from the saved raw before capturing.`);
    const heading = choice.chosen.heading ?? entry.heading;
    const headingSource = choice.chosen.heading ? 'section' : 'manifest';
    if (headingSource === 'manifest') result.report.manifestHeadings.push(cite);
    if (choice.futureEffective) {
      result.report.futureEffective.push(cite);
      result.report.warnings.push(`${cite}: the captured text's effective date ${choice.chosen.effectiveDate} is after the capture date ${capturedAt} — ilga.gov printed a not-yet-effective version; review before shipping.`);
    }
    const out: IlSection = {
      cite,
      code: 'ILCS',
      chapter: src.chapter,
      chapterTitle: src.actName,
      heading,
      headingSource,
      text,
      domain: entry.domain,
      sourceUrl: unitUrl(src),
      captureSource: src.kind,
      sourceNote: choice.chosen.sourceNote,
      publicActs: choice.chosen.publicActs,
      ...(choice.chosen.effectiveDate ? { effectiveDate: choice.chosen.effectiveDate } : {}),
      ...(section.formerCite ? { formerCite: section.formerCite } : {}),
      ...(choice.futureEffective ? { futureEffective: true } : {}),
    };
    if (choice.versionNote) {
      out.printedVersions = choice.printed.map((v) => ({
        label: versionLabel(v.label),
        publicActs: v.publicActs,
        ...(v.effectiveDate ? { effectiveDate: v.effectiveDate } : {}),
      }));
      out.versionNote = choice.versionNote;
      result.report.dualPrinted.push({ cite, chosen: versionLabel(choice.chosen.label), printed: choice.printed.map((v) => versionLabel(v.label)) });
    }
    result.sections.push(out);
  }
}

async function capturePart(io: CaptureIo, src: IlPartSource, result: IlCaptureResult): Promise<void> {
  const html = await io.fetchText(unitUrl(src), { rawName: rawName(src), minDelayMs: IL_MIN_DELAY_MS });
  const part = parseIacPart(html, { title: src.title, part: src.part });
  const byNum = new Map(part.sections.map((s) => [s.num, s]));
  for (const entry of src.sections) {
    const cite = iacCite(src.title, entry.section);
    const s = byNum.get(entry.section);
    if (!s) throw new Error(`${cite} was requested by name but is absent from the Part ${src.part} page — renumbered or repealed upstream; correct the manifest after reading the page.`);
    if (/\(Repealed\)/i.test(s.heading)) throw new Error(`${cite} was requested by name but the Part marks it "${s.heading}" — correct the manifest after reading the page.`);
    if (!s.text) throw new Error(`${cite} captured no body text — the parser lost the section or the site changed; re-derive from the saved raw before capturing.`);
    const inherited = s.effectiveDate === undefined;
    result.sections.push({
      cite,
      code: 'Ill. Adm. Code',
      chapter: partChapter(src.title, src.part),
      chapterTitle: src.partTitle,
      heading: s.heading,
      headingSource: 'section',
      text: s.text,
      domain: entry.domain,
      sourceUrl: sectionPageUrl(src.title, src.part, s.subpart, s.num),
      captureSource: 'part',
      sourceNote: s.sourceNote ?? part.partSource,
      effectiveDate: s.effectiveDate ?? part.partAdoptedDate,
      dateSource: inherited ? 'part' : 'section',
      ...(s.illRegCite ? { illRegCite: s.illRegCite } : {}),
    });
  }
}

export async function captureIllinois(io: CaptureIo, sources: readonly IlSource[], capturedAt: string): Promise<IlCaptureResult> {
  const result: IlCaptureResult = { sections: [], report: { warnings: [], dualPrinted: [], manifestHeadings: [], futureEffective: [] } };
  for (const src of sources) {
    if (src.kind === 'part') await capturePart(io, src, result);
    else await captureStatutes(io, src, capturedAt, result);
  }
  for (const d of result.report.dualPrinted) io.log(`dual-printed: ${d.cite} — carrying "${d.chosen}" of [${d.printed.join(' | ')}]`);
  io.log(`manifest headings (no printed catchline): ${result.report.manifestHeadings.length} — ${result.report.manifestHeadings.join(', ')}`);
  return result;
}
