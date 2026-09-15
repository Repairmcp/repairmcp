import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/il-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/il-annotations.json' with { type: 'json' };
import { IlAdapter } from '../src/adapter.js';
import { IlCorpus } from '../src/corpus.js';
import { displayCite } from '../src/identity.js';
import { manifestCites } from '../src/sources.js';
import { IL_TOPICS } from '../src/taxonomy.js';

const corpus = new IlCorpus(corpusJson, annotationsJson);
const top = (q: string, n: number) => corpus.findSupporting(q).hits.slice(0, n).map((h) => displayCite(h.section));

describe('the committed corpus', () => {
  test('88 sections, four domains', () => {
    const d = corpus.domainBreakdown();
    expect(d.insurance).toBe(16); expect(d.repair_law).toBe(37); expect(d.employment).toBe(23); expect(d.safety).toBe(12);
    expect(corpus.sections.length).toBe(88);
  });
  test('meta records the newest effective date and the three dual-printed sections', () => {
    const meta = corpus.meta as { newestEffectiveDate?: string; dualPrinted?: Array<{ cite: string; chosen: string }> };
    expect(meta.newestEffectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.dualPrinted?.map((d) => `${d.cite} → ${d.chosen}`)).toEqual([
      '820 ILCS 115/9 → after amendment by P.A. 104-457',
      '820 ILCS 105/3 → from P.A. 104-480',
      '820 ILCS 305/4 → from P.A. 101-384, 102-37, and 103-590',
    ]);
  });
  test('every section states its capture surface, heading source, and source note; text is clean of control chars, double spaces, and soft-wrap breaks', () => {
    for (const s of corpus.sections) {
      expect(s.text, `${displayCite(s)} replacement or control chars`).not.toMatch(/[-�]/);
      expect(s.text, `${displayCite(s)} double space`).not.toMatch(/ {2}/);
      expect(s.text, `${displayCite(s)} line ending mid-word`).not.toMatch(/[a-z]-\n[a-z]/);
      expect(s.text, `${displayCite(s)} site chrome`).not.toMatch(/ILGA\.GOV|Legislative Information System|Printer Friendly/);
      expect(s.sourceNote.length, displayCite(s)).toBeGreaterThan(0);
      expect(['act', 'article', 'part']).toContain(s.captureSource);
      expect(['section', 'manifest']).toContain(s.headingSource);
      if (s.code === 'ILCS') expect(Array.isArray(s.publicActs), displayCite(s)).toBe(true);
      else expect(s.dateSource, displayCite(s)).toMatch(/^(section|part)$/);
    }
  });
  test('the undated sections are exactly the pre-1990s Public Acts the kickoff counted', () => {
    const undated = corpus.sections.filter((s) => !s.effectiveDate).map((s) => displayCite(s)).sort();
    expect(undated).toEqual([
      '215 ILCS 5/154.5', '215 ILCS 5/154.7', '215 ILCS 5/155.29',
      '770 ILCS 45/1', '770 ILCS 45/2', '770 ILCS 50/1', '770 ILCS 50/2', '770 ILCS 50/3',
      '815 ILCS 505/2', '820 ILCS 115/5',
    ]);
  });
  test('the manifest headings are exactly the sections Illinois prints no catchline on', () => {
    const manifest = corpus.sections.filter((s) => s.headingSource === 'manifest').map((s) => displayCite(s)).sort();
    expect(manifest).toEqual([
      '215 ILCS 5/154.5', '215 ILCS 5/154.7', '215 ILCS 5/155.29',
      '770 ILCS 45/1', '770 ILCS 45/2', '770 ILCS 50/1', '770 ILCS 50/2', '770 ILCS 50/3',
      '815 ILCS 308/35', '815 ILCS 505/2',
      '820 ILCS 105/12', '820 ILCS 105/3', '820 ILCS 105/4', '820 ILCS 105/4a',
      '820 ILCS 115/3', '820 ILCS 115/4', '820 ILCS 115/5', '820 ILCS 115/9', '820 ILCS 140/3', '820 ILCS 305/4',
    ]);
    expect(corpus.getSection('815 ILCS 308/35')?.heading).toBe('Inability to deliver motor vehicle to facility during business hours.');
  });
  test('the two inherited-date rules carry the Part adoption date', () => {
    expect(corpus.getSection('56 Ill. Adm. Code 210.440')?.effectiveDate).toBe('1995-05-02');
    expect(corpus.getSection('56 Ill. Adm. Code 210.440')?.dateSource).toBe('part');
    expect(corpus.getSection('35 Ill. Adm. Code 219.103')?.effectiveDate).toBe('1991-08-16');
    expect(corpus.getSection('35 Ill. Adm. Code 219.103')?.dateSource).toBe('part');
    expect(corpus.getSection('50 Ill. Adm. Code 919.80')?.dateSource).toBe('section');
  });
  test('headliners are captured verbatim', () => {
    expect(corpus.getSection('215 ILCS 5/154.6')?.text).toContain('establishing unreasonable caps or limits on paint or materials when estimating vehicle repairs');
    expect(corpus.getSection('215 ILCS 5/154.6')?.text).toContain('is duly licensed under Section 5-301 of the Illinois Vehicle Code');
    expect(corpus.getSection('50 Ill. Adm. Code 919.80')?.text).toContain('provide the insured with the name of a repair shop that will make the repairs in a workmanlike manner');
    expect(corpus.getSection('50 Ill. Adm. Code 919.80')?.text).toContain('any such deductions for this type of damage may not exceed $500');
    expect(corpus.getSection('50 Ill. Adm. Code 919.80')?.text).toContain('The company shall provide reasonable notice to an insured prior to termination of payment for automobile storage charges');
    expect(corpus.getSection('50 Ill. Adm. Code 919.90')?.text).toContain('shall abandon the salvage of a motor vehicle to a towing service and/or storage yard service in lieu of the towing and storage charges');
    expect(corpus.getSection('215 ILCS 5/155')?.text).toContain('vexatious and unreasonable');
    expect(corpus.getSection('215 ILCS 5/155.29')?.text).toContain('No insurer shall specify the use of non-OEM aftermarket crash parts');
    expect(corpus.getSection('815 ILCS 308/15')?.text).toContain('exceeds the estimate by more than 10% without oral or written consent');
    expect(corpus.getSection('815 ILCS 306/83')?.text).toContain('This Act does not apply to automotive collision and body repair facilities');
    expect(corpus.getSection('770 ILCS 45/1.5')?.text).toContain('storage fees shall not be assessed and collected');
    expect(corpus.getSection('625 ILCS 5/5-301')?.text).toContain('a repairer, or a rebuilder, unless licensed to do so in writing by the Secretary of State');
    expect(corpus.getSection('625 ILCS 5/3-117.1')?.text).toContain('any vehicle 9 model years of age or older may, by agreement between the registered owner and the insurance company, be retained');
    expect(corpus.getSection('820 ILCS 115/9')?.text).toContain('express written consent of the employee, given freely at the time the deduction is made');
    expect(corpus.getSection('56 Ill. Adm. Code 300.820')?.text).toContain('damage to his/her property or to that of a customer or client');
    expect(corpus.getSection('820 ILCS 140/3')?.text).toContain('at least 20 minutes for a meal period beginning no later than 5 hours after');
    expect(corpus.getSection('820 ILCS 105/4a')?.text).toContain('Any salesman or mechanic primarily engaged in selling or servicing automobiles');
    expect(corpus.getSection('35 Ill. Adm. Code 218.103')?.text).toContain('Cook, DuPage, Kane, Lake, McHenry, and Will Counties');
    expect(corpus.getSection('35 Ill. Adm. Code 219.103')?.text).toContain('Madison, Monroe, and St. Clair Counties');
    expect(corpus.getSection('820 ILCS 219/15')?.text).toContain('This Act applies to every public employer in this State');
  });
  test('the dual-printed sections carry the chosen version and record every printed one', () => {
    const s9 = corpus.getSection('820 ILCS 115/9')!;
    expect(s9.effectiveDate).toBe('2026-06-01');
    expect(s9.printedVersions?.length).toBe(2);
    expect(s9.versionNote).toContain('this corpus carries "after amendment by P.A. 104-457"');
    expect(s9.futureEffective).toBeUndefined();
    expect(corpus.getSection('820 ILCS 105/3')?.effectiveDate).toBe('2026-07-01');
    expect(corpus.getSection('820 ILCS 305/4')?.printedVersions?.length).toBe(2);
    expect(corpus.sections.filter((s) => s.futureEffective).length).toBe(0);
  });
  test('the excluded sections are not in the corpus', () => {
    for (const q of ['625 ILCS 5/4-216', '820 ILCS 185/10', '215 ILCS 5/143a', '35 Ill. Adm. Code 218.788']) expect(corpus.getSection(q), q).toBeNull();
  });
  test('every topic reaches at least one section', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const t of IL_TOPICS) expect(reachable.has(t), `topic ${t}`).toBe(true);
  });
  test('every manifest cite is in the corpus', () => {
    for (const c of manifestCites()) expect(corpus.getSection(c.cite), c.cite).not.toBeNull();
  });
  test('named listings', () => {
    expect(corpus.search('Automotive Collision Repair Act', { limit: 20 }).hits.length).toBe(16);
    expect(corpus.search('815 ILCS 306', { limit: 20 }).hits.length).toBe(7);
    expect(corpus.search('Part 919', { limit: 20 }).hits.length).toBe(6);
    expect(corpus.search('IWPCA', { limit: 20 }).hits.length).toBe(7);
    expect(corpus.search('Labor and Storage Lien Act', { limit: 20 }).hits.length).toBe(3);
    expect(corpus.search('refinishing rule', { limit: 20 }).hits.length).toBe(6);
  });
});

