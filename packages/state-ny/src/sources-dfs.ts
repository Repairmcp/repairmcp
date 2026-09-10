/**
 * The six DFS documents (kickoff §2.1). Guidance, not law. Each is pinned
 * by URL; the page's own title must name it; its expected status is stated
 * so a silent withdrawal (or a resurrection) is drift. Circular Letter 16
 * (2000) is captured WITHDRAWN on purpose: it is what a search for "2610
 * steering" turns up, and the corpus must say the Department withdrew it
 * after Allstate v. Serio rather than let it be cited as live.
 */
export interface NyDfsSource {
  cite: string;
  kind: 'ogc' | 'circular';
  number: string;
  heading: string;
  url: string;
  expectedStatus: 'current' | 'withdrawn';
  chapter: 'OGC opinions' | 'Circular letters';
  note?: string;
}

const DFS = 'https://www.dfs.ny.gov';

export const NY_DFS_SOURCES: readonly NyDfsSource[] = [
  { cite: 'OGC Opinion 01-10-05', kind: 'ogc', number: '01-10-05', heading: 'Settlements of Total Loss Motor Vehicle Damage Claims', url: `${DFS}/insurance/ogco2001/rg110092.htm`, expectedStatus: 'current', chapter: 'OGC opinions' },
  { cite: 'OGC Opinion 02-12-20', kind: 'ogc', number: '02-12-20', heading: 'Fair Claim Settlement', url: `${DFS}/insurance/ogco2002/rg021220.htm`, expectedStatus: 'current', chapter: 'OGC opinions' },
  { cite: 'OGC Opinion 04-06-03', kind: 'ogc', number: '04-06-03', heading: 'Section 2610 - Certified Autobody Repair Shops', url: `${DFS}/insurance/ogco2004/rg040603.htm`, expectedStatus: 'current', chapter: 'OGC opinions',
    note: 'An insurer may not advise the owner to use a manufacturer-certified shop without being asked (2610(b)); it may say the manufacturer has such a requirement.' },
  { cite: 'OGC Opinion 06-06-09', kind: 'ogc', number: '06-06-09', heading: 'Interpretation of Regulation 64', url: `${DFS}/insurance/ogco2006/rg060609.htm`, expectedStatus: 'current', chapter: 'OGC opinions' },
  { cite: 'Circular Letter 11 (1991)', kind: 'circular', number: '11 (1991)', heading: 'Scope of Regulation 64 on Claims Settlement Practices', url: `${DFS}/industry_guidance/circular_letters/cl1991_11`, expectedStatus: 'current', chapter: 'Circular letters' },
  { cite: 'Circular Letter 16 (2000)', kind: 'circular', number: '16 (2000)', heading: 'Application of Section 2610(b) of the Insurance Law', url: `${DFS}/industry_guidance/circular_letters/cl2000_16`, expectedStatus: 'withdrawn', chapter: 'Circular letters',
    note: 'WITHDRAWN effective 12/4/2003 after Allstate v. Serio (2d Cir. 2001) struck the Department\'s reading of 2610(b). Captured so the withdrawal is stated, never as live guidance.' },
];
