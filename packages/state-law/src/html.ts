/**
 * Shared HTML text helpers for state capture parsers. Each state's page
 * template gets its own parser (they are genuinely different sites), but
 * entity decoding is the same job everywhere. Moved from the Washington
 * parser at the state-law extraction.
 *
 * Numeric references in the C1 control range (128–159) decode through the
 * Windows-1252 table, as the WHATWG HTML parser does: the Pennsylvania Code
 * prints `&#151;` for an em dash and `&#145;`/`&#146;` for curly quotes on
 * pages that declare UTF-8 (added at PA). A literal fromCodePoint would
 * produce invisible control characters inside verbatim law text.
 */

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

/** WHATWG "numeric character reference" replacements for 0x80–0x9F. */
const CP1252: Record<number, number> = {
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021,
  136: 0x02c6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017d,
  145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014,
  152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a, 156: 0x0153, 158: 0x017e, 159: 0x0178,
};

export function decodeEntities(value: string): string {
  let out = value;
  for (const [entity, replacement] of Object.entries(ENTITY_MAP)) {
    out = out.replaceAll(entity, replacement);
  }
  // Decode numeric references generically; `&amp;` last so it cannot
  // manufacture new entities out of decoded text.
  out = out.replace(/&#(\d+);/g, (_, code: string) => {
    const n = Number.parseInt(code, 10);
    return String.fromCodePoint(CP1252[n] ?? n);
  });
  return out.replaceAll('&amp;', '&');
}
