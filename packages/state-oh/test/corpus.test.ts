import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/oh-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/oh-annotations.json' with { type: 'json' };
import { OhAdapter } from '../src/adapter.js';
import { OhCorpus } from '../src/corpus.js';
import { displayCite } from '../src/identity.js';
import { OH_CONST_CITE } from '../src/sources.js';
import { OH_TOPICS } from '../src/taxonomy.js';

const corpus = new OhCorpus(corpusJson, annotationsJson);
const top = (q: string, n: number) => corpus.findSupporting(q).hits.slice(0, n).map((h) => displayCite(h.section));

describe('the committed corpus', () => {
  test('51 sections, four domains', () => {
    const d = corpus.domainBreakdown();
    expect(d.insurance).toBe(9); expect(d.repair_law).toBe(16); expect(d.employment).toBe(17); expect(d.safety).toBe(9);
  });
  test('meta records the newest effective date and nothing rolls', () => {
    expect((corpus.meta as { newestEffectiveDate?: string }).newestEffectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('every section states its capture surface and an effective date; ORC carries Latest Legislation; no control chars or notice lines', () => {
    for (const s of corpus.sections) {
      expect(s.text, `${displayCite(s)} replacement or control chars`).not.toMatch(/[\u0080-\u009f\ufffd]/);
      expect(s.text, `${displayCite(s)} notice line`).not.toMatch(/Last updated [A-Z][a-z]+ \d/);
      expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['chapter', 'section']).toContain(s.captureSource);
      if (s.code === 'ORC') expect(s.latestLegislation, displayCite(s)).toMatch(/General Assembly$/);
      else expect(s.latestLegislation).toBeUndefined();
    }
  });
  test('the status notes are exactly the two the kickoff saw', () => {
    const noted = corpus.sections.filter((s) => s.statusNote).map((s) => `${displayCite(s)}: ${s.statusNote}`);
    expect(noted).toEqual([
      "ORC 4513.60: Governor's veto not reflected; see H.B. 434 status report",
      "ORC 4513.61: Governor's veto not reflected; see H.B. 434 status report",
    ]);
  });
  test('headliners are captured verbatim', () => {
    expect(corpus.getSection('OAC 3901-1-54')?.text).toContain('name of at least one repair shop that will make the repairs for the amount of the written estimate');
    expect(corpus.getSection('OAC 3901-1-54')?.text).toContain('prior to termination of payment for automobile storage charges');
    expect(corpus.getSection('OAC 109:4-3-13')?.text).toContain('ten per cent or more (excluding tax) of the original estimate');
    expect(corpus.getSection('ORC 1345.81')?.text).toContain('This estimate has been prepared based upon the use of one or more aftermarket crash parts');
    expect(corpus.getSection('ORC 4505.101')?.text).toContain('less than three thousand five hundred dollars');
    expect(corpus.getSection('ORC 1333.41')?.text).toContain('does not apply to a bailee for hire who performs any service or provides any materials with respect to motor vehicles');
    expect(corpus.getSection('ORC 4113.15')?.text).toContain('six per cent of the amount of the claim still unpaid');
    expect(corpus.getSection('ORC 4121.47')?.text).toContain('No employer shall violate a specific safety rule');
    expect(corpus.getSection(`Ohio Const. ${OH_CONST_CITE}`)?.heading).toBe('Minimum Wage');
    expect(corpus.getSection('OAC 109:4-3-13')?.effectiveDate).toBe('2026-03-21');
  });
  test('the excluded sections are not in the corpus', () => {
    for (const q of ['OAC 1301:7-7-24', 'ORC 4921.25', 'ORC 3937.30', 'ORC 4505.181']) expect(corpus.getSection(q), q).toBeNull();
  });
  test('every topic reaches at least one section', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const t of OH_TOPICS) expect(reachable.has(t), `topic ${t}`).toBe(true);
  });
  test('named listings', () => {
    expect(corpus.search('CSPA', { limit: 20 }).hits.length).toBe(6);
    expect(corpus.search('Chapter 4513', { limit: 20 }).hits.length).toBe(5);
    expect(corpus.search('VSSR', { limit: 20 }).hits.length).toBe(6);
    expect(corpus.search("Workers' Compensation Act", { limit: 20 }).hits.length).toBe(6);
    expect(corpus.search('Chapter 3901-1', { limit: 20 }).hits.length).toBe(2);
  });
});