describe('launch demo criteria — the gauntlet (shop phrasing; fixes go in annotations, never weights)', () => {
  test('paint and materials cap: 154.6 first with the (j) excerpt', () => {
    const r = corpus.findSupporting('insurer says they only pay so much an hour for paint and materials');
    expect(displayCite(r.hits[0]!.section)).toBe('215 ILCS 5/154.6');
    expect(r.hits[0]!.annotation?.quoteSafeExcerpts?.some((e) => e.includes('unreasonable caps or limits on paint'))).toBe(true);
    expect(top('P&M cap on the estimate', 1)).toEqual(['215 ILCS 5/154.6']);
  });
  test("can't repair it for the insurer's number: 919.80 first with the (d)(6) excerpt", () => {
    const r = corpus.findSupporting("insurer wrote it for 20 hours and I can't repair it for that");
    expect(displayCite(r.hits[0]!.section)).toBe('50 Ill. Adm. Code 919.80');
    expect(r.hits[0]!.annotation?.quoteSafeExcerpts?.some((e) => e.includes('name of a repair shop that will make the repairs in a workmanlike manner'))).toBe(true);
  });
  test('steering: 919.80 first, 154.6 top 3', () => {
    const t = top('the adjuster told my customer to take it to their DRP shop', 3);
    expect(t[0]).toBe('50 Ill. Adm. Code 919.80');
    expect(t).toContain('215 ILCS 5/154.6');
  });
  test('storage cut off: 919.80 first; salvage left for the storage bill: 919.90 first', () => {
    expect(top('insurer cut off storage on the total loss with no notice', 1)).toEqual(['50 Ill. Adm. Code 919.80']);
    expect(top('insurer wants to leave the salvage here for the storage bill', 1)).toEqual(['50 Ill. Adm. Code 919.90']);
  });
  test('betterment: 919.80 first', () => {
    expect(top('betterment on tires and a battery', 1)).toEqual(['50 Ill. Adm. Code 919.80']);
  });
  test('total loss: 919.80, the right of recourse, sales tax, the valuation explanation, the salvage title', () => {
    expect(top('they lowballed the total loss value', 1)).toEqual(['50 Ill. Adm. Code 919.80']);
    expect(top("customer can't find a comparable car for that money", 1)).toEqual(['50 Ill. Adm. Code 919.80']);
    expect(top('does the insurer owe the sales tax on the total loss', 1)).toEqual(['215 ILCS 5/154.9']);
    expect(top('how did they come up with the total loss number', 1)).toEqual(['215 ILCS 5/154.10']);
    expect(top('customer wants to know how they came up with the total loss number', 2)).toContain('215 ILCS 5/154.10');
    expect(top('total loss, does it need a salvage title, can the customer keep the car', 1)).toEqual(['625 ILCS 5/3-117.1']);
  });
  test('claim deadlines and denials', () => {
    expect(top("insurer hasn't done anything on the claim in three weeks", 1).some((c) => c === '50 Ill. Adm. Code 919.40' || c === '50 Ill. Adm. Code 919.50')).toBe(true);
    expect(top('40 days and no decision on the collision claim', 1)).toEqual(['50 Ill. Adm. Code 919.80']);
    expect(top('insurer denied the claim with no written explanation', 1)).toEqual(['50 Ill. Adm. Code 919.50']);
  });
  test('bad faith: 155 top 3', () => {
    expect(top('can I sue the insurer for bad faith', 3)).toContain('215 ILCS 5/155');
  });
  test('aftermarket parts undisclosed: 155.29 first, 919.80 top 3', () => {
    const t = top('aftermarket parts on the estimate and the customer never knew', 3);
    expect(t[0]).toBe('215 ILCS 5/155.29');
    expect(t).toContain('50 Ill. Adm. Code 919.80');
  });
  test("the shop's obligations under the Collision Repair Act", () => {
    expect(top('do I need written authorization before I start the repair', 1)).toEqual(['815 ILCS 308/15']);
    expect(top('job ran ten percent over the estimate', 1).some((c) => c === '815 ILCS 308/15' || c === '815 ILCS 308/25')).toBe(true);
    expect(top('customer wants his old parts back', 1)).toEqual(['815 ILCS 308/30']);
    expect(top("can I charge for teardown if they don't approve the repair", 1)).toEqual(['815 ILCS 308/15']);
    expect(top('what has to be on the final invoice', 1)).toEqual(['815 ILCS 308/40']);
    expect(top('what sign do I have to post in the shop', 1)).toEqual(['815 ILCS 308/50']);
    expect(top('does the Automotive Repair Act apply to my body shop', 1).some((c) => c === '815 ILCS 306/83' || c === '815 ILCS 308/80')).toBe(true);
  });
  test('a car never picked up: the lienholder notice first, the lien and the sale in the top 3; abandoned tow: 4-201', () => {
    const t = top("customer never picked the car up, it's been a month", 3);
    expect(t[0]).toMatch(/^770 ILCS (45|50)\/1\.5$/);
    expect(t.some((c) => c === '770 ILCS 45/1' || c === '770 ILCS 50/1' || c === '770 ILCS 50/2')).toBe(true);
    expect(top('can I sell the car for the storage bill', 1)).toEqual(['770 ILCS 50/2']);
    expect(top('can I have the customer\'s car towed as abandoned', 1)).toEqual(['625 ILCS 5/4-201']);
  });
  test('repairer licensing: 5-301 first', () => {
    expect(top('do I need a license to run a body shop in Illinois', 1)).toEqual(['625 ILCS 5/5-301']);
    expect(top("insurer's estimate says repairers must be licensed", 1)).toEqual(['215 ILCS 5/154.6']);
  });
  test('final paycheck and late wages: 115/5 and 115/4', () => {
    expect(top('tech quit Friday, when do I have to pay him', 1)).toEqual(['820 ILCS 115/5']);
    expect(top('wages are late', 1)[0]).toMatch(/^820 ILCS 115\/(4|14)$/);
  });
  test('comeback or broken tool chargeback: the deductions rules', () => {
    const t = top("deducting a comeback or a broken tool from a tech's pay", 3);
    expect(t[0]).toMatch(/^(56 Ill\. Adm\. Code 300\.820|820 ILCS 115\/9)$/);
    expect(t).toContain('56 Ill. Adm. Code 300.850');
  });
  test('overtime and minimum wage', () => {
    expect(top('overtime for a flat-rate tech', 1)).toEqual(['820 ILCS 105/4a']);
    expect(top("what's minimum wage this year", 1)).toEqual(['820 ILCS 105/4']);
  });
  test('breaks, leave, non-competes', () => {
    expect(top('do I have to give the painter a lunch break', 1)).toEqual(['820 ILCS 140/3']);
    expect(top('can I make a tech work seven days straight', 1)).toEqual(['820 ILCS 140/2']);
    expect(top('how much paid time off do I owe', 1)).toEqual(['820 ILCS 192/15']);
    expect(top('can I make a tech sign a non-compete', 1)).toEqual(['820 ILCS 90/10']);
  });
  test('1099 tech with no comp policy: 305/4 first; Illinois OSHA: 219/15', () => {
    expect(top('1099 tech, no comp policy', 1)).toEqual(['820 ILCS 305/4']);
    expect(top('does the Illinois Occupational Safety and Health Act apply to a private employer', 1)).toEqual(['820 ILCS 219/15']);
  });
  test('refinishing rules by area', () => {
    expect(top('VOC limits on refinish coatings in Chicago', 1)).toEqual(['35 Ill. Adm. Code 218.780']);
    expect(top('do I need HVLP guns in my booth', 1)[0]).toMatch(/^35 Ill\. Adm\. Code 21[89]\.784$/);
    expect(top("I'm in Belleville, what are the refinish coating limits", 1)).toEqual(['35 Ill. Adm. Code 219.780']);
  });
  test('exact cite short-circuits to 1.0', () => {
    for (const q of ['215 ILCS 5/154.6', '50 Ill. Adm. Code 919.80', '815 ILCS 308/15', 'Section 154.6 of the Insurance Code', '770 ILCS 45/1.5', 'Exhibit A']) {
      expect(corpus.findSupporting(q).hits[0]?.score, q).toBe(1);
    }
    expect(corpus.findSupporting('Section 9 of the Wage Payment and Collection Act').hits[0]?.section.cite).toBe('820 ILCS 115/9');
  });
});

