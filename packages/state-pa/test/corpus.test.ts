import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/pa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/pa-annotations.json' with { type: 'json' };
import { PaAdapter } from '../src/adapter.js';
import { PaCorpus } from '../src/corpus.js';
import { newestActAmendmentDate } from '../src/history-dates.js';
import { displayCite } from '../src/identity.js';
import { PA_TOPICS } from '../src/taxonomy.js';

const corpus = new PaCorpus(corpusJson, annotationsJson);
const top = (q: string, n: number) => corpus.findSupporting(q).hits.slice(0, n).map((h) => displayCite(h.section));

describe('the committed corpus', () => {
  test('89 sections, three domains, no safety', () => {
    const d = corpus.domainBreakdown();
    expect(d.insurance).toBe(37); expect(d.repair_law).toBe(19); expect(d.employment).toBe(33); expect(d.safety).toBeUndefined();
  });
  test('meta records the Pennsylvania Code currency sentence', () => {
    expect((corpus.meta as { paCodeEffectiveThrough?: string }).paCodeEffectiveThrough).toMatch(/^\d+ Pa\.B\. \d+ \(.+\)$/);
  });
  test('every section states its capture surface, its heading source, and the dates the kickoff promises', () => {
    for (const s of corpus.sections) {
      expect(s.text, `${displayCite(s)} replacement or control chars`).not.toMatch(/[\u0080-\u009f\ufffd]/);
      if (s.code.endsWith('Pa.C.S.')) { expect(s.captureSource).toBe('legis'); expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(s.dateKind).toBeUndefined(); }
      if (s.code.endsWith('P.S.')) { expect(s.captureSource).toBe('legis'); expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(s.dateKind).toMatch(/^(amended|enacted)$/); expect(s.actSection).toBeDefined(); }
      if (s.code.endsWith('Pa. Code')) { expect(s.captureSource).toBe('pacode'); expect(s.actSection).toBeUndefined(); }
      expect(s.headingSource).toBe(s.code === '77 P.S.' ? 'manifest' : 'source');
    }
  });
  test('every act citation dated "amended" states the dating note in historyNote; "enacted" ones state none', () => {
    for (const s of corpus.sections) {
      if (s.dateKind === 'amended') {
        // The audit field must contain the note the date came from. The date
        // is computed over the body text AND the standalone notes, so a
        // historyNote built from the standalone notes alone was absent on
        // three of these and named an older act on five more.
        expect(newestActAmendmentDate(s.historyNote ?? ''), `${displayCite(s)} historyNote`).toBe(s.effectiveDate);
      }
      if (s.dateKind === 'enacted') expect(s.historyNote, `${displayCite(s)}`).toBeUndefined();
    }
  });
  test('headliners are captured verbatim', () => {
    expect(corpus.getSection('31 Pa. Code 62.3')?.text).toContain('no requirement to use any specified repair shop');
    expect(corpus.getSection('63 P.S. 861')?.text).toContain('require that repairs be made in any specified repair shop');
    expect(corpus.getSection('31 Pa. Code 146.8')?.text).toContain('betterment or depreciation');
    expect(corpus.getSection('42 Pa.C.S. 8371')?.text).toContain('prime rate of interest plus 3%');
    expect(corpus.getSection('37 Pa. Code 301.5')?.text).toContain('storage charges');
    expect(corpus.getSection('75 Pa.C.S. 7311')?.text).toContain('15 consecutive days');
    expect(corpus.getSection('43 P.S. 260.10')?.text).toContain('thirty days beyond the regularly scheduled payday');
    expect(corpus.getSection('37 Pa. Code 301.5')?.effectiveDate).toBeUndefined();
    expect(corpus.getSection('37 Pa. Code 301.5')?.heading).toBe('General provisions—repair shop.');
  });
  test('the excluded sections are not in the corpus', () => {
    for (const q of ['31 Pa. Code 62.4', '75 Pa.C.S. 1165.2', '34 Pa. Code 231.81', '75 Pa.C.S. 102']) expect(corpus.getSection(q), q).toBeNull();
  });
  test('every topic reaches at least one section', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const t of PA_TOPICS) expect(reachable.has(t), `topic ${t}`).toBe(true);
  });
  test('named listings', () => {
    expect(corpus.search('UIPA', { limit: 20 }).hits.length).toBe(7);
    expect(corpus.search('Chapter 146', { limit: 20 }).hits.length).toBe(10);
    expect(corpus.search('Appraiser Act', { limit: 20 }).hits.length).toBe(8);
    expect(corpus.search('WPCL', { limit: 20 }).hits.length).toBe(10);
    expect(corpus.search('abandoned vehicles', { limit: 20 }).hits.length).toBe(8);
  });
  test('no quote-safe excerpt straddles an inline subsection note', () => {
    for (const [key, annotation] of Object.entries(annotationsJson as Record<string, { quoteSafeExcerpts?: string[] }>)) {
      for (const excerpt of annotation.quoteSafeExcerpts ?? []) {
        expect(excerpt, `${key}: excerpt crosses an inline "((x) amended …, P.L.…)" note`).not.toContain('P.L.');
      }
    }
  });
});

