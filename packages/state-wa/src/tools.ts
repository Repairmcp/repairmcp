/**
 * The four wa_* MCP tools. Descriptions follow the DEG gold standard — "USE
 * THIS WHEN: / INPUT: / OUTPUT:" in shop-floor language — ported from the May
 * branch and widened for the four-domain scope. Every payload carries the
 * corpus's own freshness fields, the not-legal-advice line, and (on the
 * dispute tools) the educational caveat under the ONE key `caveat`.
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
import type { WaItem } from './adapter.js';
import type { WaCorpus, WaHit, WaQueryResult } from './corpus.js';
import { displayCite, formatWaCitation } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { WA_DOMAINS, WaDomainSchema } from './schema.js';
import { WA_TOPICS, WaTopicSchema } from './taxonomy.js';

const ITEM_NOUN_PLURAL = 'law sections';

const WA_SEARCH_AUTHORITY_DESCRIPTION = `Search Washington state law for collision repair facilities: insurance claims handling (WAC 284-30, RCW 48.30 including the Insurance Fair Conduct Act), auto repair law (RCW 46.71 estimates and parts disclosure, liens), WISHA workplace safety (spray booths, respirators, hazcom, hexavalent chromium), and employment rules (breaks, overtime, sick leave, minors).

USE THIS WHEN:
- A Washington claim, short-pay, estimate dispute, supplement, denial, steering, labor rate, total loss, storage charge, or chosen repair facility issue needs the actual rule text.
- A shop question about estimates, invoices, aftermarket parts disclosure, or repair liens.
- A safety or HR question: spray booth rules, respirator requirements, breaks, overtime, hiring minors.
- You have a citation like "WAC 284-30-330" or a chapter like "WAC 284-30" and want it directly.

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | safety | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, per-section effective dates, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const WA_GET_AUTHORITY_DESCRIPTION = `Fetch one Washington law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official leg.wa.gov URL, the effective date of the current text, and the history note for a specific section.

INPUT: A citation in any common form: "WAC 284-30-390", "RCW 46.71.025", "wac:284-30-390", or a bare "284-30-390".

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, effective date when the history note states one, the history note itself, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const WA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Washington law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, storage-denial answer, steering conversation, or total-loss valuation dispute for a Washington claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, supplement) to regulatory language that never uses those words.

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const WA_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Washington insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Washington estimate dispute, short-pay, supplement, denial, steering, labor rate, storage denial, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — safety and employment questions belong to wa_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice.`;

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
 * full text — wa_get_authority serves that. quoteSafeExcerpts are enforced
 * substrings of the captured text, so they are safe to paste as quotes.
 */
function serializeHit(hit: WaHit) {
  const { section, annotation } = hit;
  return {
    cite: displayCite(section),
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
    citation: citationFields(formatWaCitation(section)),
    sourceUrl: section.sourceUrl,
  };
}

type SerializedHit = ReturnType<typeof serializeHit>;

function resultFields(result: WaQueryResult): Record<string, unknown> {
  return {
    ...(result.citationMiss
      ? {
          citationMiss: `${result.citationMiss} is not in the corpus — results below matched the query text instead. Verify the cite on leg.wa.gov before concluding it does not exist.`,
        }
      : {}),
    ...(result.chapterListing ? { chapterListing: true } : {}),
  };
}

