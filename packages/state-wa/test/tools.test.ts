import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/wa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/wa-annotations.json' with { type: 'json' };
import { WaCorpus } from '../src/corpus.js';
import {
  buildWaBuildRebuttalPacketTool,
  buildWaFindSupportingAuthorityTool,
  buildWaGetAuthorityTool,
  buildWaSearchAuthorityTool,
} from '../src/tools.js';

/**
 * The captureToolHandler idiom from packages/nhtsa/test/tools.test.ts: register
 * into a fake and invoke the handler directly — no MCP server, no transport.
 * All handlers run against the real committed corpus.
 */

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

const corpus = new WaCorpus(corpusJson, annotationsJson);

const search = captureToolHandler(buildWaSearchAuthorityTool(corpus));
const get = captureToolHandler(buildWaGetAuthorityTool(corpus));
const findSupporting = captureToolHandler(buildWaFindSupportingAuthorityTool(corpus));
const rebuttal = captureToolHandler(buildWaBuildRebuttalPacketTool(corpus));

describe('wa_search_authority', () => {
  test('payload carries results, one caveat key, the legal note, and the corpus cutoff', async () => {
    const { structuredContent: payload, content } = await search({
      query: 'written estimate required',
      limit: 5,
    });
    expect((payload.results as unknown[]).length).toBeGreaterThan(0);
    expect(payload.caveat).toContain('Educational information only');
    expect(payload.legalNote).toContain('not legal advice');
    expect(payload.corpusCurrentThrough).toBe(corpus.meta.capturedAt);
    // The branch's second caveat key does not port.
    expect(content[0]!.text).not.toContain('legalPostureCaveat');
  });

  test('results carry verbatim-quote material and a citation, not the full text', async () => {
    const { structuredContent: payload } = await search({ query: 'deny storage charges' });
    const top = (payload.results as Array<Record<string, unknown>>)[0]!;
    expect(top.cite).toBe('WAC 284-30-394');
    expect((top.citation as Record<string, unknown>).shortForm).toContain('WAC 284-30-394');
    expect(top.snippet).toBeDefined();
    expect(top.text).toBeUndefined();
  });

  test('the corpus note fires only when the question implies recency', async () => {
    const recent = await search({ query: 'any recent rulings on labor rates' });
    expect(recent.structuredContent.corpusNote).toBeDefined();
    const plain = await search({ query: 'storage charges' });
    expect(plain.structuredContent.corpusNote).toBeUndefined();
  });

  test('the domain filter constrains results', async () => {
    const { structuredContent: payload } = await search({
      query: 'meal period rest',
      domain: 'employment',
    });
    for (const result of payload.results as Array<Record<string, unknown>>) {
      expect(result.domain).toBe('employment');
    }
  });

  test('a nonsense query returns the empty hint', async () => {
    const { structuredContent: payload } = await search({ query: 'xylophone nebula parmesan' });
    expect(payload.results).toEqual([]);
    expect(payload.hint).toContain('No matching Washington law');
  });
});

describe('wa_get_authority', () => {
  test('returns the verbatim section with history note and citation', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'WAC 284-30-330' });
    expect(payload.found).toBe(true);
    const section = payload.section as Record<string, unknown>;
    expect(section.text).toContain('Misrepresenting pertinent facts or insurance policy provisions.');
    expect(section.historyNote).toContain('WSR 16-20-050');
    expect((payload.citation as Record<string, unknown>).shortForm).toBe(
      'WAC 284-30-330, effective 10/30/2016',
    );
  });

  test('a miss returns found=false with guidance, never an error', async () => {
    const { structuredContent: payload } = await get({ idOrCitation: 'WAC 999-99-999' });
    expect(payload.found).toBe(false);
    expect(payload.hint).toContain('wa_search_authority');
  });
});

describe('wa_find_supporting_authority', () => {
  test('bridges shop vocabulary to the right rule', async () => {
    const { structuredContent: payload } = await findSupporting({
      disputeText: 'adjuster is steering the customer away from our shop',
    });
    const cites = (payload.results as Array<Record<string, unknown>>).map((r) => r.cite);
    expect(cites.slice(0, 3)).toContain('WAC 284-30-390');
  });
});

describe('wa_build_rebuttal_packet', () => {
  test('is insurance-scoped even when other domains would match the words', async () => {
    const { structuredContent: payload } = await rebuttal({
      disputeText: 'meal period rest breaks estimate dispute',
    });
    for (const authority of payload.authorities as Array<Record<string, unknown>>) {
      expect(authority.domain).toBe('insurance');
    }
  });

  test('the packet is complete: citations verbatim, facts to verify, no liability language', async () => {
    const { structuredContent: payload, content } = await rebuttal({
      disputeText: 'short pay on the repair estimate after supplement for hidden damage',
      facts: ['Estimate was 14.2 hours, insurer paid 9.1'],
    });
    const authorities = payload.authorities as Array<Record<string, unknown>>;
    expect(authorities.length).toBeGreaterThan(0);
    const shortForms = authorities.map(
      (a) => (a.citation as Record<string, unknown>).shortForm,
    );
    expect(payload.suggestedCitationList).toEqual(shortForms);
    expect((payload.factsToVerify as string[]).length).toBeGreaterThan(3);
    const issueSummary = payload.issueSummary as Record<string, unknown>;
    expect(issueSummary.factsProvided).toEqual(['Estimate was 14.2 hours, insurer paid 9.1']);
    expect(payload.caveat).toContain('Educational information only');
    expect(content[0]!.text).not.toContain('violated the law');
    expect(content[0]!.text).not.toContain('legalPostureCaveat');
  });

  test('application notes never echo the dispute text back', async () => {
    // The branch interpolated raw user text into every note; the rebuilt notes
    // describe the match instead.
    const marker = 'UNIQUEMARKER9981 dispute';
    const { structuredContent: payload } = await rebuttal({ disputeText: `short pay ${marker}` });
    for (const entry of payload.howTheyMayApply as Array<Record<string, unknown>>) {
      expect(String(entry.note)).not.toContain('UNIQUEMARKER9981');
    }
  });
});