describe('launch demo criteria — the gauntlet (shop phrasing; fixes go in annotations, never weights)', () => {
  test("can't repair it for the insurer's number: 3901-1-54 first with the (H)(1) excerpt", () => {
    const r = corpus.findSupporting("insurer wrote it for 20 hours and I can't repair it for that");
    expect(displayCite(r.hits[0]!.section)).toBe('OAC 3901-1-54');
    expect(r.hits[0]!.annotation?.quoteSafeExcerpts?.some((e) => e.includes('name of at least one repair shop'))).toBe(true);
  });
  test('steering: 3901-1-54 first', () => {
    expect(top('the adjuster told my customer to take it to their DRP shop', 1)).toEqual(['OAC 3901-1-54']);
  });
  test('storage cut off: 3901-1-54 first', () => {
    expect(top('insurer cut off storage on the total loss with no notice', 1)).toEqual(['OAC 3901-1-54']);
  });
  test('total loss: 3901-1-54 first, 4505.11 top 3; salvage title: 4505.11 first', () => {
    const t = top('they lowballed the total loss value', 3);
    expect(t[0]).toBe('OAC 3901-1-54');
    expect(t).toContain('ORC 4505.11');
    expect(top('total loss, does it need a salvage title', 1)).toEqual(['ORC 4505.11']);
  });
  test('betterment: 3901-1-54 first', () => {
    expect(top('betterment on tires and a battery', 1)).toEqual(['OAC 3901-1-54']);
  });
  test('aftermarket parts undisclosed: 1345.81 first, 3901-1-54 top 3', () => {
    const t = top('aftermarket parts on the estimate and the customer never knew', 3);
    expect(t[0]).toBe('ORC 1345.81');
    expect(t).toContain('OAC 3901-1-54');
  });
  test('acknowledgment, decision, and denial deadlines', () => {
    expect(top("insurer hasn't acknowledged the claim in three weeks", 1).some((c) => c === 'OAC 3901-1-54' || c === 'OAC 3901-1-07')).toBe(true);
    expect(top('no decision on the claim after a month', 1)).toEqual(['OAC 3901-1-54']);
    expect(top('denied with no reason given', 1)).toEqual(['OAC 3901-1-07']);
  });
  test('bad faith: 3901.22 top 3, 3901.20 top 3', () => {
    const t = top('can I sue the insurer for bad faith', 3);
    expect(t).toContain('ORC 3901.22');
    expect(t).toContain('ORC 3901.20');
  });
  test("the shop's obligations: 109:4-3-13 first four ways", () => {
    expect(top('do I need written authorization before I start the repair', 1)).toEqual(['OAC 109:4-3-13']);
    expect(top('job ran ten percent over the estimate', 1)).toEqual(['OAC 109:4-3-13']);
    expect(top('customer wants his old parts back', 1)).toEqual(['OAC 109:4-3-13']);
    expect(top("can I charge for teardown if they don't approve the repair", 1)).toEqual(['OAC 109:4-3-13']);
  });
  test('a car never picked up: 4505.101 first, 4513.60 top 3; the expensive car: 4513.60 top 3 with 1333.41 in the top 5', () => {
    const t = top("customer never picked the car up, it's been a month", 3);
    expect(t[0]).toBe('ORC 4505.101');
    expect(t).toContain('ORC 4513.60');
    const big = top('the car is worth ten grand and the customer abandoned it, can I take title', 5);
    expect(big.slice(0, 3)).toContain('ORC 4513.60');
    expect(big).toContain('ORC 1333.41');
  });
  test('final paycheck and late wages: 4113.15 first', () => {
    expect(top('tech quit Friday, when do I have to pay him', 1)).toEqual(['ORC 4113.15']);
    expect(top('wages 30 days late', 1)).toEqual(['ORC 4113.15']);
  });
  test('comeback or broken tool chargeback: 4113.19 first', () => {
    expect(top("deducting a comeback or a broken tool from a tech's pay", 1)).toEqual(['ORC 4113.19']);
  });
  test('overtime: 4111.03 first, 4111.031 top 3; minimum wage: the Constitution first, 4111.02 top 3', () => {
    const t = top('overtime for a flat-rate tech', 3);
    expect(t[0]).toBe('ORC 4111.03');
    expect(t).toContain('ORC 4111.031');
    const mw = top("what's minimum wage this year", 3);
    expect(mw[0]).toBe(`Ohio Const. ${OH_CONST_CITE}`);
    expect(mw).toContain('ORC 4111.02');
  });
  test('1099 tech with no comp policy: 4123.35 first, 4123.75 or 4123.77 top 3', () => {
    const t = top('1099 tech, no comp policy', 3);
    expect(t[0]).toBe('ORC 4123.35');
    expect(t.some((c) => c === 'ORC 4123.75' || c === 'ORC 4123.77')).toBe(true);
  });
  test('VSSR: 4121.47 first, 4123:1-5-12 top 3', () => {
    const t = top('tech got hurt on a grinder with no guard, BWC says VSSR', 3);
    expect(t[0]).toBe('ORC 4121.47');
    expect(t).toContain('OAC 4123:1-5-12');
  });
  test('respirators, the air permit, and VOC coatings', () => {
    expect(top('respirators for the painter', 1)).toEqual(['OAC 4123:1-5-17']);
    expect(top('do I need an air permit for my booth', 1)).toEqual(['OAC 3745-31-30']);
    expect(top('VOC limits on refinish coatings', 1)).toEqual(['OAC 3745-21-18']);
  });
  test('exact cite short-circuits to 1.0', () => {
    for (const q of ['OAC 3901-1-54', 'R.C. § 4505.101', 'Ohio Adm.Code 109:4-3-13', 'Article II, Section 34a', 'ORC 4121.47']) {
      expect(corpus.findSupporting(q).hits[0]?.score, q).toBe(1);
    }
    expect(corpus.findSupporting('R.C. § 4505.101').hits[0]?.section.cite).toBe('4505.101');
  });
});

describe('the adapter', () => {
  const adapter = new OhAdapter(corpus);
  test('citation short forms by code', async () => {
    expect(adapter.formatCitation((await adapter.getById('oac:3901-1-54'))!).shortForm).toBe('OAC 3901-1-54, effective 2/14/2022');
    expect(adapter.formatCitation((await adapter.getById('orc:4505.101'))!).shortForm).toBe('ORC 4505.101, effective 4/7/2023');
    expect(adapter.formatCitation((await adapter.getById('oac:109:4-3-13'))!).shortForm).toBe('OAC 109:4-3-13, effective 3/21/2026');
    expect(adapter.formatCitation((await adapter.getById(`ohio const.:${OH_CONST_CITE}`))!).shortForm).toBe('Ohio Const. art. II, § 34a, effective 12/8/2006');
  });
  test('getById accepts any citation spelling and the status note rides along', async () => {
    expect((await adapter.getById('Ohio Rev. Code § 4113.15'))?.metadata.record.cite).toBe('4113.15');
    expect((await adapter.getById('ORC 4513.60'))?.metadata.record.statusNote).toContain("Governor's veto");
  });
});
