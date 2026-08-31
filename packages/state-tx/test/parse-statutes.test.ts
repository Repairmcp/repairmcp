import { describe, expect, test } from 'bun:test';
import {
  newestEffectiveDate,
  parseTxChapterHtml,
  parseTxStatutesCurrency,
} from '../src/parse-statutes.js';

/** The verified page shape (kickoff §3.1), reduced to its load-bearing parts. */
function section(cite: string, opts: { heading?: string; body?: string[]; history?: string[] } = {}): string {
  const heading = opts.heading ?? `HEADING FOR ${cite}.`;
  const body = opts.body ?? [`(a)  Body text for ${cite}.`];
  const history = opts.history ?? [
    'Added by Acts 2005, 79th Leg., Ch. 727 (H.B. <a href="http://capitol.texas.gov/x">2017</a>), Sec. 2, eff. April 1, 2007.',
  ];
  const [first, ...rest] = body;
  return (
    `<p class="left"><a name="${cite}"></a><a name="12345.678"></a></p>` +
    `<p style="text-indent:7ex;" class="left"><a target="_blank" ` +
    `href="https://statutes.capitol.texas.gov/Docs/IN/htm/IN.x.htm#${cite}" ` +
    `style="color:inherit;font-weight:bold;">Sec.&nbsp;${cite}.&nbsp;&nbsp;${heading}</a>  ${first}</p>` +
    rest.map((line) => `<p style="text-indent:13ex;" class="left">${line}</p>`).join('') +
    history.map((line) => `<p class="left">${line}</p>`).join('')
  );
}

describe('parseTxChapterHtml', () => {
  test('parses heads, bodies split across the head paragraph, and history notes', () => {
    const html =
      '<html><body>' +
      '<p class="center" style="font-weight:bold;">SUBCHAPTER G.  REPAIR OF MOTOR VEHICLES</p>' +
      section('1952.301', {
        body: ['(a)  An insurer may not:', '(1)  specify parts; or', '(2)  limit the shop.'],
      }) +
      section('1952.302') +
      '</body></html>';
    const { sections, warnings } = parseTxChapterHtml(html, { chapter: '1952' });
    expect(warnings).toEqual([]);
    expect(sections.map((s) => s.cite)).toEqual(['1952.301', '1952.302']);
    const first = sections[0]!;
    expect(first.heading).toBe('HEADING FOR 1952.301.');
    expect(first.text).toBe('(a) An insurer may not:\n(1) specify parts; or\n(2) limit the shop.');
    expect(first.effectiveDate).toBe('2007-04-01');
    expect(first.historyNote).toContain('Added by Acts 2005');
    // The bill-number link text is preserved, not lost, when tags strip.
    expect(first.historyNote).toContain('(H.B. 2017)');
  });

  test('the newest eff date wins across Amended by blocks, abbreviated months included', () => {
    const html = section('542.060', {
      history: [
        'Added by Acts 2003, 78th Leg., ch. 1274, Sec. 2, eff. April 1, 2005.',
        'Amended by:',
        'Acts 2017, 85th Leg., R.S., Ch. 151 (H.B. <a href="#">1774</a>), Sec. 3, eff. Sept. 1, 2017.',
      ],
    });
    const { sections } = parseTxChapterHtml(html, { chapter: '542' });
    expect(sections[0]!.effectiveDate).toBe('2017-09-01');
  });

  test('a history note with no parseable eff date yields silence, not a guess', () => {
    const html = section('61.014', { history: ['Renumbered from Sec. 5.01 by Acts 1993, 73rd Leg.'] });
    const { sections } = parseTxChapterHtml(html, { chapter: '61' });
    expect(sections[0]!.effectiveDate).toBeUndefined();
    expect(sections[0]!.historyNote).toContain('Renumbered');
  });

  test('a "Text of section as amended by" note terminates the previous section', () => {
    const html =
      section('17.555') +
      '<p class="center">Text of section as amended by Acts 1995, 74th Leg., ch. 138, Sec. 7.</p>' +
      section('17.56');
    const { sections } = parseTxChapterHtml(html, { chapter: '17' });
    expect(sections[0]!.text).not.toContain('Text of section');
    expect(sections.map((s) => s.cite)).toEqual(['17.555', '17.56']);
  });

  test('a duplicated cite (unreconciled amendments) warns and both parse', () => {
    const html = section('17.56') + section('17.56');
    const { sections, warnings } = parseTxChapterHtml(html, { chapter: '17' });
    expect(sections).toHaveLength(2);
    expect(warnings.some((w) => w.includes('17.56'))).toBe(true);
  });

  test('a section from another chapter is template drift and throws', () => {
    expect(() => parseTxChapterHtml(section('999.001'), { chapter: '1952' })).toThrow(/does not belong/);
  });

  test('an empty page is template drift and throws', () => {
    expect(() => parseTxChapterHtml('<html><body></body></html>', { chapter: '1952' })).toThrow(
      /no sections/,
    );
  });
});

describe('newestEffectiveDate', () => {
  test('handles full and abbreviated month names', () => {
    expect(newestEffectiveDate('eff. September 1, 2025.')).toBe('2025-09-01');
    expect(newestEffectiveDate('eff. Sept. 1, 1993.')).toBe('1993-09-01');
    expect(newestEffectiveDate('eff. Jan. 1, 1984. later eff. June 19, 2015.')).toBe('2015-06-19');
    expect(newestEffectiveDate('no dates here')).toBeUndefined();
  });
});

describe('parseTxStatutesCurrency', () => {
  test('extracts the session phrase from the verified sentence', () => {
    const { sessionPhrase } = parseTxStatutesCurrency(
      'The statutes available on this website are current through the 89th 2nd Called Legislative Session, 2025. The constitutional provisions…',
    );
    expect(sessionPhrase).toBe('89th 2nd Called Legislative Session, 2025');
  });
  test('a response that cannot state currency throws', () => {
    expect(() => parseTxStatutesCurrency('Service temporarily unavailable')).toThrow(/currency/);
  });
});
