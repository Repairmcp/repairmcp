import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/ny-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/ny-annotations.json' with { type: 'json' };
import { NyAdapter } from '../src/adapter.js';
import { NyCorpus } from '../src/corpus.js';
import { NY_CR82_EDITION, displayCite } from '../src/identity.js';
import { NY_TOPICS } from '../src/taxonomy.js';

const corpus = new NyCorpus(corpusJson, annotationsJson);
const top = (q: string, n: number) => corpus.findSupporting(q).hits.slice(0, n).map((h) => displayCite(h.section));

describe('the committed corpus', () => {
  test('95 sections, three domains, no safety', () => {
    const d = corpus.domainBreakdown();
    expect(d.insurance).toBe(22); expect(d.repair_law).toBe(34); expect(d.employment).toBe(39); expect(d.safety).toBeUndefined();
  });
  test('the CR-82 edition is pinned', () => {
    expect((corpus.meta as { cr82Edition?: string }).cr82Edition).toBe(NY_CR82_EDITION);
  });
  test('every section states its capture surface and the dates the kickoff promises', () => {
    for (const s of corpus.sections) {
      expect(s.text, `${displayCite(s)} replacement chars`).not.toContain('�');
      if (s.code.startsWith('N.Y. ')) { expect(s.captureSource).toBe('senate'); expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(s.text.startsWith(`§ ${s.cite.toLowerCase()}`) || s.text.startsWith(`§ ${s.cite}`)).toBe(true); }
      if (s.code === '11 NYCRR') expect(s.captureSource).toBe('lii');
      if (s.code === '15 NYCRR') { expect(s.captureSource).toBe('dmv'); expect(s.effectiveDate).toBeUndefined(); expect(s.historyNote).toBe(NY_CR82_EDITION); }
      if (s.code === '12 NYCRR') { expect(s.captureSource).toBe('dol'); expect(s.effectiveDate).toBe('2020-06-24'); }
      if (s.code === 'DFS Guidance') { expect(s.captureSource).toBe('dfs'); expect(s.dfsStatus).toMatch(/^(current|withdrawn)$/); }
    }
  });
  test('headliners are captured verbatim', () => {
    expect(corpus.getSection('Labor Law 191')?.text).toContain('A manual worker shall be paid weekly');
    expect(corpus.getSection('Ins. Law 2610')?.text).toContain('require that repairs be made');
    expect(corpus.getSection('11 NYCRR 216.7')?.text).toMatch(/six business days/);
    expect(corpus.getSection('15 NYCRR 82.5')?.text).toContain('estimate in writing');
    expect(corpus.getSection('Circular Letter 16 (2000)')?.dfsWithdrawnDate).toBe('2003-12-04');
  });
  test('216.13 (repealed) is not in the corpus', () => {
    expect(corpus.getSection('11 NYCRR 216.13')).toBeNull();
  });
  test('every topic reaches at least one section', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const t of NY_TOPICS) expect(reachable.has(t), `topic ${t}`).toBe(true);
  });
  test('named listings', () => {
    const reg64 = corpus.search('Regulation 64', { limit: 20 });
    expect(reg64.hits.length).toBe(13);
    expect(corpus.search('Article 12-A', { limit: 20 }).hits.length).toBe(9);
    expect(corpus.search('Part 82', { limit: 30 }).hits.length).toBe(19);
  });
});

