import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/mt-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/mt-annotations.json' with { type: 'json' };
import { MtCorpus } from '../src/corpus.js';
import {
  buildMtBuildRebuttalPacketTool,
  buildMtGetAuthorityTool,
  buildMtSearchAuthorityTool,
} from '../src/tools.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
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

const corpus = new MtCorpus(corpusJson, annotationsJson);
const search = captureToolHandler(buildMtSearchAuthorityTool(corpus));
const get = captureToolHandler(buildMtGetAuthorityTool(corpus));
const rebuttal = captureToolHandler(buildMtBuildRebuttalPacketTool(corpus));

describe('mt_search_authority', () => {
  test('payload carries results, one caveat key, the Montana legal note, and freshness', async () => {
    const { structuredContent: payload, content } = await search({
      query: 'steering to a preferred body shop',
      limit: 5,
    });
    expect((payload.results as unknown[]).length).toBeGreaterThan(0);
    expect(payload.caveat).toContain('Educational information only');
    expect(payload.legalNote).toBe(
      'This quotes Montana law and cites the section. It is not legal advice.',
    );
    expect(payload.corpusCurrentThrough).toBe(corpus.meta.capturedAt);
    expect(content[0]!.text).not.toContain('legalPostureCaveat');
  });

  test('MCA hits cite the edition; ARM hits cite their effective date', async () => {
    const mca = await search({ query: 'MCA 33-18-224' });
    const mcaHit = (mca.structuredContent.results as Array<Record<string, unknown>>)[0]!;
    expect((mcaHit.citation as Record<string, unknown>).shortForm).toBe(
      'MCA 33-18-224, 2025 edition',
    );
    const arm = await search({ query: 'ARM 6.6.1701' });
    const armHit = (arm.structuredContent.results as Array<Record<string, unknown>>)[0]!;
    expect((armHit.citation as Record<string, unknown>).shortForm).toBe(
      'ARM 6.6.1701, effective 10/28/1983',
    );
  });

  test('the domain filter constrains results', async () => {
    const { structuredContent: payload } = await search({
      query: 'wages overtime pay',
      domain: 'employment',
    });
    for (const result of payload.results as Array<Record<string, unknown>>) {
      expect(result.domain).toBe('employment');
    }
  });
});

describe('mt_get_authority', () => {
  test('returns the verbatim section with history and citation', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'MCA 33-18-224' });
    expect(payload.found).toBe(true);
    const section = payload.section as Record<string, unknown>;
    expect(section.text as string).toContain('unilaterally disregard a repair operation');
    expect(section.historyNote as string).toContain('History:');
    expect((payload.citation as Record<string, unknown>).shortForm).toBe(
      'MCA 33-18-224, 2025 edition',
    );
  });

  test('a miss returns found=false with guidance naming the source sites', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'MCA 99-99-999' });
    expect(payload.found).toBe(false);
    expect(payload.hint).toContain('mt_search_authority');
    expect(payload.hint).toContain('mca.legmt.gov');
  });
});

describe('mt_build_rebuttal_packet', () => {
  test('is insurance-scoped and complete', async () => {
    const { structuredContent: payload, content } = await rebuttal({
      disputeText: 'short pay after the adjuster removed refinish operations',
    });
    const authorities = payload.authorities as Array<Record<string, unknown>>;
    expect(authorities.length).toBeGreaterThan(0);
    for (const authority of authorities) expect(authority.domain).toBe('insurance');
    expect(payload.suggestedCitationList).toEqual(
      authorities.map((a) => (a.citation as Record<string, unknown>).shortForm),
    );
    expect((payload.factsToVerify as string[]).length).toBeGreaterThan(3);
    expect(content[0]!.text).not.toContain('violated the law');
  });
});
