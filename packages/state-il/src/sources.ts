import type { IlCode, IlDomain } from './schema.js';

/**
 * The Illinois manifest (kickoff §2, §3.3): 88 sections on ilga.gov,
 * captured at the site's own requested 10 s crawl delay (its robots.txt
 * ALLOWS the crawl — decision 1) as 23 fetch units: twelve whole-act pages,
 * six article-range pages of the Insurance Code and the Vehicle Code (the
 * two codes too large for one page; ranges are the site's own opaque
 * sequence numbers, read from the act page's links), and five whole-Part
 * Administrative Code pages.
 *
 * Every entry carries a manifest HEADING: Illinois prints a catchline on
 * most sections but not all (155.29 opens with "(a) Purpose."; 770 ILCS
 * 45/1 opens with its own text), and the schema requires a heading, so the
 * manifest's descriptor is the fallback and `headingSource` records which
 * one a section carries.
 */
export interface IlCiteEntry {
  /** "15", "154.6", "3-117.1", "919.80", "919.EXHIBIT A" — the part after the slash (ILCS) or the section number (Adm. Code). */
  section: string;
  domain: IlDomain;
  /** The fallback catchline when the page prints none. */
  heading: string;
  note?: string;
}
export interface IlActSource {
  kind: 'act';
  actId: number;
  chapterId: number;
  /** "815 ILCS 308" — the chapter value every section carries. */
  chapter: string;
  /** "Automotive Collision Repair Act" — the chapterTitle. */
  actName: string;
  sections: readonly IlCiteEntry[];
}
export interface IlArticleSource {
  kind: 'article';
  actId: number;
  chapterId: number;
  chapter: string;
  actName: string;
  /** "Article IX - Provisions Applicable To All Companies" — as the act page prints it. */
  articleName: string;
  seqStart: number;
  seqEnd: number;
  sections: readonly IlCiteEntry[];
}
export interface IlPartSource {
  kind: 'part';
  /** "50" */
  title: string;
  /** "919" */
  part: string;
  /** "05000919" — the EntirePart key. */
  titlePart: string;
  /** "Improper Claims Practice" — the chapterTitle. */
  partTitle: string;
  sections: readonly IlCiteEntry[];
}
export type IlSource = IlActSource | IlArticleSource | IlPartSource;

export const ILGA_BASE = 'https://www.ilga.gov';
/** ilga.gov's own robots.txt asks every agent for Crawl-delay: 10 (verified 2026-09-15). Do not lower. */
export const IL_MIN_DELAY_MS = 10_000;

export function ilcsCite(chapter: string, section: string): string {
  return `${chapter}/${section}`;
}
export function iacCite(title: string, section: string): string {
  return `${title} Ill. Adm. Code ${section}`;
}
export function partChapter(title: string, part: string): string {
  return `${title} Ill. Adm. Code ${part}`;
}

export function actUrl(src: IlActSource | IlArticleSource): string {
  return `${ILGA_BASE}/Legislation/ILCS/Articles?ActID=${src.actId}&ChapterID=${src.chapterId}`;
}
export function articleUrl(src: IlArticleSource): string {
  return `${ILGA_BASE}/legislation/ILCS/details?ActID=${src.actId}&ChapterID=${src.chapterId}&SeqStart=${src.seqStart}&SeqEnd=${src.seqEnd}`;
}
export function partUrl(src: IlPartSource): string {
  return `${ILGA_BASE}/agencies/JCAR/EntirePart?titlepart=${src.titlePart}`;
}
export function unitUrl(src: IlSource): string {
  if (src.kind === 'act') return actUrl(src);
  if (src.kind === 'article') return articleUrl(src);
  return partUrl(src);
}
export function rawName(src: IlSource): string {
  if (src.kind === 'act') return `il-act-${src.actId}.html`;
  if (src.kind === 'article') return `il-art-${src.actId}-${src.seqStart}.html`;
  return `il-part-${src.titlePart}.html`;
}

const ins = (section: string, heading: string, note?: string): IlCiteEntry => ({ section, domain: 'insurance', heading, ...(note ? { note } : {}) });
const rep = (section: string, heading: string, note?: string): IlCiteEntry => ({ section, domain: 'repair_law', heading, ...(note ? { note } : {}) });
const emp = (section: string, heading: string, note?: string): IlCiteEntry => ({ section, domain: 'employment', heading, ...(note ? { note } : {}) });
const saf = (section: string, heading: string, note?: string): IlCiteEntry => ({ section, domain: 'safety', heading, ...(note ? { note } : {}) });

const INSURANCE_CODE = { actId: 1249, chapterId: 22, chapter: '215 ILCS 5', actName: 'Illinois Insurance Code' } as const;
const VEHICLE_CODE = { actId: 1815, chapterId: 49, chapter: '625 ILCS 5', actName: 'Illinois Vehicle Code' } as const;

