import { describe, expect, test } from 'bun:test';
import {
  parseTacBrowseRules,
  parseTacRuleSummary,
  tacNewestEffectiveDate,
} from '../src/parse-tac.js';

/** The verified SAIL shapes (kickoff §3.2), reduced to their load-bearing parts. */
function browseDoc(rules: Array<{ cite: string; heading: string; recordId: string }>): unknown {
  return {
    ui: {
      contents: rules.map((rule) => ({
        items: [
          {
            item: {
              value: { values: [{ text: [{ '#t': 'string', '#v': `§${rule.cite}` }] }] },
            },
          },
          {
            item: {
              value: {
                values: [
                  {
                    link: {
                      '#t': 'SafeLink',
                      label: rule.heading,
                      uri: `https://texas-sos.appianportalsgov.com/rules-and-meetings?recordId=${rule.recordId}&queryAsDate=08%2F31%2F2026&interface=VIEW_TAC_SUMMARY&$locale=en_US`,
                    },
                    text: [{ '#t': 'string', '#v': rule.heading }],
                  },
                ],
              },
            },
          },
        ],
      })),
    },
  };
}

function summaryDoc(opts: { cite: string; bodyHtml: string; sourceNoteHtml?: string }): unknown {
  const embed = (richText: string): string =>
    JSON.stringify({ protocolVersion: 1, action: 'NEW_VALUE', value: { richText } });
  return {
    ui: {
      breadcrumbs: [
        { '#v': 'Title 28' },
        { '#v': 'INSURANCE' },
        { '#v': `Rule §${opts.cite}` },
      ],
      contents: [
        { field: { contents: { value: embed(opts.bodyHtml) } } },
        ...(opts.sourceNoteHtml
          ? [{ field: { contents: { value: embed(opts.sourceNoteHtml) } } }]
          : []),
      ],
    },
  };
}

describe('parseTacBrowseRules', () => {
  test('pairs each §number with the next summary link', () => {
    const rules = parseTacBrowseRules(
      browseDoc([
        { cite: '21.202', heading: 'Definitions', recordId: '15242' },
        { cite: '21.203', heading: 'Unfair Claim Settlement Practices', recordId: '206607' },
      ]),
    );
    expect(rules).toEqual([
      { cite: '21.202', heading: 'Definitions', recordId: '15242' },
      { cite: '21.203', heading: 'Unfair Claim Settlement Practices', recordId: '206607' },
    ]);
  });
  test('an empty browse document is template drift and throws', () => {
    expect(() => parseTacBrowseRules({ ui: {} })).toThrow(/no rules/);
  });
});

describe('parseTacRuleSummary', () => {
  test('extracts the cite, the rule text, and the newest Source Note date', () => {
    const parsed = parseTacRuleSummary(
      summaryDoc({
        cite: '5.501',
        bodyHtml:
          '<p>(a) The following words and terms apply.</p><p>(b) An insurer must give the notice.</p>',
        sourceNoteHtml:
          '<span><p><strong>Source Note: </strong>The provisions of this &sect;5.501 adopted to be effective July 12, 1998, 23 TexReg 6962; amended to be effective October 12, 2006, 31 TexReg 8372.</p></span>',
      }),
    );
    expect(parsed.cite).toBe('5.501');
    expect(parsed.text).toBe(
      '(a) The following words and terms apply.\n(b) An insurer must give the notice.',
    );
    expect(parsed.effectiveDate).toBe('2006-10-12');
    expect(parsed.historyNote).toContain('Source Note: The provisions of this §5.501');
  });
  test('a document with no rule text throws', () => {
    expect(() =>
      parseTacRuleSummary({ ui: { breadcrumbs: [{ '#v': 'Rule §5.501' }] } }),
    ).toThrow(/no rule text/);
  });
  test('a document without its Rule § breadcrumb throws', () => {
    expect(() => parseTacRuleSummary({ ui: {} })).toThrow(/breadcrumb/);
  });
});

describe('tacNewestEffectiveDate', () => {
  test('newest effective wins', () => {
    expect(
      tacNewestEffectiveDate('adopted to be effective January 1, 1976; amended to be effective November 7, 2021'),
    ).toBe('2021-11-07');
    expect(tacNewestEffectiveDate('no dates')).toBeUndefined();
  });
});