export function buildWaSearchAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      'wa_search_authority',
      {
        title: 'Search Washington law',
        description: withFreshness(WA_SEARCH_AUTHORITY_DESCRIPTION, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          query: z.string().min(1).describe('Plain-language question, shop phrasing, or a citation.'),
          domain: WaDomainSchema.optional().describe(
            'Constrain to one domain: insurance, repair_law, safety, or employment.',
          ),
          topics: z.array(WaTopicSchema).optional().describe('Constrain to these topics.'),
          limit: z.coerce.number().int().min(1).max(25).default(10),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, domain, topics, limit }) => {
        const result = corpus.search(query, { domain, topics, limit });
        const results = result.hits.map(serializeHit);
        return toolResult({
          count: results.length,
          domainsAvailable: WA_DOMAINS,
          topicsAvailable: WA_TOPICS,
          results,
          ...resultFields(result),
          ...(results.length === 0 ? { hint: EMPTY_SEARCH_HINT } : {}),
          caveat: EDUCATIONAL_CAVEAT,
          legalNote: LEGAL_ADVICE_NOTE,
          ...freshnessFields(freshness, {
            note: impliesRecency(query, freshness),
            itemNounPlural: ITEM_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

export function buildWaGetAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      'wa_get_authority',
      {
        title: 'Get Washington law section',
        description: withFreshness(WA_GET_AUTHORITY_DESCRIPTION, freshness, ITEM_NOUN_PLURAL),
        inputSchema: {
          idOrCitation: z.coerce
            .string()
            .min(1)
            .describe('A citation such as "WAC 284-30-390", "RCW 46.71.025", or "wac:284-30-390".'),
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
              'No section matches that cite. Use wa_search_authority to find the right section, ' +
              'or verify the cite on leg.wa.gov — it may be repealed or renumbered.',
            caveat: EDUCATIONAL_CAVEAT,
            legalNote: LEGAL_ADVICE_NOTE,
            ...freshnessFields(freshness),
          });
        }
        const annotation = corpus.annotationFor(section);
        return toolResult({
          found: true,
          section: {
            cite: displayCite(section),
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
          citation: citationFields(formatWaCitation(section)),
          caveat: EDUCATIONAL_CAVEAT,
          legalNote: LEGAL_ADVICE_NOTE,
          ...freshnessFields(freshness),
        });
      },
    );
  };
}

export function buildWaFindSupportingAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      'wa_find_supporting_authority',
      {
        title: 'Find supporting Washington law',
        description: withFreshness(
          WA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
          freshness,
          ITEM_NOUN_PLURAL,
        ),
        inputSchema: {
          disputeText: z.string().min(1).describe("The dispute, in the user's own words."),
          domain: WaDomainSchema.optional(),
          topics: z.array(WaTopicSchema).optional(),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ disputeText, domain, topics, limit }) => {
        const result = corpus.findSupporting(disputeText, { domain, topics, limit });
        const results = result.hits.map(serializeHit);
        return toolResult({
          count: results.length,
          results,
          ...resultFields(result),
          ...(results.length === 0 ? { hint: EMPTY_SEARCH_HINT } : {}),
          caveat: EDUCATIONAL_CAVEAT,
          legalNote: LEGAL_ADVICE_NOTE,
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
const FACTS_TO_VERIFY_BASE: readonly string[] = [
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

export function buildWaBuildRebuttalPacketTool(corpus: WaCorpus): ToolRegistrar {
  const freshness = corpus.freshness();
  return (server) => {
    server.registerTool(
      'wa_build_rebuttal_packet',
      {
        title: 'Build Washington rebuttal packet',
        description: withFreshness(
          WA_BUILD_REBUTTAL_PACKET_DESCRIPTION,
          freshness,
          ITEM_NOUN_PLURAL,
        ),
        inputSchema: {
          disputeText: z.string().min(1).describe("The dispute, in the user's own words."),
          facts: z.array(z.string().min(1)).optional().describe('Known claim facts, verbatim.'),
          topics: z.array(WaTopicSchema).optional(),
          limit: z.coerce.number().int().min(1).max(12).default(5),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ disputeText, facts, topics, limit }) => {
        // Insurance-scoped by construction: a rebuttal packet is an insurer
        // conversation. Safety and employment questions route to search.
        const result = corpus.findSupporting(disputeText, {
          domain: 'insurance',
          topics,
          limit,
        });
        const authorities = result.hits.map(serializeHit);
        return toolResult({
          issueSummary: {
            disputeText,
            factsProvided: facts ?? null,
            topics: topics ?? [],
          },
          authorities,
          // Describes the match; never echoes the dispute text back into the
          // notes (the branch interpolated raw user text into every note).
          howTheyMayApply: authorities.map((authority) => ({
            cite: authority.cite,
            note:
              `${authority.cite} (${authority.heading}) matched the dispute description. ` +
              'Read the quoted text and verify the facts against the official source before citing it.',
          })),
          factsToVerify: factsToVerify(authorities),
          suggestedCitationList: authorities.map((authority) => authority.citation.shortForm),
          caveat: EDUCATIONAL_CAVEAT,
          legalNote: LEGAL_ADVICE_NOTE,
          ...freshnessFields(freshness, {
            note: impliesRecency(disputeText, freshness),
            itemNounPlural: ITEM_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

/** Register the four wa_* tools. Pair with registerWaConnectorTools. */
export function registerWaTools(server: RepairMCPServer<WaItem>, corpus: WaCorpus): void {
  server.registerCustomTool(buildWaSearchAuthorityTool(corpus));
  server.registerCustomTool(buildWaGetAuthorityTool(corpus));
  server.registerCustomTool(buildWaFindSupportingAuthorityTool(corpus));
  server.registerCustomTool(buildWaBuildRebuttalPacketTool(corpus));
}