export const IL_SOURCES: readonly IlSource[] = [
  // --- article-range pages (6) ---
  { kind: 'article', ...INSURANCE_CODE, articleName: 'Article IX - Provisions Applicable To All Companies', seqStart: 51000000, seqEnd: 67200000, sections: [
    ins('143.13', 'Definition of terms used in Sections 143.11 through 143.24.', 'defines "policy of automobile insurance", the scope 50 Ill. Adm. Code 919.40 borrows'),
    ins('154.5', 'Improper claims practices', 'knowingly, or with such frequency as to indicate a persistent tendency'),
    ins('154.6', 'Acts constituting improper claims practice.', '(j) unreasonable caps or limits on paint or materials; (p)/(q) repairer licensing; no private right of action'),
    ins('154.7', 'Statement of charges', "the Director's proceeding"),
    ins('154.8', 'Cease and desist order; suspension of certificate; civil penalty; judicial review.'),
    ins('154.9', 'Payment of applicable use or occupation tax, title, and transfer fees on a private passenger total loss claim.'),
    ins('154.10', 'Description of the determination of a total loss of a vehicle.', 'policies issued or renewed on or after 7/1/2025'),
    ins('155', 'Attorney fees.', 'the vexatious and unreasonable delay remedy — first-party, capped; no common-law bad faith tort (Cramer)'),
    ins('155.29', 'Aftermarket crash parts', 'no printed catchline; insurer AND repair facility must disclose non-OEM crash parts in writing'),
  ] },
  { kind: 'article', ...INSURANCE_CODE, articleName: 'Article XXVI - Unfair Methods Of Competition And Unfair And Deceptive Acts And Practices', seqStart: 132300000, seqEnd: 133900000, sections: [
    ins('424', 'Unfair methods of competition and unfair or deceptive acts or practices defined.', '(4) incorporates 154.5 through 154.8'),
  ] },
  { kind: 'article', ...VEHICLE_CODE, articleName: 'Chapter 1 - Title And Definitions', seqStart: 100000, seqEnd: 34800000, sections: [
    rep('1-171.3', 'Repairer.', 'the definition 5-301 licenses'),
  ] },
  { kind: 'article', ...VEHICLE_CODE, articleName: 'Chapter 3 Article I - Certificates of Title', seqStart: 38600000, seqEnd: 42200000, sections: [
    rep('3-117.1', 'When junking certificates or salvage certificates must be obtained.', '(b)(1): the insurer that pays a total loss is deemed the owner and applies within 20 days; the 9-model-year and hail-only retention rule'),
  ] },
  { kind: 'article', ...VEHICLE_CODE, articleName: 'Chapter 4 Article II - Abandoned, Lost, Stolen Or Unclaimed Vehicles', seqStart: 75500000, seqEnd: 77700000, sections: [
    rep('4-201', 'Abandonment of vehicles prohibited.', '(b): abandonment on private property is unlawful except on the bailee\'s own property'),
    rep('4-214', 'Violations of Section 4-201.', "(b): the last registered owner owes towing and storage after a tow, capped at 30 days' storage"),
  ] },
  { kind: 'article', ...VEHICLE_CODE, articleName: 'Chapter 5 Article III - Used Part Dealers, Scrap Processors, Automotive Parts Recyclers and Rebuilders', seqStart: 81500000, seqEnd: 81800000, sections: [
    rep('5-301', 'Automotive parts recyclers, scrap processors, repairers and rebuilders must be licensed.', 'Illinois licenses repairers'),
  ] },
  // --- whole-act pages (12) ---
  { kind: 'act', actId: 2500, chapterId: 67, chapter: '815 ILCS 308', actName: 'Automotive Collision Repair Act', sections: [
    rep('5', 'Purpose.'), rep('10', 'Definitions.', 'new, used, rebuilt/reconditioned, aftermarket'),
    rep('15', 'Disclosure to consumers; estimates.', 'no work over $100 without authorization; the 10 percent rule; storage and administrative fees on the estimate; teardown cost'),
    rep('20', "Notice of consumer's rights; estimate."), rep('25', 'Estimated price insufficient.'),
    rep('30', 'Consumers authorizations of repairs or other actions.', 'return of the removed parts; 3 working days'),
    rep('35', 'Inability to deliver motor vehicle to facility during business hours.'),
    rep('40', 'Disclosures to consumers; invoices.'), rep('45', 'Consumer disclosures; guarantees; warranties.'),
    rep('50', 'Consumer disclosures; required signs.'), rep('55', 'Recordkeeping.'),
    rep('60', 'Removal of motor vehicle from facility.', 'posted storage and administrative charges'),
    rep('65', 'Lien barred.'), rep('70', 'Unlawful acts or practices.', '(11) a pattern of underestimating'),
    rep('75', 'Violations.', 'a knowing, persistent pattern is a Consumer Fraud Act violation'),
    rep('80', 'Exemptions.', 'does not apply to facilities covered by the Automotive Repair Act'),
  ] },
  { kind: 'act', actId: 2324, chapterId: 67, chapter: '815 ILCS 306', actName: 'Automotive Repair Act', sections: [
    rep('10', 'Definitions.'), rep('15', 'Disclosures to consumers; estimates.'), rep('70', 'Removal of vehicle from facility.'),
    rep('75', 'Lien barred.'), rep('80', 'Unlawful acts or practices.'),
    rep('83', 'Exemptions.', 'does NOT apply to automotive collision and body repair facilities — captured so the boundary is stated in the law\'s own words'),
    rep('85', 'Violations.'),
  ] },
  { kind: 'act', actId: 2356, chapterId: 67, chapter: '815 ILCS 505', actName: 'Consumer Fraud and Deceptive Business Practices Act', sections: [
    rep('2', 'Unlawful practices', 'no printed catchline'), rep('10a', 'Action for actual damages.', 'the private action; three-year limitations'),
  ] },
  { kind: 'act', actId: 2251, chapterId: 63, chapter: '770 ILCS 45', actName: 'Labor and Storage Lien Act', sections: [
    rep('1', 'Lien for labor, skill, materials, or storage', 'no printed catchline'),
    rep('1.5', 'Storage fees; notice to lienholder of record.', 'certified notice BEFORE storage fees accrue, or the fees are forfeited'),
    rep('2', 'Lien notice filed within 60 days of delivery', 'no printed catchline'),
  ] },
  { kind: 'act', actId: 2252, chapterId: 63, chapter: '770 ILCS 50', actName: 'Labor and Storage Lien (Small Amount) Act', sections: [
    rep('1', 'Lien for $2,000 or less', 'no printed catchline'),
    rep('1.5', 'Storage fees; notice to lienholder of record.'),
    rep('2', 'Enforcement by sale after 90 days', 'no printed catchline'),
    rep('3', "Notice of sale; 30 days' publication and certified mail", 'no printed catchline'),
  ] },
  { kind: 'act', actId: 2402, chapterId: 68, chapter: '820 ILCS 115', actName: 'Illinois Wage Payment and Collection Act', sections: [
    emp('2', 'Definitions.'), emp('3', 'Semi-monthly payment of wages', 'no printed catchline'),
    emp('4', 'Time of payment', 'no printed catchline; 13 days after a semi-monthly period, 7 after a weekly one'),
    emp('5', 'Final compensation', 'no printed catchline; next regular payday; earned vacation paid, no forfeiture'),
    emp('9', 'Deductions from wages or final compensation', 'no printed catchline; DUAL-PRINTED (P.A. 104-457 eff. 6/1/2026); express written consent given freely at the time of the deduction'),
    emp('9.5', 'Reimbursement of employee expenses.'), emp('14', 'Penalties.'),
  ] },
  { kind: 'act', actId: 2400, chapterId: 68, chapter: '820 ILCS 105', actName: 'Minimum Wage Law', sections: [
    emp('3', 'Definitions', 'DUAL-PRINTED "from" P.A. 104-480 and P.A. 104-525'),
    emp('4', 'Minimum wage rates', 'no printed catchline; $15 since 1/1/2025'),
    emp('4a', 'Overtime', 'no printed catchline; the (2)(A) mechanic exemption is dealership-only'),
    emp('12', 'Remedies', 'no printed catchline; treble damages plus 5 percent a month'),
  ] },
  { kind: 'act', actId: 2407, chapterId: 68, chapter: '820 ILCS 140', actName: 'One Day Rest In Seven Act', sections: [
    emp('2', 'Hours and days of rest in every consecutive seven-day period.'),
    emp('3', 'Meal periods', 'no printed catchline; 20 minutes within the first 5 hours of a 7 1/2-hour shift'),
    emp('7', 'Civil offense.'),
  ] },
  { kind: 'act', actId: 4351, chapterId: 68, chapter: '820 ILCS 192', actName: 'Paid Leave for All Workers Act', sections: [
    emp('15', 'Provision of paid leave.', '40 hours a year at one hour per 40 worked'),
  ] },
  { kind: 'act', actId: 3737, chapterId: 68, chapter: '820 ILCS 90', actName: 'Illinois Freedom to Work Act', sections: [
    emp('10', 'Prohibiting covenants not to compete and covenants not to solicit.', 'no non-compete under $75,000 a year'),
  ] },
  { kind: 'act', actId: 2430, chapterId: 68, chapter: '820 ILCS 305', actName: "Workers' Compensation Act", sections: [
    emp('4', 'Insurance and self-insurance; penalties for noncompliance', 'no printed catchline; DUAL-PRINTED "from" sets; 62 KB'),
  ] },
  { kind: 'act', actId: 3572, chapterId: 68, chapter: '820 ILCS 219', actName: 'Occupational Safety and Health Act', sections: [
    emp('15', 'Application of Act.', 'public employers only — captured so the absence is stated in the law\'s own words'),
  ] },
  // --- whole-Part pages (5) ---
  { kind: 'part', title: '50', part: '919', titlePart: '05000919', partTitle: 'Improper Claims Practice', sections: [
    ins('919.40', 'Definitions/Explanations', 'Prompt Investigation = 21 working days; the Notice of Availability'),
    ins('919.50', 'Required Practices for all Insurance Companies', '30 days to pay; the written explanation of a denial'),
    ins('919.60', 'Improper Practices or Procedures for all Insurance Companies'),
    ins('919.80', 'Required Claim Practices - Private Passenger Automobile - Property and Casualty Companies', 'the headliner: (b) 40-day delay, (c) total loss, (d) travel, storage/towing, betterment, crash parts, repairs'),
    ins('919.90', 'Improper Practices or Procedures - Property and Casualty Companies', '(e) no abandoning salvage to a storage yard in lieu of charges'),
    ins('919.EXHIBIT A', 'Total Loss Automobile Claims', 'the consumer notice the insurer hands over within 7 days'),
  ] },
  { kind: 'part', title: '56', part: '300', titlePart: '05600300', partTitle: 'Payment and Collection of Wages or Final Compensation', sections: [
    emp('300.600', 'Payment of Wages'), emp('300.720', 'Written Agreement Authorizing Deductions', 'a standing agreement lasts at most six months'),
    emp('300.820', 'Damaged Property', 'the comeback-chargeback answer'), emp('300.850', 'Equipment Required by an Employer', 'the tool-purchase answer'),
  ] },
  { kind: 'part', title: '56', part: '210', titlePart: '05600210', partTitle: 'Minimum Wage Law', sections: [
    emp('210.440', 'Overtime - General', 'no Source line — inherits the Part adoption date'),
  ] },
  { kind: 'part', title: '35', part: '218', titlePart: '03500218', partTitle: 'Organic Material Emission Standards and Limitations for the Chicago Area', sections: [
    saf('218.103', 'Applicability', 'Cook, DuPage, Kane, Lake, McHenry, Will, and three townships in Grundy and Kendall'),
    saf('218.780', 'Emission Limitations', 'VOM limits per coating category; the equations print as images the text does not carry'),
    saf('218.782', 'Alternative Control Requirements'), saf('218.784', 'Equipment Specifications', 'HVLP or electrostatic; enclosed gun cleaners'),
    saf('218.786', 'Surface Preparation Materials'), saf('218.787', 'Work Practices'),
  ] },
  { kind: 'part', title: '35', part: '219', titlePart: '03500219', partTitle: 'Organic Material Emission Standards and Limitations for the Metro East Area', sections: [
    saf('219.103', 'Applicability', 'Madison, Monroe, and St. Clair Counties; no Source line — inherits the Part adoption date'),
    saf('219.780', 'Emission Limitations'), saf('219.782', 'Alternative Control Requirements'), saf('219.784', 'Equipment Specifications'),
    saf('219.786', 'Surface Preparation Materials'), saf('219.787', 'Work Practices'),
  ] },
];

export interface IlManifestCite {
  code: IlCode;
  cite: string;
  chapter: string;
  chapterTitle: string;
  domain: IlDomain;
  heading: string;
  captureSource: 'act' | 'article' | 'part';
}

/** Every manifest cite with its code, chapter, domain, and fallback heading — the identity and taxonomy layers build from this. */
export function manifestCites(): IlManifestCite[] {
  const out: IlManifestCite[] = [];
  for (const s of IL_SOURCES) {
    if (s.kind === 'part') {
      for (const x of s.sections) out.push({ code: 'Ill. Adm. Code', cite: iacCite(s.title, x.section), chapter: partChapter(s.title, s.part), chapterTitle: s.partTitle, domain: x.domain, heading: x.heading, captureSource: 'part' });
    } else {
      for (const x of s.sections) out.push({ code: 'ILCS', cite: ilcsCite(s.chapter, x.section), chapter: s.chapter, chapterTitle: s.actName, domain: x.domain, heading: x.heading, captureSource: s.kind });
    }
  }
  return out;
}
