/**
 * Shared HTML text helpers for state capture parsers. Each state's page
 * template gets its own parser (they are genuinely different sites), but
 * entity decoding is the same job everywhere. Moved from the Washington
 * parser at the state-law extraction.
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
