import type { FlDomain } from './schema.js';

/**
 * The Florida Administrative Code half of the manifest: which rules to
 * capture from the Department of State's flrules.org. Two tiers (kickoff
 * §3.2): the chapter page lists every rule with its title, effective date,
 * and the Word-document download whose `tid` (the adopting notice id) is
 * the version key; the rule card states the effective date and the full
 * "Rulemaking Authority … History …" line in HTML; the document itself is
 * Word 97 binary read by word-extractor (doc-text.ts, dynamic import).
 *
 * robots.txt blocks ten specific notice URLs, none relevant, and states no
 * crawl delay; the io-wide 2 s pause applies.
 */
export interface FlFacRuleSpec {
  /** "69B-220.201" */
  cite: string;
}

export interface FlFacCaptureSource {
  /** "69O-166" — the chapter page's id and StateSection.chapter. */
  chapter: string;
  chapterTitle: string;
  domain: FlDomain;
  rules: readonly FlFacRuleSpec[];
  note?: string;
}

export const FLRULES_BASE = 'https://www.flrules.org';

export function facChapterUrl(chapter: string): string {
  return `${FLRULES_BASE}/gateway/ChapterHome.asp?Chapter=${chapter}`;
}

/** The rule card — the human landing page and the citation link (sourceUrl). */
export function facRuleCardUrl(cite: string): string {
  return `${FLRULES_BASE}/gateway/ruleNo.asp?id=${cite}`;
}

export const FL_FAC_SOURCES: readonly FlFacCaptureSource[] = [
  {
    chapter: '69O-166',
    chapterTitle: 'Property and Casualty Insurer Practices (Office of Insurance Regulation)',
    domain: 'insurance',
    rules: [{ cite: '69O-166.021' }, { cite: '69O-166.024' }],
    note: '69O-166.024 is the prompt-acknowledgment and prompt-investigation standard for property and casualty claims. 69O-166.031 (mediation) is property insurance only and out of scope.',
  },
  {
    chapter: '69B-220',
    chapterTitle: 'Adjusters (Department of Financial Services)',
    domain: 'insurance',
    rules: [{ cite: '69B-220.201' }],
    note: 'The code of ethics 626.878 makes binding on every adjuster: (3)(a) no steering for consideration, (3)(b)2 adjust strictly per the contract, (3)(b)6 no undisclosed financial interest. Its 2025 (3)(m) estimate-of-loss rules apply ONLY to residential coverage under 627.4025(1) — stated, never implied for auto. 69B-220.051 is public adjusters only.',
  },
];
