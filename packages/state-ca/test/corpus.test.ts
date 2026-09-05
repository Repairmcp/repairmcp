import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/ca-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/ca-annotations.json' with { type: 'json' };
import { CaAdapter } from '../src/adapter.js';
import { CaCorpus } from '../src/corpus.js';
import { displayCite } from '../src/identity.js';
import { CA_TOPICS } from '../src/taxonomy.js';

const corpus = new CaCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all four domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(20);
    expect(domains.repair_law).toBeGreaterThan(30);
    expect(domains.safety).toBeGreaterThan(14);
    expect(domains.employment).toBeGreaterThan(15);
  });
  test('every section names its capture surface and heading source consistently', () => {
    for (const s of corpus.sections) {
      if (s.code.endsWith('CCR')) {
        expect(s.headingSource).toBe('source');
        expect(['lii', 'dir']).toContain(s.captureSource);
        if (s.code === '8 CCR' && s.cite !== '11090') expect(s.captureSource).toBe('dir');
        if (s.code !== '8 CCR' || s.cite === '11090') expect(s.captureSource).toBe('lii');
      } else {
        expect(s.headingSource).toBe('manifest');
        expect(s.captureSource).toBe('leginfo');
      }
      // No replacement characters — a corpus of verbatim law cannot contain them.
      expect(s.text).not.toContain('�');
    }
  });
  test('every regulation carries a Register history and an effective date', () => {
    for (const s of corpus.sections) {
      if (!s.code.endsWith('CCR')) continue;
      expect(s.historyNote, `${displayCite(s)} history`).toBeTruthy();
      expect(s.effectiveDate, `${displayCite(s)} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  test('the 2025 BAR teardown amendment is in the corpus, not the mirror\'s older copy', () => {
    const s = corpus.getSection('16 CCR 3353');
    expect(s?.effectiveDate).toBe('2025-07-01');
    expect(s?.text).toContain('tear down');
  });
  test('the anti-capping section is captured verbatim', () => {
    expect(corpus.getSection('Ins. Code 758.6')?.text).toContain('Insurers shall not engage in capping.');
  });
  test('the OEM-or-industry-specification standard is captured verbatim', () => {
    expect(corpus.getSection('16 CCR 3365')?.text).toContain('in accordance with OEM service specifications');
  });
  test('Lab. Code 226.7 is the version in force, not the 2027 replacement', () => {
    const s = corpus.getSection('Labor Code 226.7');
    expect(s?.effectiveDate).toBe('2020-09-30');
    expect(s?.historyNote).toContain('Repealed as of January 1, 2027');
  });
  test('sections whose notes state no date stay silent', () => {
    expect(corpus.getSection('Labor Code 221')?.effectiveDate).toBeUndefined();
    expect(corpus.getSection('B&P 9884.10')?.effectiveDate).toBeUndefined();
  });
  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const topic of CA_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });
  test('getSection tolerates every citation spelling', () => {
    for (const input of ['Cal. Ins. Code 758.5', 'Insurance Code 758.5', 'cal. ins. code:758.5', '758.5', 'Sec. 758.5', '§758.5']) {
      expect(corpus.getSection(input)?.cite).toBe('758.5');
    }
    for (const input of ['10 CCR 2695.8', 'Cal. Code Regs. tit. 10, § 2695.8', '2695.8', '10 ccr:2695.8', 'CCR 2695.8']) {
      expect(corpus.getSection(input)?.cite).toBe('2695.8');
    }
    for (const input of ['8 CCR 5446', '5446', '8 ccr:5446']) {
      expect(corpus.getSection(input)?.cite).toBe('5446');
    }
    expect(corpus.getSection('B&P 9884.9')?.cite).toBe('9884.9');
    expect(corpus.getSection('Labor Code 226.2')?.cite).toBe('226.2');
    expect(corpus.getSection('Civ. Code 3068')?.cite).toBe('3068');
    expect(corpus.getSection('Wage Order 9')?.cite).toBe('11090');
    expect(corpus.getSection('Auto Body Repair Consumer Bill of Rights')?.cite).toBe('2695.85');
    expect(corpus.getSection('Ins. Code 999.9')).toBeNull();
  });
});

/**
 * The launch bar (kickoff §5). Every query is shop-floor phrasing, never
 * statutory phrasing — the annotation layer's claimUseCases are the bridge,
 * and these assertions are what prove the bridge carries weight. When one of
 * these fails the fix is annotation vocabulary, never a scoring weight.
 */
describe('launch demo criteria — the expert gauntlet', () => {
  const top = (q: string, n: number) => corpus.findSupporting(q).hits.slice(0, n).map((h) => h.section.cite);

  test('steering: 758.5 leads', () => {
    expect(top('adjuster says my customer has to use their network shop', 1)).toEqual(['758.5']);
  });
  test('the California headliner: the paint and materials cap reaches 758.6 first', () => {
    expect(top('insurer caps paint and materials at a flat amount and will not pay the calculator', 1)).toEqual(['758.6']);
  });
  test('labor rate survey: 2695.81 first', () => {
    expect(top('adjuster says the prevailing rate is what their labor rate survey shows', 1)).toEqual(['2695.81']);
  });
  test('supplement sitting unanswered: the 2695.5 / 2695.7 deadlines in the top three', () => {
    const t = top('supplement has been sitting for two months with no answer from the carrier', 3);
    expect(t.some((c) => c === '2695.5' || c === '2695.7')).toBe(true);
  });
  test('accept, deny, pay deadlines: 2695.7 first', () => {
    expect(top('how long does the insurer have to accept or deny the claim and pay it', 1)).toEqual(['2695.7']);
  });
  test('OEM procedure denied: 16 CCR 3365 leads — the standard the insurer\'s estimate must meet — with 2695.8 second', () => {
    const t = top('adjuster says the OEM procedure is not necessary and will not pay for it', 2);
    expect(t).toEqual(['3365', '2695.8']);
    expect(top('insurer refuses to pay for OEM repair procedures', 1)).toEqual(['3365']);
  });
  test('comeback chargeback: Wage Order 9\'s breakage rule is quotable alongside 221 and 224', () => {
    const r = corpus.findSupporting("can I deduct the cost of a comeback from my painter's paycheck", { limit: 3 });
    const wo9 = r.hits.find((h) => h.section.cite === '11090');
    expect(wo9).toBeDefined();
    expect(corpus.annotationFor(wo9!.section)?.quoteSafeExcerpts?.some((e) => e.includes('breakage, or loss of equipment'))).toBe(true);
  });
  test('aftermarket parts pushed: 2695.8 or 9875.1 in the top three', () => {
    const t = top('carrier wrote the estimate with aftermarket parts and says that is all they cover', 3);
    expect(t.some((c) => c === '2695.8' || c === '9875.1')).toBe(true);
  });
  test('total loss valuation: 2695.8 in the top three', () => {
    expect(top('insurer lowballed the actual cash value on the total loss', 3)).toContain('2695.8');
  });
  test('storage on a total loss: 2695.8 in the top three', () => {
    expect(top('insurer paid the total loss but will not pay the storage charges', 3)).toContain('2695.8');
  });
  test('teardown disclosure: 16 CCR 3353 first', () => {
    expect(top('we tore the car down before the estimate, what do we have to disclose to the customer', 1)).toEqual(['3353']);
  });
  test('additional authorization: 9884.9 and 3354 are the top two', () => {
    const t = top('customer did not authorize the additional repairs beyond the original estimate', 2);
    expect(t).toContain('9884.9');
    expect(t).toContain('3354');
  });
  test('customer will not pay: Civ. Code 3068 first', () => {
    expect(top('customer will not pay for the repair and the car is sitting here, can I hold or sell it', 1)).toEqual(['3068']);
  });
  test('flat-rate techs: 226.2 first', () => {
    expect(top('do I have to pay my flat-rate technicians separately for rest breaks', 1)).toEqual(['226.2']);
  });
  test('final paycheck: 202 first on a quit, 201 first on a discharge', () => {
    expect(top('tech quit yesterday, when is his final check due', 1)).toEqual(['202']);
    expect(top('fired a tech, when is his final check due', 1)).toEqual(['201']);
  });
  test('comeback chargeback: 221 or 224 in the top three', () => {
    const t = top("can I deduct the cost of a comeback from my painter's paycheck", 3);
    expect(t.some((c) => c === '221' || c === '224')).toBe(true);
  });
  test('spray booth clearance: 5446 first; respirator program: 5144 first', () => {
    expect(top('spray booth clearance from storage', 1)).toEqual(['5446']);
    expect(top('respirator program for painters', 1)).toEqual(['5144']);
  });
  test('total loss definition: Veh. Code 544 first', () => {
    expect(top('when is it legally a total loss in California', 1)).toEqual(['544']);
  });
  test('tool reimbursement: 2802 first; overtime: 510 first; hazardous waste fee: 3357 first; wage order: 11090 first', () => {
    expect(top('do I have to reimburse techs for their tools', 1)).toEqual(['2802']);
    expect(top('tech worked ten hours today, what is the overtime', 1)).toEqual(['510']);
    expect(top('hazardous waste disposal fee on the estimate', 1)).toEqual(['3357']);
    expect(top('which wage order covers a body shop', 1)).toEqual(['11090']);
  });
  test('an exact cite short-circuits at 1.0', () => {
    const r = corpus.search('Ins. Code 758.5');
    expect(r.hits[0]!.score).toBe(1);
    expect(r.hits[0]!.breakdown.citation).toBe(1);
  });
  test('the Automotive Repair Act and the Fair Claims regulations list as chapters', () => {
    const act = corpus.search('Automotive Repair Act', { limit: 20 });
    expect(act.chapterListing).toBe(true);
    expect(act.hits.length).toBe(14);
    const fcspr = corpus.search('Fair Claims Settlement Practices Regulations', { limit: 20 });
    expect(fcspr.chapterListing).toBe(true);
    expect(fcspr.hits.length).toBe(13);
  });
});

describe('CaAdapter as a SourceAdapter', () => {
  const adapter = new CaAdapter(corpus);

  test('getById round-trips the mixed-case id namespace', async () => {
    const item = await adapter.getById('cal. ins. code:758.5');
    expect(item?.metadata.record.cite).toBe('758.5');
    const reg = await adapter.getById('16 ccr:3365');
    expect(reg?.metadata.record.cite).toBe('3365');
  });

  test('sectionToItem title starts with the display cite', () => {
    const section = corpus.getSection('Cal. Ins. Code 758.5')!;
    const item = adapter.sectionToItem(section);
    expect(item.title.startsWith(displayCite(section))).toBe(true);
  });
});
