import type { OhCode, OhDomain } from './schema.js';

/**
 * The Ohio manifest (kickoff §2, §3.3): 51 sections on codes.ohio.gov,
 * captured as ten whole-chapter pages (where two or more manifest sections
 * share a chapter) and eight single-section pages, at the project owner's
 * 10 s floor against the site's blanket robots Disallow (2026-09-14). Every
 * chapter page carries every section's full text with its own Effective
 * date — verified byte-identical to the section page for 3901.21.
 *
 * Domains are per CITE, not per chapter: chapter 4505 holds the salvage
 * title section (insurance) and the unclaimed-vehicle pair (repair_law);
 * chapter 1345 holds the aftermarket crash parts section (insurance) and
 * the Consumer Sales Practices Act (repair_law).
 */
export interface OhCiteEntry {
  cite: string;
  domain: OhDomain;
  note?: string;
}
export interface OhChapterSource {
  kind: 'chapter';
  code: 'ORC' | 'OAC';
  /** "3901", "3901-1", "109:4-3", "4123:1-5" — the chapter value every section carries. */
  chapter: string;
  sections: readonly OhCiteEntry[];
}
export interface OhSectionSource {
  kind: 'section';
  code: OhCode;
  cite: string;
  /** The chapter value the section carries ("1343", "3745-31", "art. II"). */
  chapter: string;
  domain: OhDomain;
  note?: string;
}
export type OhSource = OhChapterSource | OhSectionSource;

export const CODES_BASE = 'https://codes.ohio.gov';
/** The project owner's floor for codes.ohio.gov (2026-09-14). Do not lower. */
export const OH_MIN_DELAY_MS = 10_000;
/** The one Constitution cite, as the corpus spells it. Its URL slug is "2.34a". */
export const OH_CONST_CITE = 'art. II, § 34a';
const CONST_SLUGS: Readonly<Record<string, string>> = { [OH_CONST_CITE]: '2.34a' };

const PATHS: Record<OhCode, { section: string; chapter: string; raw: string; rawSection: string }> = {
  ORC: { section: 'ohio-revised-code/section-', chapter: 'ohio-revised-code/chapter-', raw: 'oh-orc-ch', rawSection: 'oh-orc-s' },
  OAC: { section: 'ohio-administrative-code/rule-', chapter: 'ohio-administrative-code/chapter-', raw: 'oh-oac-ch', rawSection: 'oh-oac-r' },
  'Ohio Const.': { section: 'ohio-constitution/section-', chapter: 'ohio-constitution/article-', raw: 'oh-const-ch', rawSection: 'oh-const-s' },
};

function slug(code: OhCode, cite: string): string {
  if (code === 'Ohio Const.') {
    const s = CONST_SLUGS[cite];
    if (!s) throw new Error(`No URL slug for Constitution cite "${cite}" — add it to CONST_SLUGS.`);
    return s;
  }
  return cite;
}

export function sectionUrl(code: OhCode, cite: string): string {
  return `${CODES_BASE}/${PATHS[code].section}${slug(code, cite)}`;
}
export function chapterUrl(code: 'ORC' | 'OAC', chapter: string): string {
  return `${CODES_BASE}/${PATHS[code].chapter}${chapter}`;
}
/** Windows file names cannot carry a colon: "109:4-3" → "109_4-3". */
export function chapterRawName(code: 'ORC' | 'OAC', chapter: string): string {
  return `${PATHS[code].raw}${chapter.replaceAll(':', '_')}.html`;
}
export function sectionRawName(code: OhCode, cite: string): string {
  return `${PATHS[code].rawSection}${slug(code, cite).replaceAll(':', '_')}.html`;
}

const ins = (cite: string, note?: string): OhCiteEntry => ({ cite, domain: 'insurance', ...(note ? { note } : {}) });
const rep = (cite: string, note?: string): OhCiteEntry => ({ cite, domain: 'repair_law', ...(note ? { note } : {}) });
const emp = (cite: string, note?: string): OhCiteEntry => ({ cite, domain: 'employment', ...(note ? { note } : {}) });
const saf = (cite: string, note?: string): OhCiteEntry => ({ cite, domain: 'safety', ...(note ? { note } : {}) });

