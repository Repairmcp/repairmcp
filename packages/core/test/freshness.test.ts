/**
 * The freshness heuristic and its wording.
 *
 * `impliesRecency` is a hand-maintained list of phrases, which is exactly the
 * kind of thing that rots without anyone noticing — a phrasing gets dropped in a
 * refactor and the note silently stops appearing on the queries that most need
 * it. The truth table below is the only thing that would catch that, so it is
 * written as a table rather than as prose assertions: adding a case is one line.
 *
 * The negative cases matter as much as the positive ones. A note that fires on
 * every query is a note the model learns to skip, so "blend two-tone refinish"
 * staying quiet is a real requirement and not an incidental detail.
 */
import { describe, test, expect } from 'bun:test';
import {
  beyondCutoffNote,
  freshnessFields,
  freshnessSentence,
  impliesRecency,
  recencyNote,
  sinceIsBeyondCorpus,
  withFreshness,
  type CorpusFreshness,
} from '../src/corpus/freshness.js';

const FRESHNESS: CorpusFreshness = {
  currentThrough: '2026-07-31',
  syncedAt: '2026-08-02',
  recordCount: 22652,
};

describe('impliesRecency', () => {
  const FIRES = [
    'any recent rulings',
    'what has DEG resolved recently',
    'latest on blend time',
    'the newest inquiries',
    'is there anything newer on weld-thru primer',
    "what's new on DEG",
    'whats new',
    'anything new this week',
    'what is the current position on blend time',
    'is this up to date',
    'is this up-to-date',
    'has DEG ruled on this lately',
    'what has been resolved so far',
    'resolutions to date',
    'anything from this quarter',
    'rulings in the last quarter',
    'changes in the past 30 days',
    'what does DEG say today',
    'what is DEG saying right now',
  ];

  const QUIET = [
    'blend two-tone refinish',
    'weld-thru primer non-included',
    'R&I rear bumper for refinish on adjacent panel',
    'underhood lamp aim after R&I',
    'frame measurement during blueprinting',
    'labor allowance for cargo van side panel extension replacement',
    'structural adhesive and anti-flutter foam on roof replacement',
    // "quarter panel" must not trip the "this quarter" / "last quarter" rules.
    'welded quarter panel operations',
    'replace the new quarter panel',
    // Years comfortably behind the cutoff are just vehicle years.
    '2018 Ford F-150 bumper cover',
    'MOTOR GTE pages refinish question',
  ];

  for (const text of FIRES) {
    test(`fires: ${text}`, () => {
      expect(impliesRecency(text, FRESHNESS)).toBe(true);
    });
  }

  for (const text of QUIET) {
    test(`quiet: ${text}`, () => {
      expect(impliesRecency(text, FRESHNESS)).toBe(false);
    });
  }

  test('a year at or past the cutoff year counts as a recency signal', () => {
    expect(impliesRecency('anything from 2026', FRESHNESS)).toBe(true);
    expect(impliesRecency('anything from 2027', FRESHNESS)).toBe(true);
    expect(impliesRecency('anything from 2025', FRESHNESS)).toBe(false);
  });

  test('without a cutoff, the year rule cannot apply', () => {
    expect(impliesRecency('anything from 2026')).toBe(false);
    expect(impliesRecency('any recent rulings')).toBe(true);
  });

  test('undefined and empty text are quiet', () => {
    expect(impliesRecency(undefined, FRESHNESS)).toBe(false);
    expect(impliesRecency('', FRESHNESS)).toBe(false);
  });

  test('case is irrelevant', () => {
    expect(impliesRecency('LATEST DEG RULINGS', FRESHNESS)).toBe(true);
  });
});

describe('sinceIsBeyondCorpus', () => {
  test('a since past the cutoff is beyond it', () => {
    expect(sinceIsBeyondCorpus(new Date('2026-08-10T00:00:00Z'), FRESHNESS)).toBe(true);
  });

  test('a since on the cutoff day is not beyond it', () => {
    expect(sinceIsBeyondCorpus(new Date('2026-07-31T00:00:00Z'), FRESHNESS)).toBe(false);
  });

  test('a since before the cutoff is not beyond it', () => {
    expect(sinceIsBeyondCorpus(new Date('2026-01-01T00:00:00Z'), FRESHNESS)).toBe(false);
  });

  test('no since is not beyond it', () => {
    expect(sinceIsBeyondCorpus(undefined, FRESHNESS)).toBe(false);
  });
});

describe('wording', () => {
  test('the description sentence names both dates and the count', () => {
    const s = freshnessSentence(FRESHNESS, 'inquiries');
    expect(s).toContain('2026-07-31');
    expect(s).toContain('2026-08-02');
    expect(s).toContain('22,652');
    expect(s).toContain('inquiries');
    // The instruction is the part that changes behaviour, not the facts.
    expect(s).toContain('Do not state or imply coverage past that date');
  });

  test('the recency note names the cutoff and capitalizes the noun', () => {
    const n = recencyNote(FRESHNESS, 'inquiries');
    expect(n.startsWith('Inquiries')).toBe(true);
    expect(n).toContain('2026-07-31');
    expect(n).toContain('2026-08-02');
  });

  test('the beyond-cutoff note says an empty result is not an answer', () => {
    const n = beyondCutoffNote(FRESHNESS, 'inquiries');
    expect(n).toContain('does not mean no inquiries');
    expect(n).toContain('2026-07-31');
  });

  test('withFreshness appends, and is a no-op without freshness', () => {
    expect(withFreshness('BASE', FRESHNESS, 'inquiries')).toContain('BASE');
    expect(withFreshness('BASE', FRESHNESS, 'inquiries')).toContain('CORPUS FRESHNESS');
    expect(withFreshness('BASE', undefined, 'inquiries')).toBe('BASE');
  });
});

describe('freshnessFields', () => {
  test('no freshness contributes no fields at all', () => {
    expect(freshnessFields(undefined, { note: true })).toEqual({});
  });

  test('both dates ride along, note only when asked', () => {
    expect(freshnessFields(FRESHNESS)).toEqual({
      corpusCurrentThrough: '2026-07-31',
      corpusSyncedAt: '2026-08-02',
    });
    expect(freshnessFields(FRESHNESS, { note: true, itemNounPlural: 'inquiries' }).corpusNote)
      .toBe(recencyNote(FRESHNESS, 'inquiries'));
  });

  test('a string note is used verbatim', () => {
    const note = beyondCutoffNote(FRESHNESS, 'inquiries');
    expect(freshnessFields(FRESHNESS, { note }).corpusNote).toBe(note);
  });
});
