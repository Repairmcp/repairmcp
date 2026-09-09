import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/fl-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/fl-annotations.json' with { type: 'json' };
import { FlAdapter } from '../src/adapter.js';
import { FlCorpus } from '../src/corpus.js';
import { FL_STATUTES_EDITION, displayCite } from '../src/identity.js';
import { FL_TOPICS } from '../src/taxonomy.js';

const corpus = new FlCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all three domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(10);
    expect(domains.repair_law).toBeGreaterThan(20);
    expect(domains.employment).toBeGreaterThan(10);
    expect(domains.safety).toBeUndefined();
  });
  test('the statutes edition is pinned — a rollover fails here before it ships', () => {
    expect((corpus.meta as { statutesEdition?: string }).statutesEdition).toBe(FL_STATUTES_EDITION);
  });
  test('statutes carry no effective date and a session-law history; rules carry both a date and a notice id', () => {
    for (const s of corpus.sections) {
      expect(s.text, `${displayCite(s)} replacement chars`).not.toContain('�');
      if (s.code === 'Fla. Stat.') {
        expect(s.effectiveDate).toBeUndefined();
        expect(s.historyNote).toMatch(/^History\.—/);
        expect(s.facNoticeId).toBeUndefined();
        expect(s.heading.endsWith('.')).toBe(true);
      } else {
        expect(s.effectiveDate, `${displayCite(s)} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.historyNote, `${displayCite(s)} history`).toMatch(/Rulemaking Authority/);
        expect(s.facNoticeId, `${displayCite(s)} notice`).toMatch(/^\d+$/);
      }
    }
  });
  test('cross-reference anchors were stripped without inserting spaces', () => {
    expect(corpus.getSection('559.905')?.text).toContain('s. 559.909(1)');
    expect(corpus.getSection('319.30')?.text).toContain('s. 713.78(11)');
    expect(corpus.getSection('69B-220.201')?.historyNote).toContain('624.308, 626.878, 626.9611(1) FS.');
  });
  test('the motor vehicle claims statute is captured verbatim', () => {
    expect(corpus.getSection('626.9743')?.text).toContain('at least equivalent in kind and quality');
    expect(corpus.getSection('626.9743')?.text).toContain('72 hours for the insured to remove the vehicle');
  });
  test('the 80 percent total loss test is captured verbatim', () => {
    expect(corpus.getSection('319.30')?.text).toContain('is 80 percent or more of the cost to the owner');
  });
  test('the 2025 adjuster ethics amendment is the version captured, and its (3)(m) is residential-only', () => {
    const s = corpus.getSection('69B-220.201');
    expect(s?.effectiveDate).toBe('2025-04-21');
    expect(s?.text).toContain('This paragraph only applies to residential coverage described in s. 627.4025(1), F.S.');
  });
  test('the settlement-payment statute carries its 12 percent interest', () => {
    expect(corpus.getSection('627.4265')?.text).toContain('interest at a rate of 12 percent per year');
  });
  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const topic of FL_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });
  test('getSection tolerates every citation spelling', () => {
    for (const input of ['Fla. Stat. 626.9743', 'Florida Statutes 626.9743', 'F.S. 626.9743', 's. 626.9743', '§626.9743', 'fla. stat.:626.9743', '626.9743', 'Fla. Stat. § 626.9743.']) {
      expect(corpus.getSection(input)?.cite, input).toBe('626.9743');
    }
    for (const input of ['Fla. Admin. Code 69B-220.201', 'Fla. Admin. Code R. 69B-220.201', 'F.A.C. 69B-220.201', 'Rule 69B-220.201', '69B-220.201', 'fla. admin. code:69B-220.201', 'Adjuster Code of Ethics']) {
      expect(corpus.getSection(input)?.cite, input).toBe('69B-220.201');
    }
    expect(corpus.getSection('Fla. Stat. 999.999')).toBeNull();
  });
  test('the named acts list their chapters', () => {
    const act = corpus.search('Motor Vehicle Repair Act', { limit: 20 });
    expect(act.hits.length).toBe(14);
    expect(act.hits.every((h) => h.section.chapter === '559, pt. IX')).toBe(true);
    expect(corpus.search('FDUTPA').hits.map((h) => h.section.cite).sort()).toEqual(['501.204', '501.211']);
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

  test('shop choice: 626.9743 leads — the restoration duty is the honest Florida answer', () => {
    expect(top('insurer says the customer has to use their shop', 1)).toEqual(['626.9743']);
  });
  test('adjuster kickback steering: 69B-220.201 first', () => {
    expect(top('adjuster is referring customers to a shop that pays him for the referrals', 1)).toEqual(['69B-220.201']);
  });
  test('aftermarket parts pushed: the disclosure statute and the kind-and-quality rule are the top two', () => {
    const t = top('carrier wrote the estimate with aftermarket parts', 2);
    expect(t).toContain('501.33');
    expect(t).toContain('626.9743');
    expect(top('insurer requires used or aftermarket parts not equivalent in kind and quality', 1)).toEqual(['626.9743']);
  });
  test('total loss lowball: 626.9743 in the top two; the legal threshold: 319.30 first', () => {
    expect(top('insurer lowballed the actual cash value on the total loss', 2)).toContain('626.9743');
    expect(top('when is it legally a total loss in Florida', 1)).toEqual(['319.30']);
  });
  test('storage cut off: 626.9743 first', () => {
    expect(top('insurer cut off storage payments without notice', 1)).toEqual(['626.9743']);
  });
  test('estimate copy: 626.9743 in the top three', () => {
    expect(top('carrier will not send the customer a copy of their estimate', 3)).toContain('626.9743');
  });
  test('claim dragging: the catalog or the prompt-investigation rule in the top three', () => {
    const t = top('claim dragging with no acknowledgment from the carrier', 3);
    expect(t.some((c) => c === '626.9541' || c === '69O-166.024')).toBe(true);
  });
  test('settled but not paid: 627.4265 first', () => {
    expect(top('claim settled in writing but the check has not come', 1)).toEqual(['627.4265']);
  });
  test('the Florida headliner: bad faith reaches 624.155 first', () => {
    expect(top('can I sue the insurer for bad faith', 1)).toEqual(['624.155']);
  });
  test('written estimate: 559.905 first', () => {
    expect(top('when do I have to give a written estimate', 1)).toEqual(['559.905']);
  });
  test('customer will not pay: 559.909, 713.58, or 713.585 in the top three; selling it: 713.585 first', () => {
    const t = top('customer will not pay for the repair and the car is sitting here, can I hold it', 3);
    expect(t.some((c) => c === '713.58' || c === '559.909' || c === '713.585')).toBe(true);
    expect(top('can I sell an abandoned vehicle the customer never picked up', 1)).toEqual(['713.585']);
  });
  test('charges over the estimate: 559.909 first', () => {
    expect(top('customer did not authorize the additional repairs beyond the original estimate', 1)).toEqual(['559.909']);
  });
  test('towing and storage charges: 713.78 first', () => {
    expect(top('what can a tow company charge for storage', 1)).toEqual(['713.78']);
  });
  test('registration: 559.904 first', () => {
    expect(top('do I have to register my body shop with the state', 1)).toEqual(['559.904']);
  });
  test('1099 tech and comp: 440.02 or 440.10 in the top three; stop-work order: 440.107 first', () => {
    const t = top('is my 1099 tech an employee or an independent contractor for workers comp', 3);
    expect(t.some((c) => c === '440.02' || c === '440.10')).toBe(true);
    expect(top('state shut the shop down with a stop-work order for no workers comp', 1)).toEqual(['440.107']);
  });
  test('minimum wage: 448.110 first', () => {
    expect(top('what is the Florida minimum wage', 1)).toEqual(['448.110']);
  });
  test('windshield deductible: 627.7288 first', () => {
    expect(top('does the deductible apply to windshield replacement', 1)).toEqual(['627.7288']);
  });
  test('exact cite short-circuits to 1.0', () => {
    const r = corpus.findSupporting('Fla. Stat. 559.909');
    expect(r.hits[0]?.section.cite).toBe('559.909');
    expect(r.hits[0]?.score).toBe(1);
  });
});

describe('the adapter', () => {
  const adapter = new FlAdapter(corpus);
  test('fetches a section by id with its citation short form', async () => {
    const item = await adapter.getById('fla. stat.:626.9743');
    expect(item?.title).toContain('626.9743');
    expect(adapter.formatCitation(item!).shortForm).toBe('Fla. Stat. 626.9743, 2026 edition');
    // No effective date on a statute: lastUpdated falls back to the corpus cutoff.
    expect(item?.lastUpdated.toISOString().slice(0, 10)).toBe(corpus.meta.currentThrough);
  });
  test('rule citations carry the effective date', async () => {
    const item = await adapter.getById('fla. admin. code:69B-220.201');
    expect(adapter.formatCitation(item!).shortForm).toBe('Fla. Admin. Code 69B-220.201, effective 4/21/2025');
    expect(item?.lastUpdated.toISOString()).toBe('2025-04-21T00:00:00.000Z');
  });
});