export const OH_SOURCES: readonly OhSource[] = [
  // --- ORC chapter pages (7) ---
  { kind: 'chapter', code: 'ORC', chapter: '3901', sections: [
    ins('3901.19'), ins('3901.20'),
    ins('3901.21', 'the catalog is mostly rating and underwriting; (P) no pattern settlements is the one claims item; no private right of action'),
    ins('3901.22', "the Superintendent's remedies and the AG's class action — the statutory enforcement, not a private one"),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '1345', sections: [
    rep('1345.01'), rep('1345.02'), rep('1345.03'), rep('1345.09', 'treble damages or $200, $5,000 noneconomic, fees'), rep('1345.13'),
    ins('1345.81', 'aftermarket crash parts: the estimate notice, the signature, the maker\'s mark; a violation is a CSPA practice'),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '4505', sections: [
    ins('4505.11', 'salvage title within thirty business days when the insurer declares repair economically impractical'),
    rep('4505.101', 'the repair garage title route under $3,500 after fifteen days plus fifteen days of notice'),
    rep('4505.104', 'the towing/storage facility route for vehicles ordered into storage under 4513.60/.61/.66'),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '4513', sections: [
    rep('4513.60', "a repair garage's complaint lets the sheriff order the car into storage; carries the veto statusNote"),
    rep('4513.601'), rep('4513.61', 'carries the veto statusNote'), rep('4513.62'), rep('4513.63'),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '4111', sections: [
    emp('4111.01'), emp('4111.02'), emp('4111.03'), emp('4111.031'), emp('4111.08'), emp('4111.10'), emp('4111.14'),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '4113', sections: [
    emp('4113.15', 'semimonthly pay; 6 percent or $200 liquidated damages after thirty days'),
    emp('4113.19', 'no deduction for damaged tools without an express contract'),
  ] },
  { kind: 'chapter', code: 'ORC', chapter: '4123', sections: [
    emp('4123.01', 'the twenty-factor test in (A)(1)(c) is scoped to construction contracts'),
    emp('4123.35'), emp('4123.74'), emp('4123.75'), emp('4123.77'), emp('4123.90'),
  ] },
  // --- ORC section pages (5) ---
  { kind: 'section', code: 'ORC', cite: '1343.03', chapter: '1343', domain: 'insurance', note: 'the general statutory interest rate (via 5703.47) — not a claims prompt-pay statute' },
  { kind: 'section', code: 'ORC', cite: '1333.41', chapter: '1333', domain: 'repair_law', note: 'division (E) excludes motor vehicles from the bailee\'s lien — captured so the absence is stated in the law\'s own words' },
  { kind: 'section', code: 'ORC', cite: '4738.01', chapter: '4738', domain: 'repair_law', note: 'salvage dealer definitions — a repair shop is not one; Ohio licenses no body shops' },
  { kind: 'section', code: 'ORC', cite: '4109.07', chapter: '4109', domain: 'employment', note: 'the thirty-minute rest after five hours is for MINORS; Ohio has no adult break law' },
  { kind: 'section', code: 'ORC', cite: '4121.47', chapter: '4121', domain: 'safety', note: 'the VSSR statute' },
  // --- Constitution (1) ---
  { kind: 'section', code: 'Ohio Const.', cite: OH_CONST_CITE, chapter: 'art. II', domain: 'employment', note: 'the indexed minimum wage' },
  // --- OAC chapter pages (3) ---
  { kind: 'chapter', code: 'OAC', chapter: '3901-1', sections: [
    ins('3901-1-07', 'the general unfair claims practices companion'),
    ins('3901-1-54', 'the headliner: (H)(1) pay the difference or name a shop; (H)(8) no unreasonable travel; (H)(9) storage notice'),
  ] },
  { kind: 'chapter', code: 'OAC', chapter: '109:4-3', sections: [
    rep('109:4-3-01'), rep('109:4-3-13', 'the AG\'s motor vehicle repair rule, amended effective 3/21/2026'),
  ] },
  { kind: 'chapter', code: 'OAC', chapter: '4123:1-5', sections: [
    saf('4123:1-5-01'), saf('4123:1-5-12'), saf('4123:1-5-13'), saf('4123:1-5-16'), saf('4123:1-5-17'), saf('4123:1-5-18'),
  ] },
  // --- OAC rule pages (2) ---
  { kind: 'section', code: 'OAC', cite: '3745-31-30', chapter: '3745-31', domain: 'safety', note: 'omnibus permit-by-rule; (C)(2)(f) is auto body refinishing' },
  { kind: 'section', code: 'OAC', cite: '3745-21-18', chapter: '3745-21', domain: 'safety', note: 'applies only in sixteen named counties' },
];

/** Every manifest cite with its code, chapter, and domain — the identity and taxonomy layers build from this. */
export function manifestCites(): Array<{ code: OhCode; cite: string; chapter: string; domain: OhDomain }> {
  const out: Array<{ code: OhCode; cite: string; chapter: string; domain: OhDomain }> = [];
  for (const s of OH_SOURCES) {
    if (s.kind === 'chapter') for (const x of s.sections) out.push({ code: s.code, cite: x.cite, chapter: s.chapter, domain: x.domain });
    else out.push({ code: s.code, cite: s.cite, chapter: s.chapter, domain: s.domain });
  }
  return out;
}