describe('the adapter', () => {
  const adapter = new IlAdapter(corpus);
  test('citation short forms by code, dated and undated', async () => {
    expect(adapter.formatCitation((await adapter.getById('iac:50-919.80'))!).shortForm).toBe('50 Ill. Adm. Code 919.80, effective 7/22/2002');
    expect(adapter.formatCitation((await adapter.getById('ilcs:215-5/154.6'))!).shortForm).toBe('215 ILCS 5/154.6, effective 7/1/2022');
    expect(adapter.formatCitation((await adapter.getById('ilcs:815-308/15'))!).shortForm).toBe('815 ILCS 308/15, effective 1/1/2004');
    expect(adapter.formatCitation((await adapter.getById('ilcs:215-5/155.29'))!).shortForm).toBe('215 ILCS 5/155.29');
    expect(adapter.formatCitation((await adapter.getById('iac:56-210.440'))!).shortForm).toBe('56 Ill. Adm. Code 210.440, effective 5/2/1995');
  });
  test('getById accepts any citation spelling and the version note rides along', async () => {
    expect((await adapter.getById('50 IAC 919.80'))?.metadata.record.cite).toBe('50 Ill. Adm. Code 919.80');
    expect((await adapter.getById('820 ILCS 115/9'))?.metadata.record.versionNote).toContain('P.A. 104-457');
  });
});
