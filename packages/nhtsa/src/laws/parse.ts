/**
 * Parser for the OLRC (uscode.house.gov) chapter view HTML.
 *
 * The markup is comment-delimited and regular (verified against the live
 * document 2026-08-27): every section carries
 *
 *   <!-- documentid:49_30122  usckey:... currentthrough:20260430_119-87 ... -->
 *   <!-- itempath:/490/SUBTITLE VI/PART A/CHAPTER 301/SUBCHAPTER II/Sec. 30122 -->
 *   <!-- field-start:head --> <h3 class="section-head">§30122. Heading</h3> ...
 *   <!-- field-start:statute --> ...statute paragraphs... <!-- field-end:statute -->
 *
 * Only blocks with a statute field are captured — repealed and omitted
 * sections carry notes but no statute text, and serving a heading with no
 * body would invite the model to paraphrase from memory, which is exactly
 * what this corpus exists to prevent.
 *
 * String/regex based on purpose: no HTML parser dependency, and the input is
 * machine-generated markup from a single producer, not the open web.
 */

import type { NhtsaLawSection } from './schema.js';

export interface ParsedChapter {
  chapterName: string;
  /** `YYYY-MM-DD` from the OLRC currentthrough marker. */
  currentThrough: string;
  /** e.g. "P.L. 119-87". */
  publicLaw: string;
  sections: NhtsaLawSection[];
}

export class LawParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LawParseError';
  }
}

export function olrcSectionUrl(section: string): string {
  return `https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section${section.toLowerCase()}&num=0&edition=prelim`;
}

const ENTITY_MAP: Record<string, string> = {
  '&sect;': '§',
  '&#167;': '§',
  '&mdash;': '—',
  '&#8212;': '—',
  '&ndash;': '–',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&quot;': '"',
  '&#160;': ' ',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

export function decodeEntities(value: string): string {
  let out = value;
  for (const [entity, replacement] of Object.entries(ENTITY_MAP)) {
    out = out.replaceAll(entity, replacement);
  }
  // Decode numeric references generically; `&amp;` last so it cannot
  // manufacture new entities out of decoded text.
  out = out.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 10)),
  );
  return out.replaceAll('&amp;', '&');
}

/** Strip tags from one statute paragraph and normalize its whitespace. */
function paragraphText(html: string): string {
  const noTags = html.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/**
 * Convert the statute field's HTML into plain text, one paragraph per line.
 * Subsection lettering — "(a)", "(1)" — is part of the paragraph text itself,
 * so it survives verbatim.
 */
function statuteText(html: string): string {
  const paragraphs: string[] = [];
  const paraPattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
  for (const match of html.matchAll(paraPattern)) {
    const text = paragraphText(match[1] ?? '');
    if (text) paragraphs.push(text);
  }
  // A statute field with no <p> content at all (tables only, etc.) falls back
  // to a flat strip so nothing silently vanishes.
  if (paragraphs.length === 0) {
    const flat = paragraphText(html);
    return flat;
  }
  return paragraphs.join('\n');
}

export function parseChapterHtml(html: string): ParsedChapter {
  const currency = /currentthrough:(\d{8})_(\d+-\d+)/.exec(html);
  if (!currency) {
    throw new LawParseError(
      'OLRC currentthrough marker not found — refusing to build a corpus that cannot state its own currency.',
    );
  }
  const stamp = currency[1] ?? '';
  const currentThrough = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
  const publicLaw = `P.L. ${currency[2] ?? ''}`;

  const chapterNameMatch = /CHAPTER\s+301(?:<\/usCode>)?\s*(?:&mdash;|—|-)\s*([A-Z][A-Z\s]+?)\s*(?:<|!@!)/.exec(
    html,
  );
  const chapterName = chapterNameMatch?.[1]?.trim() ?? 'MOTOR VEHICLE SAFETY';

  const sections: NhtsaLawSection[] = [];
  const seen = new Set<string>();

  // Split into per-document blocks; each block begins at its documentid comment.
  const blocks = html.split('<!-- documentid:');
  for (const block of blocks) {
    const idMatch = /^49_(\d+[A-Za-z]?)\s/.exec(block);
    if (!idMatch) continue;
    const section = (idMatch[1] ?? '').toUpperCase();
    if (seen.has(section)) continue;

    const headMatch = /<h3 class="section-head">([\s\S]*?)<\/h3>/.exec(block);
    if (!headMatch) continue;
    const headText = paragraphText(headMatch[1] ?? '');
    // "§30122. Making safety devices and elements inoperative"
    const headParts = /^§?\s*([0-9]+[A-Za-z]?)\.\s*(.+)$/.exec(headText);
    const heading = headParts?.[2]?.trim() ?? headText;

    const statuteMatch =
      /<!-- field-start:statute -->([\s\S]*?)<!-- field-end:statute -->/.exec(block);
    if (!statuteMatch) continue; // repealed/omitted: notes only, no statute text
    const text = statuteText(statuteMatch[1] ?? '');
    if (!text) continue;

    const pathMatch = /itempath:[^>]*\/(SUBCHAPTER [IVXLC]+)\//.exec(block);

    sections.push({
      section,
      heading,
      subchapter: pathMatch?.[1],
      text,
      sourceUrl: olrcSectionUrl(section),
    });
    seen.add(section);
  }

  if (sections.length === 0) {
    throw new LawParseError('No sections with statute text found in the OLRC document.');
  }

  return { chapterName, currentThrough, publicLaw, sections };
}
