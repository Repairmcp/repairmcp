import type { CaDomain } from './schema.js';

/**
 * The regulations half of the California capture manifest, on two surfaces.
 *
 * LII (law.cornell.edu/regulations/california/{T}-CCR-{§}) carries 10 CCR
 * (the Fair Claims Settlement Practices Regulations), 16 CCR (the Bureau of
 * Automotive Repair's rules), and 8 CCR 11090 (IWC Wage Order 9, which DIR
 * itself publishes only as a PDF). The official CCR publisher (Westlaw
 * calregs, under the OAL contract) answers every non-browser request with a
 * Cloudflare challenge — verified 2026-09-04 — and the project owner chose
 * the mirror over a hollow corpus that day. LII's robots.txt asks for a
 * 10-second crawl delay; capture.ts enforces it.
 *
 * DIR (dir.ca.gov/title8/{§}.html) is the Department of Industrial
 * Relations' own publication of Title 8 — official, plain HTML, one section
 * per page. Every Cal/OSHA order comes from there.
 *
 * Every cite below was verified on its surface 2026-09-04 (the LII sweep
 * and the DIR page fetches). `expectHeading` pins a substring the captured
 * heading must contain — a renumbered or repurposed cite fails loudly; the
 * hierarchy (chapter/article) is read from each page and cross-checked
 * against `expectHierarchy` for LII entries.
 */
export interface CaLiiCaptureSource {
  code: '10 CCR' | '16 CCR' | '8 CCR';
  /** The CCR title number as LII's URL carries it. */
  title: '10' | '16' | '8';
  cite: string;
  domain: CaDomain;
  /** Becomes StateSection.chapter — reads naturally after the word "chapter". */
  chapter: string;
  chapterTitle: string;
  /** A breadcrumb level the page must print (exact match). */
  expectHierarchy: string;
  /** A substring the captured heading must contain. */
  expectHeading?: string;
}

export interface CaDirCaptureSource {
  cite: string;
  domain: CaDomain;
  /** A substring the captured heading must contain. */
  expectHeading?: string;
}

export const LII_BASE = 'https://www.law.cornell.edu/regulations/california';
export function liiSectionUrl(title: string, cite: string): string {
  return `${LII_BASE}/${title}-CCR-${cite}`;
}

export const DIR_BASE = 'https://www.dir.ca.gov/title8';
export function dirSectionUrl(cite: string): string {
  return `${DIR_BASE}/${cite}.html`;
}

const FCSPR = {
  code: '10 CCR' as const,
  title: '10' as const,
  domain: 'insurance' as const,
  chapter: '5, subch. 7.5, art. 1 (Tit. 10)',
  chapterTitle: 'Fair Claims Settlement Practices Regulations',
  expectHierarchy: 'Article 1 - Fair Claims Settlement Practices Regulations',
};

function bar(article: string, articleTitle: string, cite: string, expectHeading?: string): CaLiiCaptureSource {
  return {
    code: '16 CCR',
    title: '16',
    cite,
    domain: 'repair_law',
    chapter: `1, art. ${article} (Tit. 16, Div. 33)`,
    chapterTitle: `Bureau of Automotive Repair: ${articleTitle}`,
    expectHierarchy: `Article ${article} - ${articleTitle}`,
    ...(expectHeading ? { expectHeading } : {}),
  };
}

