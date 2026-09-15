import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { buildGetAuthorityTool } from '../src/tools.js';
import { StateLawCorpus, type CorpusProfile } from '../src/corpus.js';
import { makeStateIdentity } from '../src/identity.js';
import { EDUCATIONAL_CAVEAT, makeEmptySearchHint, makeLegalAdviceNote } from '../src/notes.js';
import { StateCorpusMetaSchema, StateSectionSchema } from '../src/schema.js';

/**
 * Task 7 (state-oh) added an optional `statusNote` spread to
 * buildGetAuthorityTool's payload — Ohio is the first state whose site
 * prints a bracketed note in front of a catchline. This proves the change
 * is additive only: a section with no statusNote serializes with the exact
 * same section keys as before the change, and a section that carries one
 * gets it surfaced.
 */

const TestSectionSchema = StateSectionSchema.extend({ statusNote: z.string().min(1).optional() });
const TestCorpusFileSchema = z.object({ meta: StateCorpusMetaSchema, sections: z.array(TestSectionSchema).min(1) });

const identity = makeStateIdentity({
  sourceId: 'state-xx',
  sourceName: 'Test State',
  sourceShortName: 'XX Law',
  sourceUrl: 'https://example.gov',
  description: 'test',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
  codes: [{ code: 'AAA', longName: 'Alpha Code', separator: '-', claimsBareSeparators: ['-'] }],
});

const profile: CorpusProfile = {
  state: 'XX',
  codes: ['AAA'],
  domains: ['insurance'],
  topics: ['topic_a'],
  baselineTopics: () => ['topic_a'],
  resolveCitationQuery: identity.resolveCitationQuery,
  displayCite: identity.displayCite,
  corpusFileSchema: TestCorpusFileSchema,
};

const corpusData = {
  meta: {
    state: 'XX',
    capturedAt: '2026-01-01',
    currentThrough: '2026-01-01',
    sourceNote: 'test corpus',
    sourceUrl: 'https://example.gov',
  },
  sections: [
    {
      cite: '1-1-1',
      code: 'AAA',
      chapter: '1-1',
      chapterTitle: 'Test Chapter',
      heading: 'Plain heading.',
      text: 'Plain text.',
      domain: 'insurance',
      sourceUrl: 'https://example.gov/1-1-1',
    },
    {
      cite: '1-1-2',
      code: 'AAA',
      chapter: '1-1',
      chapterTitle: 'Test Chapter',
      heading: 'Noted heading.',
      text: 'Noted text.',
      domain: 'insurance',
      sourceUrl: 'https://example.gov/1-1-2',
      statusNote: "Governor's veto not reflected",
    },
  ],
};

const corpus = new StateLawCorpus(profile, corpusData);

const cfg = {
  prefix: 'xx',
  stateName: 'Test State',
  sourceSiteName: 'example.gov',
  descriptions: { search: 's', get: 'g', findSupporting: 'f', rebuttal: 'r' },
  domains: profile.domains,
  topics: profile.topics,
  domainSchema: z.enum(['insurance']),
  topicSchema: z.enum(['topic_a']),
  getInputDescription: 'a citation',
  identity,
  notes: {
    legalAdviceNote: makeLegalAdviceNote('Test State'),
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: makeEmptySearchHint('Test State'),
  },
  rebuttalDomain: 'insurance',
};

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  structuredContent: Record<string, unknown>;
}>;

function captureToolHandler(register: (server: unknown) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  register({
    registerTool: (_name: string, _def: unknown, h: ToolHandler) => {
      handler = h;
    },
  });
  if (!handler) throw new Error('tool registered no handler');
  return handler;
}

const get = captureToolHandler(buildGetAuthorityTool(corpus, cfg));

describe('buildGetAuthorityTool statusNote spread', () => {
  test('a section with no statusNote serializes with the same keys as before the change', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'AAA 1-1-1' });
    const section = payload.section as Record<string, unknown>;
    expect(Object.keys(section)).toEqual(['cite', 'heading', 'chapter', 'chapterTitle', 'domain', 'text', 'topics', 'sourceUrl']);
  });

  test('a section that carries a statusNote surfaces it verbatim', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'AAA 1-1-2' });
    const section = payload.section as Record<string, unknown>;
    expect(section.statusNote).toBe("Governor's veto not reflected");
  });
});
