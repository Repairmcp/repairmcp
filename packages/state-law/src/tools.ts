/**
 * The four state-law MCP tools, as generic builders. Descriptions arrive from
 * the state config (they are the model's routing signal and are written per
 * state, in shop-floor language); payload shapes, field EMISSION ORDER, and
 * the freshness/caveat wiring are shared so two states cannot drift. The
 * payload text is pretty-printed JSON — key order is wire-visible, so
 * serializeHit's spread order is load-bearing and pinned by the Washington
 * golden payload fixture.
 */
import {
  freshnessFields,
  impliesRecency,
  withFreshness,
  type Citation,
  type RepairMCPServer,
  type ToolRegistrar,
} from '@repairmcp/core';
import { z } from 'zod';
import type { StateLawCorpus, StateLawHit, StateQueryResult } from './corpus.js';
import type { StateIdentity } from './identity.js';
import type { StateSection } from './schema.js';

const ITEM_NOUN_PLURAL = 'law sections';

/** "a, b, c, or d" — matches the original Washington wording byte-for-byte. */
function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

export interface StateToolsConfig {
  /** 'wa' → tool names wa_search_authority etc. */
  prefix: string;
  /** 'Washington' — titles and default wording. */
  stateName: string;
  /** 'leg.wa.gov' — miss-hint interpolation. */
  sourceSiteName: string;
  descriptions: {
    search: string;
    get: string;
    findSupporting: string;
    rebuttal: string;
  };
  domains: readonly string[];
  topics: readonly string[];
  /** The state's zod enums; ZodTypeAny because zod outputs are invariant. */
  domainSchema: z.ZodTypeAny;
  topicSchema: z.ZodTypeAny;
  /** The get tool's idOrCitation describe() text — cites are state-shaped. */
  getInputDescription: string;
  identity: StateIdentity;
  notes: {
    legalAdviceNote: string;
    educationalCaveat: string;
    emptySearchHint: string;
  };
  /** The rebuttal packet's forced domain — an insurer conversation. */
  rebuttalDomain: string;
}

function toolResult(payload: Record<string, unknown>): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function citationFields(citation: Citation): {
  shortForm: string;
  longForm: string;
  url: string;
} {
  return {
    shortForm: citation.shortForm,
    longForm: citation.longForm,
    url: citation.url,
  };
}

/**
 * A search/find hit as served: quote-ready material and the citation, not the
 * full text — the get tool serves that. quoteSafeExcerpts are enforced
 * substrings of the captured text, so they are safe to paste as quotes.
 */
function serializeHit<S extends StateSection>(hit: StateLawHit<S>, cfg: StateToolsConfig) {
  const { section, annotation } = hit;
  return {
    cite: cfg.identity.displayCite(section),
    heading: section.heading,
    chapter: `chapter ${section.chapter} ${section.code}`,
    chapterTitle: section.chapterTitle,
    domain: section.domain,
    score: hit.score,
    breakdown: hit.breakdown,
    snippet: hit.snippet,
    topics: hit.topics,
    ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
    ...(annotation?.quoteSafeExcerpts ? { quoteSafeExcerpts: annotation.quoteSafeExcerpts } : {}),
    ...(annotation?.appliesTo ? { appliesTo: annotation.appliesTo } : {}),
    citation: citationFields(cfg.identity.formatCitation(section)),
    sourceUrl: section.sourceUrl,
  };
}

type SerializedHit = ReturnType<typeof serializeHit>;

function resultFields<S extends StateSection>(
  result: StateQueryResult<S>,
  cfg: StateToolsConfig,
): Record<string, unknown> {
  return {
    ...(result.citationMiss
      ? {
          citationMiss: `${result.citationMiss} is not in the corpus — results below matched the query text instead. Verify the cite on ${cfg.sourceSiteName} before concluding it does not exist.`,
        }
      : {}),
    ...(result.chapterListing ? { chapterListing: true } : {}),
  };
}