describe('launch demo criteria — the gauntlet (shop phrasing; fixes go in annotations, never weights)', () => {
  test('steering: 62.3 first, 861 top 3', () => {
    const t = top('the adjuster told my customer to take it to their DRP shop', 3);
    expect(t[0]).toBe('31 Pa. Code 62.3');
    expect(t).toContain('63 P.S. 861');
  });
  test('appraisal too low to repair: 146.8 first, 62.3 top 3', () => {
    const t = top("insurer wrote it for 20 hours and I can't repair it for that", 3);
    expect(t[0]).toBe('31 Pa. Code 146.8');
    expect(t).toContain('31 Pa. Code 62.3');
  });
  test('the appraiser has not come out: 861 first', () => {
    expect(top("appraiser hasn't come out to look at the car in a week", 1)).toEqual(['63 P.S. 861']);
  });
  test('aftermarket parts undisclosed: 62.3 first', () => {
    expect(top('aftermarket parts on the estimate and the customer never knew', 1)).toEqual(['31 Pa. Code 62.3']);
  });
  test('total loss: 62.3 first, 146.8 top 3; salvage value disclosure: 62.3 first', () => {
    const t = top('they lowballed the total loss value', 3);
    expect(t[0]).toBe('31 Pa. Code 62.3');
    expect(t).toContain('31 Pa. Code 146.8');
    expect(top('do they have to tell the customer the salvage value', 1)).toEqual(['31 Pa. Code 62.3']);
  });
  test('betterment: 146.8 first', () => {
    expect(top('betterment on tires and a battery', 1)).toEqual(['31 Pa. Code 146.8']);
  });
  test('acknowledgment, decision, and denial deadlines', () => {
    expect(top("insurer hasn't even acknowledged the claim, two weeks", 1)).toEqual(['31 Pa. Code 146.5']);
    expect(top('no decision after a month', 1).some((c) => c === '31 Pa. Code 146.7' || c === '31 Pa. Code 146.6')).toBe(true);
    expect(top('denied with no reason given', 1)).toEqual(['31 Pa. Code 146.7']);
  });
  test('third-party claimant pushed onto their own policy: 146.8 first', () => {
    expect(top('third-party claimant, adjuster told him to go through his own policy', 1)).toEqual(['31 Pa. Code 146.8']);
  });
  test('bad faith: 8371 first, 1171.5 top 3', () => {
    const t = top('can I sue the insurer for bad faith', 3);
    expect(t[0]).toBe('42 Pa.C.S. 8371');
    expect(t).toContain('40 P.S. 1171.5');
  });
  test('the shop\'s obligations: 301.5 first three ways', () => {
    expect(top('do I need written authorization before I start the repair', 1)).toEqual(['37 Pa. Code 301.5']);
    expect(top('can I charge storage, do I have to post it', 1)).toEqual(['37 Pa. Code 301.5']);
    expect(top('customer wants his old parts back', 1)).toEqual(['37 Pa. Code 301.5']);
  });
  test('a car never picked up: 7311 first, 7306 or 7308 top 3', () => {
    const t = top("customer never picked the car up, it's been a month", 3);
    expect(t[0]).toBe('75 Pa.C.S. 7311');
    expect(t.some((c) => c === '75 Pa.C.S. 7306' || c === '75 Pa.C.S. 7308')).toBe(true);
  });
  test('salvage title: 1161 first; rebuilt: 1165 top 3', () => {
    expect(top('total loss, does it need a salvage title', 1)).toEqual(['75 Pa.C.S. 1161']);
    expect(top('rebuilt a salvage car, what does it need before it goes back on the road', 3)).toContain('75 Pa.C.S. 1165');
  });
  test('final paycheck: 260.5 first; late wages: 260.10 first', () => {
    expect(top('tech quit Friday, when do I have to pay him', 1)).toEqual(['43 P.S. 260.5']);
    expect(top('wages 30 days late', 1)).toEqual(['43 P.S. 260.10']);
  });
  test('overtime: 333.104 first, 231.43 top 3', () => {
    const t = top('overtime for a salaried estimator', 3);
    expect(t[0]).toBe('43 P.S. 333.104');
    expect(t).toContain('34 Pa. Code 231.43');
  });
  test('comeback chargeback: 9.1 first', () => {
    expect(top("deducting a comeback from a tech's pay", 1)).toEqual(['34 Pa. Code 9.1']);
  });
  test('1099 tech with no comp policy: 501 first, 22 top 3', () => {
    const t = top('1099 tech, no comp policy', 3);
    expect(t[0]).toBe('77 P.S. 501');
    expect(t).toContain('77 P.S. 22');
  });
  test('exact cite short-circuits to 1.0', () => {
    for (const q of ['31 Pa. Code § 62.3', '42 Pa.C.S. § 8371', '43 P.S. § 260.5', '77 P.S. § 481']) {
      const r = corpus.findSupporting(q);
      expect(r.hits[0]?.score, q).toBe(1);
    }
    expect(corpus.findSupporting('31 Pa. Code § 62.3').hits[0]?.section.cite).toBe('62.3');
  });
});

describe('the adapter', () => {
  const adapter = new PaAdapter(corpus);
  test('citation short forms by code', async () => {
    expect(adapter.formatCitation((await adapter.getById('42 pa.c.s.:8371'))!).shortForm).toBe('42 Pa.C.S. 8371, effective 7/1/1990');
    expect(adapter.formatCitation((await adapter.getById('31 pa. code:62.3'))!).shortForm).toBe('31 Pa. Code 62.3, effective 10/23/1999');
    expect(adapter.formatCitation((await adapter.getById('43 p.s.:260.5'))!).shortForm).toBe('43 P.S. 260.5, amended 7/14/1977');
    expect(adapter.formatCitation((await adapter.getById('37 pa. code:301.5'))!).shortForm).toBe('37 Pa. Code 301.5');
  });
  test('getById accepts any citation spelling', async () => {
    expect((await adapter.getById('section 11 of the Appraiser Act'))?.metadata.record.cite).toBe('861');
  });
});
