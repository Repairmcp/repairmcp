import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureActs } from '../src/capture-acts.js';
import { PA_ACT_SOURCES, actUrl } from '../src/sources-acts.js';
import { actPage } from './parse-act.test.js';

const DATES: Record<number, string> = { 1974: 'Jul. 22, 1974', 1972: 'Dec. 29, 1972', 1968: 'Jan. 17, 1968', 1961: 'Jul. 14, 1961', 1915: 'Jun. 2, 1915' };

/** One synthetic act page per manifest act, every section present; the first section of each act carries a 1977 amendment note. */
export function buildActsIo(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number }> } {
  const pages = new Map<string, string>();
  for (const a of PA_ACT_SOURCES) {
    pages.set(actUrl(a.year, a.actNo), actPage({
      year: a.year, actNo: a.actNo, pl: 100, date: DATES[a.year]!, cl: 1, shortTitle: a.shortTitle,
      sections: a.sections.map((x, i) => ({ n: x.actSection, ...(a.year === 1915 ? {} : { catchline: `Catchline ${x.actSection}.` }), body: [`Body of section ${x.actSection}.`], ...(i === 0 ? { notes: [`(${x.actSection} amended July 14, 1977, P.L.82, No.30)`] } : {}) })),
    }));
  }
  for (const [u, h] of Object.entries(overrides.pages ?? {})) pages.set(u, h);
  const fetched: Array<{ url: string; minDelayMs?: number }> = [];
  return {
    fetched,
    async fetchText(url, o) {
      fetched.push({ url, ...(o?.minDelayMs !== undefined ? { minDelayMs: o.minDelayMs } : {}) });
      const html = pages.get(url);
      if (html === undefined) throw new Error(`fixture missing for ${url}`);
      return html;
    },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('captureActs', () => {
  test('six fetches at the 5 s floor; 41 sections with P.S. cites, act sections, and dateKind', async () => {
    const io = buildActsIo();
    const r = await captureActs(io, PA_ACT_SOURCES);
    expect(io.fetched.length).toBe(6);
    for (const f of io.fetched) expect(f.minDelayMs).toBe(5_000);
    expect(r.sections.length).toBe(41);
    const s260_5 = r.sections.find((s) => s.code === '43 P.S.' && s.cite === '260.5')!;
    expect(s260_5.actSection).toBe('5');
    expect(s260_5.chapter).toBe('Wage Payment and Collection Law');
    expect(s260_5.heading).toBe('Catchline 5.');
    expect(s260_5.headingSource).toBe('source');
    expect(s260_5.dateKind).toBe('enacted');
    expect(s260_5.effectiveDate).toBe('1961-07-14');
    expect(s260_5.historyNote).toBeUndefined();
    const s260_2a = r.sections.find((s) => s.code === '43 P.S.' && s.cite === '260.2a')!;
    expect(s260_2a.dateKind).toBe('amended');
    expect(s260_2a.effectiveDate).toBe('1977-07-14');
    expect(s260_2a.historyNote).toBe('(2.1 amended July 14, 1977, P.L.82, No.30)');
    expect(s260_2a.sourceUrl).toBe(actUrl(1961, 329));
    expect(s260_2a.captureSource).toBe('legis');
  });
  test('the 1915 act takes manifest headings', async () => {
    const r = await captureActs(buildActsIo(), PA_ACT_SOURCES);
    const s = r.sections.find((x) => x.code === '77 P.S.' && x.cite === '481')!;
    expect(s.heading).toBe('Exclusiveness of remedy; third-party actions');
    expect(s.headingSource).toBe('manifest');
    expect(s.actSection).toBe('303');
  });
  test('an inline amendment note in the body dates the section AND is recorded in historyNote', async () => {
    const io = buildActsIo({ pages: { [actUrl(1972, 367)]: actPage({ year: 1972, actNo: 367, pl: 1713, date: 'Dec. 29, 1972', cl: 63, shortTitle: 'Motor Vehicle Physical Damage Appraiser Act',
      sections: PA_ACT_SOURCES[1]!.sections.map((x) => ({ n: x.actSection, catchline: `C ${x.actSection}.`,
        body: x.actSection === '11' ? ['(d) No appraiser shall require repairs in any specified shop. ((d) amended Apr. 14, 2016, P.L.79, No.13)'] : ['x'],
        // The real 63 P.S. 861 shape: the dating note is INLINE and the
        // standalone note names an OLDER act. Recording only the standalone
        // one left the audit field contradicting the citation's own date.
        ...(x.actSection === '11' ? { notes: ['(11 amended June 24, 1996, P.L.350, No.57)'] } : {}) })) }) } });
    const r = await captureActs(io, PA_ACT_SOURCES);
    const s = r.sections.find((x) => x.code === '63 P.S.' && x.cite === '861')!;
    expect(s.effectiveDate).toBe('2016-04-14');
    expect(s.dateKind).toBe('amended');
    expect(s.historyNote).toBe('((d) amended Apr. 14, 2016, P.L.79, No.13) (11 amended June 24, 1996, P.L.350, No.57)');
    expect(s.historyNote).toContain('Apr. 14, 2016');
  });
  test('a named act section that captures no body text fails by name', async () => {
    const io = buildActsIo({ pages: { [actUrl(1961, 329)]: actPage({ year: 1961, actNo: 329, pl: 637, date: 'Jul. 14, 1961', cl: 43, shortTitle: 'Wage Payment and Collection Law',
      sections: PA_ACT_SOURCES.find((a) => a.actNo === 329)!.sections.map((x) => ({ n: x.actSection, catchline: `C ${x.actSection}.`, body: x.actSection === '5' ? [] : ['x'] })) }) } });
    await expect(captureActs(io, PA_ACT_SOURCES)).rejects.toThrow(/43 P\.S\. 260\.5 .*captured no body text from the Act 329 of 1961 page/);
  });
  test('a title line whose act number or year disagrees with the manifest fails by name', async () => {
    const io = buildActsIo({ pages: { [actUrl(1961, 329)]: actPage({ year: 1961, actNo: 330, pl: 1, date: 'Jul. 14, 1961', cl: 43, shortTitle: 'X', sections: [{ n: '5', catchline: 'C.', body: ['x'] }] }) } });
    await expect(captureActs(io, PA_ACT_SOURCES)).rejects.toThrow(/Act 329 of 1961.*prints No\. 330/);
  });
  test('an absent or repealed act section fails by name', async () => {
    const absent = buildActsIo({ pages: { [actUrl(1968, 5)]: actPage({ year: 1968, actNo: 5, pl: 11, date: 'Jan. 17, 1968', cl: 43, shortTitle: 'The Minimum Wage Act of 1968', sections: [{ n: '3', catchline: 'Definitions.', body: ['x'] }] }) } });
    await expect(captureActs(absent, PA_ACT_SOURCES)).rejects.toThrow(/43 P\.S\. 333\.104 \(section 4 of The Minimum Wage Act of 1968\).*absent/);
    const repealed = buildActsIo({ pages: { [actUrl(1974, 205)]: actPage({ year: 1974, actNo: 205, pl: 589, date: 'Jul. 22, 1974', cl: 40, shortTitle: 'Unfair Insurance Practices Act', sections: PA_ACT_SOURCES[0]!.sections.map((x) => ({ n: x.actSection, catchline: `C ${x.actSection}.`, body: x.actSection === '9' ? [`(9 repealed Apr. 28, 1978, P.L.202, No.53)`] : ['x'] })) }) } });
    await expect(captureActs(repealed, PA_ACT_SOURCES)).rejects.toThrow(/1171\.9 .*repealed/);
  });
  test('a modern act section with no catchline and no manifest heading fails by name', async () => {
    const io = buildActsIo({ pages: { [actUrl(1974, 205)]: actPage({ year: 1974, actNo: 205, pl: 589, date: 'Jul. 22, 1974', cl: 40, shortTitle: 'Unfair Insurance Practices Act', sections: PA_ACT_SOURCES[0]!.sections.map((x) => ({ n: x.actSection, body: ['x'] })) }) } });
    await expect(captureActs(io, PA_ACT_SOURCES)).rejects.toThrow(/1171\.1 .*no catchline/);
  });
});
