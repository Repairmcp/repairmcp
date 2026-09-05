import type { CaCode, CaDomain } from './schema.js';

/**
 * The statutes half of the California capture manifest: what to fetch from
 * leginfo.legislature.ca.gov and which sections to keep. Each entry is one
 * TEXT VIEW (an article or chapter — codes_displayText.xhtml with the
 * hierarchy parameters leginfo's own links carry), fetched once, with the
 * wanted sections selected out of it by cite; a named cite absent from the
 * view hard-fails at capture. The hierarchy parameters were read off each
 * section's own page headers 2026-09-04 (the DIVISION / PART / CHAPTER /
 * ARTICLE lines with bracketed ranges), and `expectHeader` pins the header
 * line the fetched view must print — a renumbered article fails loudly.
 *
 * California codes print NO catchlines, so every `heading` here is an
 * editorial descriptor (schema.ts: headingSource 'manifest'). It labels the
 * citation long form and helps the model route; it is never source text and
 * nothing quotes it. Descriptors were checked against the captured text.
 *
 * The site's robots.txt disallows all agents with a 10-second crawl delay;
 * the project owner decided 2026-09-04 to fetch politely at that delay (the
 * Legislature is the official publisher of public-record text, the volume
 * is ~20 views every four weeks, and the bot names itself). capture.ts
 * enforces the delay; do not lower it.
 */
export interface CaStatuteSectionSpec {
  cite: string;
  /** Editorial descriptor — see the module comment. */
  heading: string;
}

export interface CaStatuteCaptureSource {
  code: CaCode;
  /** leginfo's lawCode parameter: INS, BPC, LAB, VEH, CIV. */
  lawCode: 'INS' | 'BPC' | 'LAB' | 'VEH' | 'CIV';
  /** codes_displayText.xhtml hierarchy parameters, as leginfo's links carry them (with trailing dots). */
  view: { division: string; title: string; part: string; chapter: string; article: string };
  /** A header line the fetched view must print (prefix match, case-sensitive). */
  expectHeader: string;
  /** Becomes StateSection.chapter — reads naturally after the word "chapter". */
  chapter: string;
  chapterTitle: string;
  domain: CaDomain;
  sections: readonly CaStatuteSectionSpec[];
  note?: string;
}

export const LEGINFO_BASE = 'https://leginfo.legislature.ca.gov/faces';

export function leginfoTextViewUrl(source: CaStatuteCaptureSource): string {
  const v = source.view;
  return (
    `${LEGINFO_BASE}/codes_displayText.xhtml?lawCode=${source.lawCode}` +
    `&division=${v.division}&title=${v.title}&part=${v.part}&chapter=${v.chapter}&article=${v.article}`
  );
}

/** The human landing page for one section — becomes sourceUrl. */
export function leginfoSectionUrl(lawCode: string, cite: string): string {
  return `${LEGINFO_BASE}/codes_displaySection.xhtml?lawCode=${lawCode}&sectionNum=${cite}.`;
}

