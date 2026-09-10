/**
 * Regulation 64 on the LII mirror (kickoff preface, decision 1). The 13
 * live sections of Part 216; 216.13 (Mediation) is repealed on the mirror
 * and deliberately absent. The part index page is fetched first and
 * cross-checked: every manifest cite must be listed, and every listed
 * cite that is NOT repealed must be in the manifest — a new section
 * appearing upstream fails the capture until a human adds it.
 * robots.txt: Crawl-delay 10, enforced through minDelayMs.
 */
export interface NyReg64Source {
  code: '11 NYCRR';
  title: '11';
  chapterRoman: 'IX';
  part: '216';
  chapter: string;
  chapterTitle: string;
  domain: 'insurance';
  cites: readonly string[];
  /** The part index page's own title must contain this. */
  expectPartTitle: string;
}

export const LII_NYCRR_BASE = 'https://www.law.cornell.edu/regulations/new-york';
export const LII_NYCRR_CRAWL_DELAY_MS = 10_000;

export function liiNycrrSectionUrl(title: string, cite: string): string {
  return `${LII_NYCRR_BASE}/${title}-NYCRR-${cite}`;
}
export function liiNycrrPartUrl(title: string, chapterRoman: string, part: string): string {
  return `${LII_NYCRR_BASE}/title-${title}/chapter-${chapterRoman}/part-${part}`;
}

export const NY_REG64_SOURCE: NyReg64Source = {
  code: '11 NYCRR',
  title: '11',
  chapterRoman: 'IX',
  part: '216',
  chapter: 'Part 216',
  chapterTitle: 'Unfair Claims Settlement Practices and Claim Cost Control Measures (Regulation 64)',
  domain: 'insurance',
  cites: ['216.0', '216.1', '216.2', '216.3', '216.4', '216.5', '216.6', '216.7', '216.8', '216.9', '216.10', '216.11', '216.12'],
  expectPartTitle: 'Unfair Claims Settlement Practices',
};
