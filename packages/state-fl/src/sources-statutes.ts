import type { FlDomain } from './schema.js';

/**
 * The statutes half of the Florida capture manifest: which sections to fetch
 * from the Legislature's Online Sunshine site (leg.state.fl.us), one page
 * per section. Each entry is one chapter (or part of a chapter) with the
 * sections wanted from it; the page for a named cite is fetched directly
 * and hard-fails when the site answers "cannot be found". Chapter titles
 * were read off the chapter pages 2026-09-09 and are eyeball-verified.
 *
 * Headings are NOT in this manifest: Florida prints catchlines, and the
 * parser captures them as source text. The `note` on an entry is the
 * honest-absence or scope remark the tool descriptions carry.
 *
 * The site's robots.txt disallows only /employees/ for our agent and states
 * no crawl delay; the io-wide 2 s pause applies. The Senate's mirror
 * (flsenate.gov) serves identical inner markup at a 10 s crawl delay and is
 * the by-hand cross-check, not a capture surface (kickoff §3.1).
 */
export interface FlStatuteCaptureSource {
  /** Becomes StateSection.chapter — reads naturally after the word "chapter". */
  chapter: string;
  chapterTitle: string;
  domain: FlDomain;
  cites: readonly string[];
  note?: string;
}

export const ONLINE_SUNSHINE_BASE = 'https://www.leg.state.fl.us/statutes/index.cfm';

/**
 * "626.9743" → …?App_mode=Display_Statute&Search_String=&URL=0600-0699/0626/Sections/0626.9743.html
 * The range is the chapter's hundred; chapter and file are zero-padded to
 * four digits. This is the citation link too (sourceUrl).
 */
export function onlineSunshineSectionUrl(cite: string): string {
  const [chapterPart] = cite.split('.');
  const chapterNum = Number.parseInt(chapterPart ?? '', 10);
  if (!Number.isFinite(chapterNum) || !/^\d+\.\d+$/.test(cite)) {
    throw new Error(`Not a Florida statute cite: "${cite}".`);
  }
  const chapter = String(chapterNum).padStart(4, '0');
  const rangeStart = Math.floor(chapterNum / 100) * 100;
  const range = `${String(rangeStart).padStart(4, '0')}-${String(rangeStart + 99).padStart(4, '0')}`;
  const file = `${chapter}.${cite.slice((chapterPart ?? '').length + 1)}`;
  return `${ONLINE_SUNSHINE_BASE}?App_mode=Display_Statute&Search_String=&URL=${range}/${chapter}/Sections/${file}.html`;
}

export const FL_STATUTE_SOURCES: readonly FlStatuteCaptureSource[] = [
  {
    chapter: '624, pt. II',
    chapterTitle: 'Insurance Code: Administration and General Provisions — General Provisions',
    domain: 'insurance',
    cites: ['624.155'],
    note: 'The civil remedy: any person damaged by a 626.9541(1)(i) violation or by an insurer not attempting in good faith to settle may sue, after the 60-day notice. Florida HAS a statutory private right of action — the opposite of California.',
  },
  {
    chapter: '626, pt. VI',
    chapterTitle: 'Insurance Field Representatives and Operations — Insurance Adjusters',
    domain: 'insurance',
    cites: ['626.877', '626.878'],
    note: '626.878 is the statutory basis for the adjuster code of ethics at Fla. Admin. Code 69B-220.201.',
  },
  {
    chapter: '626, pt. IX',
    chapterTitle: 'Unfair Insurance Trade Practices',
    domain: 'insurance',
    cites: ['626.9541', '626.9743'],
    note: '626.9743 is the motor vehicle claims headliner; 626.9541(1)(i) is the unfair claim settlement practices catalog 624.155 makes actionable.',
  },
  {
    chapter: '627, pt. II',
    chapterTitle: 'Insurance Rates and Contracts — The Insurance Contract',
    domain: 'insurance',
    cites: ['627.4265'],
  },
  {
    chapter: '627, pt. X',
    chapterTitle: 'Property Insurance Contracts',
    domain: 'insurance',
    cites: ['627.70131'],
    note: 'A PROPERTY insurance section: subsection (1) reads generally and shops cite it, but its pay-or-deny clock in (7) is limited to residential and small commercial property claims. The motor vehicle analogs are 626.9541(1)(i) and 69O-166.024. Stated, not decided.',
  },
  {
    chapter: '627, pt. XI',
    chapterTitle: 'Motor Vehicle and Casualty Insurance Contracts',
    domain: 'insurance',
    cites: ['627.7288'],
  },
  {
    chapter: '319',
    chapterTitle: 'Title Certificates',
    domain: 'insurance',
    cites: ['319.30'],
    note: 'Subsection (3) carries the 80 percent total-loss threshold — a statutory number no other shipped state has.',
  },
  {
    chapter: '559, pt. IX',
    chapterTitle: 'Regulation of Trade, Commerce, and Investments, Generally — Repair of Motor Vehicles (the Florida Motor Vehicle Repair Act)',
    domain: 'repair_law',
    cites: [
      '559.901', '559.902', '559.903', '559.904', '559.905', '559.907', '559.909',
      '559.911', '559.915', '559.916', '559.917', '559.919', '559.920', '559.921',
    ],
    note: '559.9215 (fee deposits), 559.92201 (rulemaking), and 559.9221 (the advisory council) are administrative and left out on purpose.',
  },
  {
    chapter: '713, pt. II',
    chapterTitle: 'Liens, Generally — Miscellaneous Liens',
    domain: 'repair_law',
    cites: ['713.58', '713.585', '713.78'],
    note: '713.58 is the labor lien on the vehicle; 713.585 is how a repair shop sells the vehicle to enforce it; 713.78 is the towing-storage operator lien and its fee limits.',
  },
  {
    chapter: '501, pt. I',
    chapterTitle: 'Consumer Protection — Nonoriginal Manufacturer\'s Replacement Crash Parts',
    domain: 'repair_law',
    cites: ['501.32', '501.33', '501.34'],
  },
  {
    chapter: '501, pt. II',
    chapterTitle: 'Consumer Protection — Florida Deceptive and Unfair Trade Practices Act',
    domain: 'repair_law',
    cites: ['501.204', '501.211'],
    note: '501.211 is the section that creates the private action; 501.204 alone only declares the practices unlawful (the Colorado 10-3-1104 lesson, applied here from the start).',
  },
  {
    chapter: '448',
    chapterTitle: 'General Labor Regulations',
    domain: 'employment',
    cites: ['448.01', '448.08', '448.095', '448.101', '448.102', '448.103', '448.110'],
    note: 'Florida has no final-paycheck statute, no meal or rest break statute, and no state overtime law beyond 448.01\'s ten-hour day. The corpus states the absences and captures what exists.',
  },
  {
    chapter: '440',
    chapterTitle: 'Workers\' Compensation',
    domain: 'employment',
    cites: ['440.02', '440.10', '440.105', '440.107', '440.38'],
    note: '440.02\'s definitions carry the employee/independent contractor test the 1099-technician question turns on; 440.107 is the stop-work order.',
  },
];
