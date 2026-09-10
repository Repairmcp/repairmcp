import { describe, expect, test } from 'bun:test';
import { NySenateParseError, parseSenateHtml } from '../src/parse-senate.js';

export function senatePage(opts: { cite?: string; heading?: string; location?: string; revision?: string; body?: string; absent?: boolean } = {}): string {
  if (opts.absent) return '<html><body><main><h1 class="nys-openleg-statute nys-title">Laws</h1><p>The requested entry could not be found.</p></main></body></html>';
  const cite = opts.cite ?? '2610';
  const heading = opts.heading ?? 'Collision or comprehensive coverage on motor vehicles; claims; repairs';
  const location = opts.location ?? 'Insurance (ISC) CHAPTER 28, ARTICLE 26';
  const body = opts.body ?? `  &sect; ${cite}. ${heading}. (a) Whenever a motor vehicle collision or comprehensive loss<br />shall have been suffered by an insured, no insurer providing collision<br />or comprehensive coverage therefor shall require that repairs be made.<br /><br />(b) In processing any such claim the insurer shall not, unless requested by the insured, recommend or suggest repairs be made to such<br />vehicle in a particular place or shop.`;
  return (
    '<html><body><div class="nys-openleg-history-published">Viewing most recent revision (from ' + (opts.revision ?? '2017-06-23') + ')</div>' +
    '<div class="nys-openleg-result-title"><h2 class="nys-openleg-result-title-headline">SECTION ' + cite + '</h2>' +
    '<h3 class="nys-openleg-result-title-short">' + heading + '</h3>' +
    '<h4 class="nys-openleg-result-title-location">' + location + '</h4></div>' +
    '<div class="nys-openleg-content-container"><ul class="nys-openleg-items-container"></ul>' +
    '<div class="nys-openleg-result-text">' + body + '\n</div></div></body></html>'
  );
}

describe('parseSenateHtml', () => {
  test('reads cite, catchline, location, revision date, and the body', () => {
    const p = parseSenateHtml(senatePage());
    expect(p.cite).toBe('2610');
    expect(p.heading).toBe('Collision or comprehensive coverage on motor vehicles; claims; repairs');
    expect(p.location).toBe('Insurance (ISC) CHAPTER 28, ARTICLE 26');
    expect(p.revisionDate).toBe('2017-06-23');
    const lines = p.text.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('§ 2610. Collision or comprehensive coverage on motor vehicles; claims; repairs. (a) Whenever a motor vehicle collision or comprehensive loss shall have been suffered by an insured, no insurer providing collision or comprehensive coverage therefor shall require that repairs be made.');
    expect(lines[1]).toContain('(b) In processing any such claim');
  });
  test('two <br /> separate paragraphs; a single <br /> joins with a space', () => {
    const p = parseSenateHtml(senatePage({ cite: '191', heading: 'Frequency of payments', body: '  &sect; 191. Frequency of payments. 1. Every employer shall pay wages in<br />accordance with the following provisions:<br /><br />a. Manual worker.--- (i) A manual worker shall be paid weekly.' }));
    expect(p.text).toBe('§ 191. Frequency of payments. 1. Every employer shall pay wages in accordance with the following provisions:\na. Manual worker.--- (i) A manual worker shall be paid weekly.');
  });
  test('decodes entities, including the numeric apostrophe the site uses', () => {
    const p = parseSenateHtml(senatePage({ cite: '2', heading: 'Definitions', body: '  &sect; 2. Definitions. the employer&#039;s history &amp; more' }));
    expect(p.text).toBe("§ 2. Definitions. the employer's history & more");
  });
  test('letter cites: the headline is upper-case, the body lead is lower-case, and both match', () => {
    const p = parseSenateHtml(senatePage({ cite: '398-D', heading: 'Motor vehicle repair shop requirements', body: '  &sect; 398-d. Motor vehicle repair shop requirements. 1. Every motor vehicle repair shop shall …' }));
    expect(p.cite).toBe('398-D');
  });
  test('absence (HTTP 200 + the not-found sentence) throws by name', () => {
    expect(() => parseSenateHtml(senatePage({ absent: true }))).toThrow(NySenateParseError);
    expect(() => parseSenateHtml(senatePage({ absent: true }))).toThrow(/could not be found/);
  });
  test('a page with no revision banner is template drift', () => {
    expect(() => parseSenateHtml(senatePage().replace('nys-openleg-history-published', 'x'))).toThrow(/revision/);
  });
  test('a body whose lead does not name the headline cite fails', () => {
    expect(() => parseSenateHtml(senatePage({ body: '  &sect; 2601. Something else.' }))).toThrow(/opens with/);
  });
});
