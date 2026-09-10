/**
 * Parser for DFS guidance pages (dfs.ny.gov): OGC opinions at
 * /insurance/ogco{yyyy}/rg{id}.htm and circular letters at
 * /industry_guidance/circular_letters/cl{yyyy}_{n}. Drupal, server-
 * rendered; the document sits in div.body-area-in. VERIFIED 2026-09-10 on
 * all six manifest pages. The <title> names the document ("OGC Opinion No.
 * 04-06-03: Subject | Department …", "Insurance Circular Letter No. 16
 * (2000): Subject | …") and is the identity tripwire. The issue date is the
 * opinion's "issued the following opinion on <Month D, YYYY>" sentence or
 * the letter's own dateline; a letter DFS has withdrawn opens with "NOTE:
 * WITHDRAWN EFFECTIVE <MONTH D, YYYY>" and that date is captured too.
 * Guidance is not law; the tool descriptions and annotations say so.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class NyDfsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NyDfsParseError';
  }
}

export interface ParsedDfsPage {
  number: string;
  subject: string;
  issueDate: string;
  withdrawnDate?: string;
  /** One block per line, from the document's own heading on. */
  text: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const LONG_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i;

export function longDateToIso(s: string): string | undefined {
  const m = LONG_DATE.exec(s);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function linearize(html: string): string[] {
  return html
    .replace(/\s+/g, ' ')
    .replace(/<\/(?:td|th)>\s*<(?:td|th)\b[^>]*>/gi, ' ')
    .replace(/<(?:p|div|br|li|h\d|tr|table)\b[^>]*>/gi, '\n$&')
    .replace(/<\/(?:p|div|li|h\d|tr|table)>/gi, '$&\n')
    .split('\n')
    .map(clean)
    .filter((l) => l.length > 0);
}

export function parseDfsHtml(html: string, expected: { kind: 'ogc' | 'circular'; number: string }): ParsedDfsPage {
  const titleText = clean(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
  const titleRe = expected.kind === 'ogc'
    ? /^OGC Opinion No\. ([\d-]+):\s*(.+?)\s*\|/
    : /^(?:Insurance )?Circular Letter No\. (\d+ \(\d{4}\)):\s*(.+?)\s*\|/;
  const t = titleRe.exec(titleText);
  const wanted = expected.kind === 'ogc' ? `OGC Opinion No. ${expected.number}` : `Circular Letter No. ${expected.number}`;
  if (!t) throw new NyDfsParseError(`${wanted}: the page title reads "${titleText}" — not a DFS ${expected.kind} page, or template drift.`);
  if (t[1] !== expected.number) {
    throw new NyDfsParseError(`${wanted}: the page names ${expected.kind === 'ogc' ? 'OGC Opinion No.' : 'Circular Letter No.'} ${t[1]} — the URL delivered a different document.`);
  }
  const subject = t[2]!;

  const bodyStart = html.indexOf('class="body-area-in"');
  if (bodyStart < 0) throw new NyDfsParseError(`${wanted}: no body-area-in region — template drift.`);
  const bodyEnd = html.indexOf('<footer', bodyStart);
  const lines = linearize(html.slice(bodyStart, bodyEnd > 0 ? bodyEnd : undefined));
  if (lines.length === 0) throw new NyDfsParseError(`${wanted}: empty body.`);

  let withdrawnDate: string | undefined;
  const withdrawnLine = lines.find((l) => /^NOTE:\s*WITHDRAWN EFFECTIVE\b/i.test(l));
  if (withdrawnLine) {
    withdrawnDate = longDateToIso(withdrawnLine);
    if (!withdrawnDate) throw new NyDfsParseError(`${wanted}: withdrawal line "${withdrawnLine}" carries no readable date.`);
  }

  let issueDate: string | undefined;
  if (expected.kind === 'ogc') {
    const sentence = lines.find((l) => /issued the following opinion on/i.test(l));
    issueDate = sentence ? longDateToIso(sentence) : undefined;
  } else {
    const idx = lines.findIndex((l) => new RegExp(`^Circular Letter No\\. ${expected.number.replace(/[()]/g, '\\$&')}$`).test(l));
    issueDate = idx >= 0 ? longDateToIso(lines[idx + 1] ?? '') : undefined;
  }
  if (!issueDate) throw new NyDfsParseError(`${wanted}: no issue date found on the page.`);

  const first = lines.findIndex((l) => /^(OGC Opinion No\.|Circular Letter No\.|NOTE:\s*WITHDRAWN)/i.test(l));
  const text = lines.slice(first >= 0 ? first : 0).join('\n');
  return { number: expected.number, subject, issueDate, ...(withdrawnDate ? { withdrawnDate } : {}), text };
}