export const CA_STATUTE_SOURCES: readonly CaStatuteCaptureSource[] = [
  {
    code: 'Cal. Ins. Code', lawCode: 'INS',
    view: { division: '1.', title: '', part: '2.', chapter: '1.', article: '5.1.' },
    expectHeader: 'ARTICLE 5.1. Unlawful Practices',
    chapter: '1, art. 5.1 (Div. 1, Pt. 2)', chapterTitle: 'Unlawful Practices', domain: 'insurance',
    sections: [
      { cite: '758', heading: 'Direct repair programs: no shifting the insured\'s rental or towing costs to the shop; DRP denials reportable to the Department; auto body labor rate survey results must be reported with shop names and counts' },
      { cite: '758.5', heading: 'Choice of automotive repair dealer: no required or steered shop; written notice of the right to choose; restoration to pre-loss condition when the insurer\'s recommendation is accepted' },
      { cite: '758.6', heading: 'Paint and materials: insurer may not pay an amount unrelated to an accepted paint and materials methodology (anti-capping)' },
    ],
    note: '758.5 is the anti-steering headliner; 758.6 the paint-and-materials cap prohibition no other shipped state has.',
  },
  {
    code: 'Cal. Ins. Code', lawCode: 'INS',
    view: { division: '1.', title: '', part: '2.', chapter: '1.', article: '6.5.' },
    expectHeader: 'ARTICLE 6.5. Unfair Practices',
    chapter: '1, art. 6.5 (Div. 1, Pt. 2)', chapterTitle: 'Unfair Practices', domain: 'insurance',
    sections: [
      { cite: '790.03', heading: 'Unfair methods of competition and unfair or deceptive acts; subdivision (h) unfair claims settlement practices' },
      { cite: '790.035', heading: 'Civil penalties for unfair practices' },
    ],
    note: 'No private right of action (Moradi-Shalal v. Fireman\'s Fund, 1988) — the Department enforces 790.03(h). Annotation content, not a reason to skip.',
  },
  {
    code: 'Cal. Ins. Code', lawCode: 'INS',
    view: { division: '1.', title: '', part: '2.', chapter: '12.', article: '4.5.' },
    expectHeader: 'ARTICLE 4.5. Insurer Inspections',
    chapter: '12, art. 4.5 (Div. 1, Pt. 2)', chapterTitle: 'Insurer Inspections (Insurance Frauds Prevention Act)', domain: 'insurance',
    sections: [
      { cite: '1874.85', heading: 'Insurer inspections of a statistical sample of auto body repairs it paid for' },
      { cite: '1874.86', heading: 'Annual report of auto body repair inspections to the Commissioner' },
      { cite: '1874.87', heading: 'Auto Body Repair Consumer Bill of Rights: insurers must provide it' },
    ],
  },
  {
    code: 'Cal. Bus. & Prof. Code', lawCode: 'BPC',
    view: { division: '3.', title: '', part: '', chapter: '20.1.', article: '' },
    expectHeader: 'CHAPTER 20.1. Motor Vehicle Replacement Parts',
    chapter: '20.1 (Div. 3)', chapterTitle: 'Motor Vehicle Replacement Parts', domain: 'repair_law',
    sections: [
      { cite: '9875', heading: 'Aftermarket crash parts: definitions' },
      { cite: '9875.1', heading: 'Insurer may not require non-OEM aftermarket crash parts unless the consumer is advised in a written estimate; the parts must be identified' },
      { cite: '9875.2', heading: 'Violations of the crash parts chapter are enforced under the Insurance Code penalties' },
    ],
    note: 'The non-OEM crash-part disclosure duty lives here, not in the Automotive Repair Act; 10 CCR 2695.8(g) cross-references it.',
  },
  {
    code: 'Cal. Bus. & Prof. Code', lawCode: 'BPC',
    view: { division: '3.', title: '', part: '', chapter: '20.3.', article: '' },
    expectHeader: 'CHAPTER 20.3. Automotive Repair',
    chapter: '20.3 (Div. 3)', chapterTitle: 'Automotive Repair (the Automotive Repair Act)', domain: 'repair_law',
    sections: [
      { cite: '9880.1', heading: 'Definitions: automotive repair dealer, customer, repair, motor vehicle' },
      { cite: '9884', heading: 'Registration with the Bureau required for every place of business' },
      { cite: '9884.7', heading: 'Grounds for discipline: untrue or misleading statements, fraud, gross negligence, departure from accepted trade standards, unauthorized work' },
      { cite: '9884.8', heading: 'Invoice requirements: parts and labor itemized; used, rebuilt, and non-OEM crash parts disclosed' },
      { cite: '9884.9', heading: 'Written estimate before work; no charge beyond the estimate without the customer\'s consent; additional authorization; teardown estimates; auto body parts disclosure' },
      { cite: '9884.10', heading: 'Return of replaced parts on request' },
      { cite: '9884.11', heading: 'Records retained three years and open to inspection' },
      { cite: '9884.16', heading: 'Unregistered repair dealer may not assert a lien, charge storage, or sue on the repair' },
      { cite: '9884.17', heading: 'Customer-rights sign required at every registered location' },
      { cite: '9884.19', heading: 'Bureau regulations against fraud and misleading advertising' },
      { cite: '9889.50', heading: 'Auto body repair: legislative findings' },
      { cite: '9889.51', heading: 'Auto body repair shop defined' },
      { cite: '9889.52', heading: 'Auto body repair shops must attest to required permits (spray booth, air quality, hazardous waste) on registration' },
      { cite: '9889.53', heading: 'Insurer payments to an auto body repair shop must carry the shop\'s registration number' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '2.', title: '', part: '1.', chapter: '1.', article: '1.' },
    expectHeader: 'ARTICLE 1. General Occupations',
    chapter: '1, art. 1 (Div. 2, Pt. 1)', chapterTitle: 'Payment of Wages: General Occupations', domain: 'employment',
    sections: [
      { cite: '200', heading: 'Wages and labor defined' },
      { cite: '201', heading: 'Wages due immediately on discharge' },
      { cite: '202', heading: 'Wages due when an employee quits: within 72 hours, or immediately with 72 hours\' notice' },
      { cite: '203', heading: 'Waiting time penalty: up to 30 days of wages for willful late final pay' },
      { cite: '204', heading: 'Paydays: at least twice a month' },
      { cite: '221', heading: 'Employer may not take back wages already paid' },
      { cite: '224', heading: 'Deductions permitted only as authorized in writing or by law' },
      { cite: '226', heading: 'Itemized wage statements' },
      { cite: '226.2', heading: 'Piece-rate employees: separate pay for rest and recovery periods and other nonproductive time; itemized statement of both' },
      { cite: '226.7', heading: 'Meal, rest, and recovery periods: one extra hour of pay for each workday a period is not provided' },
    ],
    note: '226.2 is the flat-rate headliner: whether a body shop pay plan is piece-rate is a question for counsel, stated, not decided here. 226.7 prints in two versions in 2026; the capture picks by date.',
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '2.', title: '', part: '2.', chapter: '1.', article: '' },
    expectHeader: 'CHAPTER 1. General',
    chapter: '1 (Div. 2, Pt. 2)', chapterTitle: 'Working Hours: General', domain: 'employment',
    sections: [
      { cite: '510', heading: 'Overtime: time and a half past eight hours a day or 40 a week; double time past 12 hours and on the seventh day' },
      { cite: '512', heading: 'Meal periods: 30 minutes past five hours, a second past ten' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '2.', title: '', part: '4.', chapter: '1.', article: '' },
    expectHeader: 'CHAPTER 1. Wages, Hours and Working Conditions',
    chapter: '1 (Div. 2, Pt. 4)', chapterTitle: 'Wages, Hours and Working Conditions', domain: 'employment',
    sections: [
      { cite: '1194', heading: 'Employee may recover unpaid minimum wage or overtime with interest and attorney\'s fees' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '3.', title: '', part: '', chapter: '2.', article: '1.' },
    expectHeader: 'ARTICLE 1. The Contract of Employment',
    chapter: '2, art. 1 (Div. 3)', chapterTitle: 'Employer and Employee: The Contract of Employment', domain: 'employment',
    sections: [
      { cite: '2751', heading: 'Commission pay plans must be in a signed writing that states how commissions are computed and paid' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '3.', title: '', part: '', chapter: '2.', article: '2.' },
    expectHeader: 'ARTICLE 2. Obligations of Employer',
    chapter: '2, art. 2 (Div. 3)', chapterTitle: 'Employer and Employee: Obligations of Employer', domain: 'employment',
    sections: [
      { cite: '2802', heading: 'Employer must reimburse necessary business expenses (tools, uniforms, mileage, phone)' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '4.', title: '', part: '1.', chapter: '4.', article: '1.' },
    expectHeader: 'ARTICLE 1. Insurance and Security',
    chapter: '4, art. 1 (Div. 4, Pt. 1)', chapterTitle: 'Compensation Insurance and Security', domain: 'employment',
    sections: [
      { cite: '3700', heading: 'Every employer must secure workers\' compensation: insurance or a certificate of self-insurance' },
      { cite: '3706', heading: 'An uninsured employer may be sued for damages as if the workers\' compensation law did not apply' },
    ],
  },
  {
    code: 'Cal. Lab. Code', lawCode: 'LAB',
    view: { division: '5.', title: '', part: '1.', chapter: '3.', article: '' },
    expectHeader: 'CHAPTER 3. Responsibilities and Duties of Employers and Employees',
    chapter: '3 (Div. 5, Pt. 1)', chapterTitle: 'Responsibilities and Duties of Employers and Employees', domain: 'safety',
    sections: [
      { cite: '6401.7', heading: 'Injury and illness prevention program required of every employer' },
    ],
  },
  {
    code: 'Cal. Veh. Code', lawCode: 'VEH',
    view: { division: '1.', title: '', part: '', chapter: '', article: '' },
    expectHeader: 'DIVISION 1. WORDS AND PHRASES DEFINED',
    chapter: 'Div. 1', chapterTitle: 'Words and Phrases Defined', domain: 'insurance',
    sections: [
      { cite: '544', heading: 'Total loss salvage vehicle defined' },
    ],
    note: 'The honest answer to "when is it legally a total in California": there is no statutory percentage; this definition governs, and the insurer\'s duty on a total is 11515.',
  },
  {
    code: 'Cal. Veh. Code', lawCode: 'VEH',
    view: { division: '5.', title: '', part: '', chapter: '3.', article: '' },
    expectHeader: 'CHAPTER 3. Automobile Dismantlers',
    chapter: '3 (Div. 5)', chapterTitle: 'Automobile Dismantlers', domain: 'insurance',
    sections: [
      { cite: '11515', heading: 'Total loss settlements: the insurer\'s salvage certificate duties, retained salvage, and notice to the owner' },
    ],
  },
  {
    code: 'Cal. Civ. Code', lawCode: 'CIV',
    view: { division: '3.', title: '14.', part: '4.', chapter: '6.5.', article: '' },
    expectHeader: 'CHAPTER 6.5. Liens on Vehicles',
    chapter: '6.5 (Div. 3, Pt. 4, Tit. 14)', chapterTitle: 'Liens on Vehicles', domain: 'repair_law',
    sections: [
      { cite: '3068', heading: 'Lien for repair, storage, and related charges on a vehicle; when it arises and when it is lost' },
      { cite: '3068.1', heading: 'Towing and storage lien mechanics: charges, release, and the person entitled to possession' },
      { cite: '3068.2', heading: 'Tow operator\'s deficiency claim for towing and storage charges, storage capped at 120 days' },
      { cite: '3071', heading: 'Lien sale procedure for a vehicle worth more than the statutory threshold: DMV authorization, notice, and the owner\'s right to a hearing' },
    ],
  },
];