export function buildSearchAuthorityTool<S extends StateSection>(
  corpus: StateLawCorpus<S>,
  cfg: StateToolsConfig,
): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      `${cfg.prefix}_search_authority`,
      {
        title: `Search ${cfg.stateName} law`,
        description: withFreshness(cfg.descriptions.search, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          query: z.string().min(1).describe('Plain-language question, shop phrasing, or a citation.'),
          domain: cfg.domainSchema
            .optional()
            .describe(`Constrain to one domain: ${joinOr(cfg.domains)}.`),
          topics: z.array(cfg.topicSchema).optional().describe('Constrain to these topics.'),
          limit: z.coerce.number().int().min(1).max(25).default(10),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, domain, topics, limit }) => {
        // ZodTypeAny erases the enum types; the schemas still validated them.
        const result = corpus.search(query, {
          domain: domain as string | undefined,
          topics: topics as readonly string[] | undefined,
          limit,
        });
        const results = result.hits.map((hit) => serializeHit(hit, cfg));
        return toolResult({
          count: results.length,
          domainsAvailable: cfg.domains,
          topicsAvailable: cfg.topics,
          results,
          ...resultFields(result, cfg),
          ...(results.length === 0 ? { hint: cfg.notes.emptySearchHint } : {}),
          caveat: cfg.notes.educationalCaveat,
          legalNote: cfg.notes.legalAdviceNote,
          ...freshnessFields(freshness, {
            note: impliesRecency(query, freshness),
            itemNounPlural: ITEM_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

export function buildGetAuthorityTool<S extends StateSection>(
  corpus: StateLawCorpus<S>,
  cfg: StateToolsConfig,
): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      `${cfg.prefix}_get_authority`,
      {
        title: `Get ${cfg.stateName} law section`,
        description: withFreshness(cfg.descriptions.get, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          idOrCitation: z.coerce.string().min(1).describe(cfg.getInputDescription),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ idOrCitation }) => {
        const section = corpus.getSection(idOrCitation);
        if (!section) {
          return toolResult({
            found: false,
            idOrCitation,
            hint:
              `No section matches that cite. Use ${cfg.prefix}_search_authority to find the right section, ` +
              `or verify the cite on ${cfg.sourceSiteName} — it may be repealed or renumbered.`,
            caveat: cfg.notes.educationalCaveat,
            legalNote: cfg.notes.legalAdviceNote,
            ...freshnessFields(freshness),
          });
        }
        const annotation = corpus.annotationFor(section);
        return toolResult({
          found: true,
          section: {
            cite: cfg.identity.displayCite(section),
            heading: section.heading,
            chapter: `chapter ${section.chapter} ${section.code}`,
            chapterTitle: section.chapterTitle,
            domain: section.domain,
            text: section.text,
            ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
            ...(section.historyNote ? { historyNote: section.historyNote } : {}),
            topics: corpus.topicsFor(section),
            ...(annotation?.quoteSafeExcerpts
              ? { quoteSafeExcerpts: annotation.quoteSafeExcerpts }
              : {}),
            ...(annotation?.appliesTo ? { appliesTo: annotation.appliesTo } : {}),
            sourceUrl: section.sourceUrl,
          },
          citation: citationFields(cfg.identity.formatCitation(section)),
          caveat: cfg.notes.educationalCaveat,
          legalNote: cfg.notes.legalAdviceNote,
          ...freshnessFields(freshness),
        });
      },
    );
  };
}

export function buildFindSupportingAuthorityTool<S extends StateSection>(
  corpus: StateLawCorpus<S>,
  cfg: StateToolsConfig,
): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      `${cfg.prefix}_find_supporting_authority`,
      {
        title: `Find supporting ${cfg.stateName} law`,
        description: withFreshness(cfg.descriptions.findSupporting, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          disputeText: z.string().min(1).describe("The dispute, in the user's own words."),
          domain: cfg.domainSchema.optional(),
          topics: z.array(cfg.topicSchema).optional(),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ disputeText, domain, topics, limit }) => {
        const result = corpus.findSupporting(disputeText, {
          domain: domain as string | undefined,
          topics: topics as readonly string[] | undefined,
          limit,
        });
        const results = result.hits.map((hit) => serializeHit(hit, cfg));
        return toolResult({
          count: results.length,
          results,
          ...resultFields(result, cfg),
          ...(results.length === 0 ? { hint: cfg.notes.emptySearchHint } : {}),
          caveat: cfg.notes.educationalCaveat,
          legalNote: cfg.notes.legalAdviceNote,
          ...freshnessFields(freshness, {
            note: impliesRecency(disputeText, freshness),
            itemNounPlural: ITEM_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

/** The static half of factsToVerify; the dynamic line names the cited sections. */
export const FACTS_TO_VERIFY_BASE: readonly string[] = [
  'Policy type and claim posture: first-party, third-party, or another arrangement.',
  'The exact estimate, supplement, payment explanation, and denial documents in dispute, with the line-item differences.',
  'Policy language, endorsements, limits, exclusions, and the claim-handling correspondence.',
  'That each cited section applies to the claim facts and dates — read the full text, not just the excerpt.',
];

function factsToVerify(authorities: SerializedHit[]): string[] {
  const dated = authorities.filter((a) => a.effectiveDate);
  return [
    ...FACTS_TO_VERIFY_BASE,
    ...(dated.length > 0
      ? [
          `Current text and effective dates of: ${dated
            .map((a) => `${a.cite} (effective ${a.effectiveDate})`)
            .join(', ')} — confirm the claim events fall under the current text.`,
        ]
      : []),
  ];
}

export function buildRebuttalPacketTool<S extends StateSection>(
  corpus: StateLawCorpus<S>,
  cfg: StateToolsConfig,
): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      `${cfg.prefix}_build_rebuttal_packet`,
      {
        title: `Build ${cfg.stateName} rebuttal packet`,
        description: withFreshness(cfg.descriptions.rebuttal, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          disputeText: z.string().min(1).describe("The dispute, in the user's own words."),
          facts: z.array(z.string().min(1)).optional().describe('Known claim facts, verbatim.'),
          topics: z.array(cfg.topicSchema).optional(),
          limit: z.coerce.number().int().min(1).max(12).default(5),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ disputeText, facts, topics, limit }) => {
        // Domain-scoped by construction: a rebuttal packet is an insurer
        // conversation. Other domains route to search.
        const result = corpus.findSupporting(disputeText, {
          domain: cfg.rebuttalDomain,
          topics: topics as readonly string[] | undefined,
          limit,
        });
        const authorities = result.hits.map((hit) => serializeHit(hit, cfg));
        return toolResult({
          issueSummary: {
            disputeText,
            factsProvided: facts ?? null,
            topics: topics ?? [],
          },
          authorities,
          // Describes the match; never echoes the dispute text back into the
          // notes.
          howTheyMayApply: authorities.map((authority) => ({
            cite: authority.cite,
            note:
              `${authority.cite} (${authority.heading}) matched the dispute description. ` +
              'Read the quoted text and verify the facts against the official source before citing it.',
          })),
          factsToVerify: factsToVerify(authorities),
          suggestedCitationList: authorities.map((authority) => authority.citation.shortForm),
          caveat: cfg.notes.educationalCaveat,
          legalNote: cfg.notes.legalAdviceNote,
          ...freshnessFields(freshness, {
            note: impliesRecency(disputeText, freshness),
            itemNounPlural: ITEM_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

/** Register the four state tools. Pair with registerStateConnectorTools. */
export function registerStateTools<S extends StateSection, I extends { id: string; title: string; url: string; lastUpdated: Date; metadata: Record<string, unknown> }>(
  server: RepairMCPServer<I>,
  corpus: StateLawCorpus<S>,
  cfg: StateToolsConfig,
): void {
  server.registerCustomTool(buildSearchAuthorityTool(corpus, cfg));
  server.registerCustomTool(buildGetAuthorityTool(corpus, cfg));
  server.registerCustomTool(buildFindSupportingAuthorityTool(corpus, cfg));
  server.registerCustomTool(buildRebuttalPacketTool(corpus, cfg));
}
