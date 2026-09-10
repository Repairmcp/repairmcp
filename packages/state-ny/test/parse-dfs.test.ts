import { describe, expect, test } from 'bun:test';
import { NyDfsParseError, parseDfsHtml } from '../src/parse-dfs.js';

export function ogcPage(opts: { number?: string; subject?: string; date?: string; body?: string } = {}): string {
  const number = opts.number ?? '04-06-03';
  return `<html><head><title>OGC Opinion No. ${number}: ${opts.subject ?? 'Section 2610 - Certified Autobody Repair Shops'} | Department of Financial Services</title></head><body><nav>menu</nav>` +
    `<div class="body-area"><div class="body-area-in"><h2>OGC Opinion No. ${number}</h2><p>The Office of General Counsel issued the following opinion on ${opts.date ?? 'June 8, 2004'} representing the position of the New York State Insurance Department.</p>` +
    `<p>Re: Section 2610 - Certified Autobody Repair Shops</p><p><strong>QUESTION</strong></p><p>${opts.body ?? 'May the insurer advise the owner? No. Such advice given by an insurer without a recommendation request is prohibited under Section 2610(b).'}</p></div></div><footer>x</footer></body></html>`;
}

export function circularPage(opts: { number?: string; date?: string; withdrawn?: string; subject?: string } = {}): string {
  const number = opts.number ?? '16 (2000)';
  return `<html><head><title>Insurance Circular Letter No. ${number}: ${opts.subject ?? 'Application of Section 2610(b) of the Insurance Law'} | Department of Financial Services</title></head><body>` +
    `<div class="body-area"><div class="body-area-in">${opts.withdrawn ? `<p><strong>NOTE: WITHDRAWN EFFECTIVE ${opts.withdrawn}</strong></p>` : ''}<p>Circular Letter No. ${number}</p><p>${opts.date ?? 'May 10, 2000'}</p>` +
    `<table><tr><td>TO:</td><td>All Motor Vehicle Self-insurers</td></tr><tr><td>RE:</td><td>Application of Section 2610(b) of the Insurance Law</td></tr></table>` +
    `<p>This is to advise all insurers of the decision issued by Judge Casey.</p></div></div></body></html>`;
}

describe('parseDfsHtml', () => {
  test('an OGC opinion: number, subject, issue date, body from the h2 on', () => {
    const p = parseDfsHtml(ogcPage(), { kind: 'ogc', number: '04-06-03' });
    expect(p.number).toBe('04-06-03');
    expect(p.subject).toBe('Section 2610 - Certified Autobody Repair Shops');
    expect(p.issueDate).toBe('2004-06-08');
    expect(p.withdrawnDate).toBeUndefined();
    expect(p.text.split('\n')[0]).toBe('OGC Opinion No. 04-06-03');
    expect(p.text).toContain('prohibited under Section 2610(b)');
    expect(p.text).not.toContain('menu');
  });
  test('a withdrawn circular letter: date line and the withdrawal', () => {
    const p = parseDfsHtml(circularPage({ withdrawn: 'DECEMBER 4, 2003' }), { kind: 'circular', number: '16 (2000)' });
    expect(p.issueDate).toBe('2000-05-10');
    expect(p.withdrawnDate).toBe('2003-12-04');
    expect(p.text).toContain('NOTE: WITHDRAWN EFFECTIVE DECEMBER 4, 2003');
    expect(p.text).toContain('TO: All Motor Vehicle Self-insurers');
  });
  test('a current circular letter has no withdrawal', () => {
    expect(parseDfsHtml(circularPage({ number: '11 (1991)', date: 'September 5, 1991' }), { kind: 'circular', number: '11 (1991)' }).withdrawnDate).toBeUndefined();
  });
  test('the title must name the requested document', () => {
    expect(() => parseDfsHtml(ogcPage({ number: '01-10-05' }), { kind: 'ogc', number: '04-06-03' })).toThrow(NyDfsParseError);
    expect(() => parseDfsHtml(ogcPage({ number: '01-10-05' }), { kind: 'ogc', number: '04-06-03' })).toThrow(/names OGC Opinion No\. 01-10-05/);
  });
  test('a page with no dateline fails', () => {
    expect(() => parseDfsHtml(ogcPage({ date: 'sometime' }), { kind: 'ogc', number: '04-06-03' })).toThrow(/issue date/);
  });
});