describe('launch demo criteria — the gauntlet (shop phrasing; fixes go in annotations, never weights)', () => {
  test('weekly pay: 191 first, 198 top 3', () => {
    expect(top('my painter says he has to be paid every week, is that true', 1)).toEqual(['N.Y. Lab. Law 191']);
    expect(top('we pay techs every two weeks and one of them is threatening to sue', 3)).toContain('N.Y. Lab. Law 198');
  });
  test('steering: 2610 first, the 2004 opinion top 3, the withdrawn letter not top 3', () => {
    const t = top('adjuster is telling the customer to take it to their shop', 3);
    expect(t[0]).toBe('N.Y. Ins. Law 2610');
    expect(t).toContain('DFS Guidance OGC Opinion 04-06-03');
    expect(t).not.toContain('DFS Guidance Circular Letter 16 (2000)');
  });
  test('inspection delay and aftermarket parts: 216.7 first', () => {
    expect(top('insurer has not come out to look at the car in two weeks', 1)).toEqual(['11 NYCRR 216.7']);
    expect(top('carrier wrote the estimate with aftermarket parts on a two year old car', 1)).toEqual(['11 NYCRR 216.7']);
  });
  test('total loss: 216.7 top 2; salvage retention: 3411 or 216.7 top 3', () => {
    expect(top('insurer lowballed the total loss value', 2)).toContain('11 NYCRR 216.7');
    expect(top('they want to keep the car for salvage', 3).some((c) => c === 'N.Y. Ins. Law 3411' || c === '11 NYCRR 216.7')).toBe(true);
  });
  test('acknowledgment and investigation: 216.4 or 216.5 top 3; third-party claimant: 216.10 first', () => {
    expect(top('filed the claim three weeks ago and nobody has acknowledged it', 3).some((c) => c === '11 NYCRR 216.4' || c === '11 NYCRR 216.5')).toBe(true);
    expect(top('our customer is the third party claimant and the other carrier is slow walking the property damage claim', 1)).toEqual(['11 NYCRR 216.10']);
  });
  test('bad faith: 2601 first', () => {
    expect(top('can I sue the insurer for bad faith', 1)).toEqual(['N.Y. Ins. Law 2601']);
  });
  test('written estimate and authorization: 82.5 first, 398-d top 3', () => {
    const t = top('do I need a written estimate and authorization before I start the repair', 3);
    expect(t[0]).toBe('15 NYCRR 82.5');
    expect(t).toContain('N.Y. Veh. & Traf. Law 398-D');
  });
  test('hold the car: 184 first; sell it: 200 or 201 top 3', () => {
    expect(top('customer will not pay, can I keep the car', 1)).toEqual(['N.Y. Lien Law 184']);
    expect(top('how do I sell an abandoned vehicle the customer never paid for', 3).some((c) => c === 'N.Y. Lien Law 200' || c === 'N.Y. Lien Law 201')).toBe(true);
  });
  test('registration: 398-c or 82.3 top 3', () => {
    expect(top('do I have to register my body shop with the state', 3).some((c) => c === 'N.Y. Veh. & Traf. Law 398-C' || c === '15 NYCRR 82.3')).toBe(true);
  });
  test('breaks and rest days: 162 first, 161 first', () => {
    expect(top('lunch breaks for techs', 1)).toEqual(['N.Y. Lab. Law 162']);
    expect(top('can I schedule a tech six days a week every week', 1)).toEqual(['N.Y. Lab. Law 161']);
  });
  test('comeback chargebacks: 193 first; call-in and spread of hours: 142-2.3 / 142-2.4 first', () => {
    expect(top('can I charge a tech for a comeback out of his pay', 1)).toEqual(['N.Y. Lab. Law 193']);
    expect(top('tech showed up and we sent him home, do I owe him anything', 1)).toEqual(['12 NYCRR 142-2.3']);
    expect(top('a twelve hour day spread of hours extra pay', 1)).toEqual(['12 NYCRR 142-2.4']);
  });
  test('1099 tech: WCL 2 or 10 top 3; no comp policy: 52 first', () => {
    expect(top('is my 1099 tech an employee for workers comp', 3).some((c) => c === "N.Y. Workers' Comp. Law 2" || c === "N.Y. Workers' Comp. Law 10")).toBe(true);
    expect(top('what happens if the shop has no workers comp policy', 1)).toEqual(["N.Y. Workers' Comp. Law 52"]);
  });
  test('exact cite short-circuits to 1.0', () => {
    const r = corpus.findSupporting('11 NYCRR 216.7');
    expect(r.hits[0]?.section.cite).toBe('216.7');
    expect(r.hits[0]?.score).toBe(1);
  });
});

describe('the adapter', () => {
  const adapter = new NyAdapter(corpus);
  test('statute citation short form', async () => {
    const item = await adapter.getById('n.y. ins. law:2610');
    expect(adapter.formatCitation(item!).shortForm).toBe('N.Y. Ins. Law 2610, revised 6/23/2017');
  });
  test('Part 82 carries the edition; DFS carries issued/withdrawn', async () => {
    expect(adapter.formatCitation((await adapter.getById('15 nycrr:82.5'))!).shortForm).toBe(`15 NYCRR 82.5, ${NY_CR82_EDITION}`);
    expect(adapter.formatCitation((await adapter.getById('dfs guidance:Circular Letter 16 (2000)'))!).shortForm).toBe('DFS Guidance Circular Letter 16 (2000), issued 5/10/2000, withdrawn 12/4/2003');
  });
});
