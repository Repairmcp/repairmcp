/**
 * CCR parsing, two halves. (1) parseCcrDocumentXml: the SOS serves one DOCX
 * per SERIES; this parses the DOCX's word/document.xml (the unzip lives in
 * capture-ccr, never here — this module ships in the barrel and must stay
 * dependency-free). Paragraphs are <w:p> elements; text is the concatenation
 * of <w:t> runs. Word auto-numbering (<w:numPr>) would mean numbering lives
 * in numbering.xml, not the text — that trips a WARNING because verbatim
 * capture cannot silently lose list numbers. (2) The find* helpers regex the
 * server-rendered SOS browse pages (deptID/agencyID → ruleId →
 * ruleVersionId + effective date + the word-document download). Their
 * shapes come from the kickoff's research pass; the first --save-raw run
 * (task 10) is the authority — harden there.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CcrParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CcrParseError';
  }
}

export type CcrHeaderKind = 'regulation' | 'comps-rule' | 'puc-rule';

export interface ParsedCcrReg {
  regNumber: string;
  heading: string;
  text: string;
  statedEffectiveDate?: string;
}

const HEADER_PATTERNS: Record<CcrHeaderKind, RegExp> = {
  regulation: /^Regulation\s+(\d+-\d+-\d+)\s+(.+)$/i,
  'comps-rule': /^Rule\s+(\d+(?:\.\d+)*)\.?\s+(.+)$/i,
  'puc-rule': /^(\d{4})\.\s+(.+)$/,
};

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function longDateToIso(text: string): string | undefined {
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i.exec(text);
  if (!m) return undefined;
  return `${m[3]}-${MONTHS[m[1]!.toLowerCase()]}-${m[2]!.padStart(2, '0')}`;
}

function paragraphsOf(xml: string): { text: string; autoNumbered: boolean }[] {
  const out: { text: string; autoNumbered: boolean }[] = [];
  for (const pMatch of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const pXml = pMatch[0];
    const runs = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => decodeEntities(m[1] ?? ''))
      .join('');
    const text = runs.replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, autoNumbered: /<w:numPr[\s/>]/.test(pXml) });
  }
  return out;
}

export function parseCcrDocumentXml(
  xml: string,
  opts: { headerKind: CcrHeaderKind; seriesNum: string },
): { regs: ParsedCcrReg[]; warnings: string[] } {
  const pattern = HEADER_PATTERNS[opts.headerKind];
  const warnings: string[] = [];
  const regs: ParsedCcrReg[] = [];
  let current: { regNumber: string; heading: string; lines: string[] } | null = null;

  const push = (): void => {
    if (!current) return;
    const text = current.lines.join('\n');
    regs.push({
      regNumber: current.regNumber,
      heading: current.heading,
      text,
      ...(longDateToIso(text.slice(-500)) && /effective/i.test(text.slice(-500))
        ? { statedEffectiveDate: longDateToIso(text.slice(-500)) }
        : {}),
    });
    current = null;
  };

  for (const para of paragraphsOf(xml)) {
    if (para.autoNumbered) {
      warnings.push(
        `${opts.seriesNum}: a paragraph uses Word auto-numbering — its list numbers live in ` +
          'numbering.xml, not the text. Eyeball the DOCX against the official PDF before accepting.',
      );
    }
    const header = pattern.exec(para.text);
    if (header) {
      push();
      current = { regNumber: header[1]!, heading: header[2]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(para.text);
  }
  push();

  if (regs.length === 0) {
    throw new CcrParseError(
      `${opts.seriesNum}: no ${opts.headerKind} headers found in the document — the split pattern no longer matches; re-derive it from the saved raw.`,
    );
  }
  return { regs, warnings };
}

function decodeHtml(html: string): string {
  return decodeEntities(html.replace(/&#x2F;/gi, '/'));
}

export function findAgencyIds(
  deptListHtml: string,
  deptName: string,
  agencyName: string,
): { deptID: number; agencyID: number } {
  const html = decodeHtml(deptListHtml);
  for (const m of html.matchAll(/NumericalCCRDocList\.do\?[^"']*deptID=(\d+)[^"']*agencyID=(\d+)[^"']*/gi)) {
    const context = html.slice(Math.max(0, m.index - 200), m.index + m[0].length + 300);
    const normalized = context.replace(/\+/g, ' ');
    if (normalized.includes(agencyName)) {
      return { deptID: Number(m[1]), agencyID: Number(m[2]) };
    }
  }
  throw new CcrParseError(
    `Agency "${agencyName}" (${deptName}) not found on the SOS department list — renumbered or template drift.`,
  );
}

export function findRuleId(docListHtml: string, seriesNum: string): number {
  const html = decodeHtml(docListHtml).replace(/\+/g, ' ');
  for (const m of html.matchAll(/DisplayRule\.do\?[^"']*ruleId=(\d+)[^"']*/gi)) {
    const context = html.slice(m.index, m.index + m[0].length + 300);
    if (context.includes(seriesNum)) return Number(m[1]);
  }
  throw new CcrParseError(`Series "${seriesNum}" not found on the SOS document list.`);
}

export function findCurrentVersion(ruleInfoHtml: string): {
  ruleVersionId: string;
  effectiveDate: string;
  docDownload: { url: string };
} {
  const html = decodeHtml(ruleInfoHtml);
  const dateMatch = /Effective\s+Date:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(html);
  if (!dateMatch) {
    throw new CcrParseError('No "Effective Date" on the rule-info page — template drift.');
  }
  const effectiveDate = `${dateMatch[3]}-${dateMatch[1]!.padStart(2, '0')}-${dateMatch[2]!.padStart(2, '0')}`;

  const wordMatch = /(?:word)[\s\S]{0,300}?ruleVersionId=(\d+)|ruleVersionId=(\d+)[\s\S]{0,300}?(?:word)/i.exec(html);
  const versionFromWord = wordMatch?.[1] ?? wordMatch?.[2];
  if (!versionFromWord) {
    throw new CcrParseError(
      'No word-document download found on the rule-info page. The PDF is the official rendering but is NOT a silent fallback — re-derive the word link from the saved raw.',
    );
  }
  const urlMatch = new RegExp(`[\\w./]*\\w+\\.do\\?[^"')]*ruleVersionId=${versionFromWord}[^"')]*`, 'i').exec(html);
  if (!urlMatch) {
    throw new CcrParseError('Word-document link found but its .do URL could not be extracted.');
  }
  return { ruleVersionId: versionFromWord, effectiveDate, docDownload: { url: urlMatch[0] } };
}