export const CA_LII_SOURCES: readonly CaLiiCaptureSource[] = [
  { ...FCSPR, cite: '2695.1', expectHeading: 'Preamble' },
  { ...FCSPR, cite: '2695.2', expectHeading: 'Definitions' },
  { ...FCSPR, cite: '2695.3', expectHeading: 'File and Record Documentation' },
  { ...FCSPR, cite: '2695.4', expectHeading: 'Representation of Policy Provisions' },
  { ...FCSPR, cite: '2695.5', expectHeading: 'Duties upon Receipt of Communications' },
  { ...FCSPR, cite: '2695.6', expectHeading: 'Training and Certification' },
  { ...FCSPR, cite: '2695.7', expectHeading: 'Standards for Prompt, Fair and Equitable Settlements' },
  { ...FCSPR, cite: '2695.8', expectHeading: 'Additional Standards Applicable to Automobile Insurance' },
  { ...FCSPR, cite: '2695.12', expectHeading: 'Penalties' },
  { ...FCSPR, cite: '2695.13', expectHeading: 'Severability' },
  { ...FCSPR, cite: '2695.14', expectHeading: 'Compliance Date' },
  { ...FCSPR, cite: '2695.81', expectHeading: 'Standardized Auto Body Repair Labor Rate Survey' },
  { ...FCSPR, cite: '2695.85', expectHeading: 'Auto Body Repair Consumer Bill of Rights' },

  bar('1', 'General Provisions', '3303', 'Definitions'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3352', 'Definitions'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3353', 'Estimate/Work Order Requirements'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3354', 'Additional Authorization'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3355', 'Replaced Parts'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3356', 'Invoice Requirements'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3357', 'Toxic Waste Disposal Costs'),
  bar('7', 'Disclosure Requirements for Automotive Repair Dealers', '3358', 'Maintenance of Records'),
  bar('8', 'Accepted Trade Standards', '3360', 'Scope of Regulations'),
  bar('8', 'Accepted Trade Standards', '3365', 'Auto Body and Frame Repairs'),
  bar('8', 'Accepted Trade Standards', '3367', 'Inflatable Restraint Systems'),
  bar('8', 'Accepted Trade Standards', '3368', 'Referral Fees'),
  bar('9', 'False or Misleading Statements and Advertising', '3371', 'Untrue or Misleading Statements'),
  bar('9', 'False or Misleading Statements and Advertising', '3372', 'False or Misleading Defined'),
  bar('9', 'False or Misleading Statements and Advertising', '3373', 'False or Misleading Records'),
  bar('9', 'False or Misleading Statements and Advertising', '3374', 'New, Rebuilt, Reconditioned, or Used Parts'),
  bar('9', 'False or Misleading Statements and Advertising', '3375', 'Guarantees and Warranties'),
  bar('9', 'False or Misleading Statements and Advertising', '3376', 'Disclosure of Guarantee'),

  {
    code: '8 CCR',
    title: '8',
    cite: '11090',
    domain: 'employment',
    chapter: '5, group 2, art. 9 (Tit. 8, Div. 1)',
    chapterTitle: 'Industrial Welfare Commission Wage Order 9: Transportation Industry',
    expectHierarchy: 'Article 9 - TRANSPORTATION INDUSTRY',
    expectHeading: 'Transportation Industry',
  },
];

export const CA_DIR_SOURCES: readonly CaDirCaptureSource[] = [
  { cite: '3203', domain: 'safety', expectHeading: 'Injury and Illness Prevention Program' },
  { cite: '3380', domain: 'safety', expectHeading: 'Personal Protective Devices' },
  { cite: '3400', domain: 'safety', expectHeading: 'Medical Services and First Aid' },
  { cite: '5144', domain: 'safety', expectHeading: 'Respiratory Protection' },
  { cite: '5153', domain: 'safety' },
  { cite: '5155', domain: 'safety', expectHeading: 'Airborne Contaminants' },
  { cite: '5162', domain: 'safety', expectHeading: 'Emergency Eyewash' },
  { cite: '5194', domain: 'safety', expectHeading: 'Hazard Communication' },
  { cite: '5445', domain: 'safety' },
  { cite: '5446', domain: 'safety', expectHeading: 'Spray Booths' },
  { cite: '5450', domain: 'safety' },
  { cite: '5451', domain: 'safety' },
  { cite: '5452', domain: 'safety' },
  { cite: '5453', domain: 'safety' },
  { cite: '5461', domain: 'safety' },
  { cite: '6151', domain: 'safety', expectHeading: 'Portable Fire Extinguishers' },
];
