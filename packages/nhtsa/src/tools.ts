/**
 * The seven NHTSA MCP tools: five live (recalls, complaints, VIN) and two
 * corpus-backed (the 49 U.S.C. ch. 301 statute). Descriptions follow the DEG
 * gold standard — "USE THIS WHEN: / INPUT: / OUTPUT:" in shop-floor language —
 * because they are the model's routing signal.
 *
 * Failure honesty, enforced structurally:
 *   - live handlers never throw: every upstream call goes through callNhtsa
 *     and an outage returns an `unavailable` payload that says so
 *   - zero results with a model name NHTSA does not recognize come back with
 *     NHTSA's own model vocabulary, because an exact-match miss ("TRANSIT
 *     CONNECT" vs "TRANSIT") is indistinguishable from a true zero otherwise
 *   - the law tools state the corpus's own currency and the not-legal-advice
 *     line; the live tools state that they are live
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
import type { NhtsaClient, VehicleLookupInput } from './client.js';
import type { LawCorpus } from './laws/adapter.js';
import { LEGAL_ADVICE_NOTE } from './laws/notes.js';
import {
  formatComplaintCitation,
  formatLawCitation,
  formatRecallCitation,
} from './identity.js';
import { LIVE_SENTENCE, callNhtsa, nowIso, type NhtsaUnavailablePayload } from './live.js';
import { scoreComplaintRelevance, textContainsSearchTerm } from './relevance.js';
import { resolveVehicle } from './resolve-vehicle.js';
import type { NhtsaItem } from './adapter.js';
import type { NhtsaComplaint } from './schema.js';

// ─────────────────────────────────────────────────────────────────────
// Shared plumbing
// ─────────────────────────────────────────────────────────────────────

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

const VEHICLE_INPUT = {
  vin: z
    .string()
    .optional()
    .describe(
      'A 17-character VIN. Decoded through NHTSA vPIC; only the last six characters are ever returned.',
    ),
  modelYear: z.coerce
    .number()
    .int()
    .optional()
    .describe('Model year, e.g. 2020. Required unless vin is given.'),
  make: z.string().optional().describe('Vehicle make, e.g. "Ford". Required unless vin is given.'),
  model: z
    .string()
    .optional()
    .describe(
      'Model per NHTSA vocabulary, e.g. "Transit". Required unless vin is given. On a zero result the payload lists NHTSA\'s own model names.',
    ),
};

function compactModelName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/**
 * Explain a zero result. NHTSA matches model names exactly, so "TRANSIT
 * CONNECT" vs "TRANSIT" returns an empty set that looks identical to a true
 * "no records" — the difference matters, so the payload says which it is,
 * with NHTSA's own vocabulary attached when it looks like a mismatch.
 */
async function zeroResultDiagnosis(
  client: NhtsaClient,
  lookup: VehicleLookupInput,
  issueType: 'r' | 'c',
  noun: string,
): Promise<{ note: string; knownModels?: string[] }> {
  const vocabulary = await callNhtsa(() =>
    client.listModels({ modelYear: lookup.modelYear, make: lookup.make }, issueType),
  );
  if (!vocabulary.ok) {
    return {
      note:
        `NHTSA returned zero ${noun} for this vehicle, and the model-vocabulary check did not ` +
        'answer, so a model-name mismatch cannot be ruled out. NHTSA matches model names ' +
        'exactly — verify the model name before treating this as "no records exist".',
    };
  }

  const compactQuery = compactModelName(lookup.model);
  const known = vocabulary.value;
  const exact = known.some((name) => compactModelName(name) === compactQuery);
  if (exact) {
    return {
      note: `NHTSA lists zero ${noun} for this vehicle. The model name matches NHTSA's vocabulary, so this is a true zero as of the retrievedAt time.`,
    };
  }

  const near = known.filter((name) => {
    const compact = compactModelName(name);
    return compact.startsWith(compactQuery) || compactQuery.startsWith(compact);
  });
  return {
    note:
      `Zero ${noun} returned, and "${lookup.model}" is not in NHTSA's model list for ` +
      `${lookup.make} ${lookup.modelYear}. A model-name mismatch returns zero even when records ` +
      `exist. ${near.length > 0 ? `Nearest NHTSA model names: ${near.join(', ')}. ` : ''}` +
      'Retry with one of knownModels.',
    knownModels: known.slice(0, 40),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Descriptions
// ─────────────────────────────────────────────────────────────────────

/**
 * NHTSA rejects an unrecognized make/model with HTTP 400 (verified live
 * 2026-08-27). That is NHTSA answering, not NHTSA down — so a 400 that
 * survives the client's model-candidate fallback becomes a vocabulary
 * diagnosis, never an "unavailable" payload. Everything else stays an outage.
 */
async function vehicleRejectedPayload(
  client: NhtsaClient,
  lookup: VehicleLookupInput,
  vehicle: Record<string, unknown>,
  issueType: 'r' | 'c',
  noun: string,
): Promise<Record<string, unknown>> {
  const diagnosis = await zeroResultDiagnosis(client, lookup, issueType, noun);
  return {
    vehicle,
    vehicleNotRecognized: true,
    note:
      `NHTSA did not recognize this vehicle description (it answered HTTP 400 — this is not ` +
      `an outage and not evidence that no ${noun} exist). ${diagnosis.note}`,
    ...(diagnosis.knownModels ? { knownModels: diagnosis.knownModels } : {}),
    retrievedAt: nowIso(),
  };
}

function isVehicleRejection(payload: NhtsaUnavailablePayload): boolean {
  return payload.httpStatus === 400;
}

const CHECK_RECALLS_DESCRIPTION = `Check a vehicle for federal recall campaigns, live from NHTSA.

USE THIS WHEN:
- Running an open-recall check before delivery, at drop-off, or during blueprinting — any vehicle in the shop deserves one
- The repair touches a system recalls concentrate in: air bags, seat belts, steering, brakes, driveline, lighting, latches
- A customer asks whether their vehicle has a recall, in any wording

INPUT: either vin (17 characters, decoded through NHTSA's own vPIC service) or all three of modelYear, make, model.

OUTPUT: { vehicle, recallCount, recalls, retrievedAt }. Each recall carries the campaign number, component, summary, consequence, remedy, report date, stop-drive flags (parkIt / parkOutSide), and a citation — use citation.shortForm verbatim, e.g. "NHTSA Recall 21V978000 (reported 12/16/2021)". A recall listed for the year/make/model does not prove that a specific VIN's remedy is still open — that check belongs to NHTSA's VIN lookup or the dealer, and the payload says so.`;

const SEARCH_COMPLAINTS_DESCRIPTION = `Search consumer complaints filed with NHTSA for a vehicle, ranked for collision-repair relevance.

USE THIS WHEN:
- The same failure has shown up on the same platform more than once and you want to know whether the field agrees — the pattern behind a complaint you have now seen three times
- A supplement, customer letter, or dispute needs countable evidence that a failure mode exists in the field
- Deciding whether a post-repair symptom is likely pre-existing for that platform

INPUT: a vehicle (vin, or modelYear + make + model), optional keyword matched against complaint narratives and components ("steering", "driveshaft", "cam phaser"), optional component, optional limit (default 10, max 50).

OUTPUT: { vehicle, totalComplaints, matched, tallies, complaints, allegationCaveat, retrievedAt }. tallies counts crashes, fires, injuries, and deaths across the matched set — numbers you can quote. Each complaint carries its ODI number, narrative, filed date, relevance breakdown, and citation. CAVEAT: complaints are consumer allegations, not NHTSA defect findings — repeat that caveat whenever you quote one.`;

const DECODE_VIN_DESCRIPTION = `Decode a VIN through NHTSA's vPIC service to identify a vehicle.

USE THIS WHEN: you have a VIN and need year, make, model, trim, or body class — usually as the first step of a recall or complaint check when the customer gave you a VIN instead of a vehicle description.

INPUT: vin — one 17-character VIN. Optional modelYear sharpens decodes on older vehicles.

OUTPUT: { vehicle, retrievedAt } with modelYear, make, model, trim, bodyClass, vehicleType. Only the last six characters of the VIN are ever returned; the full VIN is passed to NHTSA's decoder and is not stored or logged.`;

const GET_RECALL_DESCRIPTION = `Fetch one recall campaign by its NHTSA campaign number.

USE THIS WHEN: you already have a campaign number — from a recall check, an OEM position statement, or a customer's recall letter — and need the complete record, including potential units affected, before citing it.

INPUT: campaignNumber, e.g. "21V978000".

OUTPUT: { found, recallCount, recalls, retrievedAt } with the complete campaign record and citation. found false means NHTSA has no campaign under that number as of retrievedAt — verify the number before concluding the recall does not exist.`;

const GET_COMPLAINT_DESCRIPTION = `Fetch one consumer complaint by its ODI number.

USE THIS WHEN: a complaint search surfaced an ODI number and you need the full narrative before quoting it, or a document cites an ODI number you want to verify.

INPUT: odiNumber, e.g. "11753468".

OUTPUT: { found, complaints, retrievedAt } with the complete complaint and citation. CAVEAT: complaints are consumer allegations, not NHTSA defect findings.`;

const SEARCH_SAFETY_LAW_DESCRIPTION = `Search the federal motor vehicle safety statute — 49 U.S.C. chapter 301 — and get ranked sections with pasteable citations.

USE THIS WHEN:
- Anyone asks whether a shop, dealer, or insurer may disable, remove, or leave inoperative a safety device or ADAS component — that is §30122 "make inoperative", and it names motor vehicle repair businesses directly
- Recall obligations come up: who must remedy a recalled vehicle, at whose cost, and on what notice (§§30118 through 30120A)
- A supplement note or dispute letter needs what federal law actually says, not a paraphrase from memory

INPUT: query — plain language works: "disable safety device", "recall remedy free of charge", "used vehicle recall obligations".

OUTPUT: { sections, corpusCurrentThrough } — ranked sections, each with number, heading, snippet, and a citation like "49 U.S.C. §30122 (current through P.L. 119-87, 4/30/2026)". Call nhtsa_get_law_section for the full text before quoting anything.

${LEGAL_ADVICE_NOTE}`;

const GET_LAW_SECTION_DESCRIPTION = `Fetch the complete text of one section of 49 U.S.C. chapter 301, verbatim.

USE THIS WHEN: quoting the statute in a supplement narrative, dispute letter, or customer explanation — always quote from this text, never from memory, and carry the section number and currency with the quote.

INPUT: section — "30122", "§30122", and "30120A" all work.

OUTPUT: { found, section } with the full statutory text (subsection lettering preserved) and its citation. found false means chapter 301 has no such section — use nhtsa_search_safety_law to find the right one.

${LEGAL_ADVICE_NOTE}`;

// ─────────────────────────────────────────────────────────────────────
// Live tools
// ─────────────────────────────────────────────────────────────────────

export function buildCheckRecallsTool(client: NhtsaClient): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'nhtsa_check_recalls',
      {
        title: 'Check NHTSA recalls',
        description: `${CHECK_RECALLS_DESCRIPTION}\n\n${LIVE_SENTENCE}`,
        inputSchema: VEHICLE_INPUT,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (input) => {
        const resolved = await resolveVehicle(client, input);
        if (!resolved.ok) return toolResult(resolved.payload);

        const recalls = await callNhtsa(() => client.getRecalls(resolved.lookup));
        if (!recalls.ok) {
          if (isVehicleRejection(recalls.payload)) {
            return toolResult(
              await vehicleRejectedPayload(
                client,
                resolved.lookup,
                resolved.vehicle as unknown as Record<string, unknown>,
                'r',
                'recall campaigns',
              ),
            );
          }
          return toolResult({ vehicle: resolved.vehicle, ...recalls.payload });
        }

        const payload: Record<string, unknown> = {
          vehicle: resolved.vehicle,
          recallCount: recalls.value.length,
          recalls: recalls.value.map((recall) => ({
            ...recall,
            citation: citationFields(formatRecallCitation(recall)),
          })),
          vinRemedyNote:
            'A campaign listed for this year/make/model does not prove an individual VIN still has an open remedy. VIN-specific status comes from nhtsa.gov/recalls or the dealer.',
          retrievedAt: nowIso(),
        };

        if (recalls.value.length === 0) {
          const diagnosis = await zeroResultDiagnosis(
            client,
            resolved.lookup,
            'r',
            'recall campaigns',
          );
          payload['note'] = diagnosis.note;
          if (diagnosis.knownModels) payload['knownModels'] = diagnosis.knownModels;
        }

        return toolResult(payload);
      },
    );
  };
}

const SEARCH_COMPLAINTS_INPUT = {
  ...VEHICLE_INPUT,
  keyword: z
    .string()
    .optional()
    .describe('Filter and rank by this term in complaint narratives and components.'),
  component: z.string().optional().describe('Filter by NHTSA component name, e.g. "SERVICE BRAKES".'),
  limit: z.coerce.number().int().min(1).max(50).default(10).describe('Max complaints returned.'),
};

function complaintMatchesFilters(
  complaint: NhtsaComplaint,
  keyword: string | undefined,
  component: string | undefined,
): boolean {
  const haystack = `${complaint.summary ?? ''} ${complaint.component ?? ''}`.toLowerCase();
  if (keyword && !textContainsSearchTerm(haystack, keyword)) return false;
  if (component && !textContainsSearchTerm((complaint.component ?? '').toLowerCase(), component)) {
    return false;
  }
  return true;
}

export function buildSearchComplaintsTool(client: NhtsaClient): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'nhtsa_search_complaints',
      {
        title: 'Search NHTSA complaints',
        description: `${SEARCH_COMPLAINTS_DESCRIPTION}\n\n${LIVE_SENTENCE}`,
        inputSchema: SEARCH_COMPLAINTS_INPUT,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (input) => {
        const resolved = await resolveVehicle(client, input);
        if (!resolved.ok) return toolResult(resolved.payload);

        const complaints = await callNhtsa(() => client.searchComplaints(resolved.lookup));
        if (!complaints.ok) {
          if (isVehicleRejection(complaints.payload)) {
            return toolResult(
              await vehicleRejectedPayload(
                client,
                resolved.lookup,
                resolved.vehicle as unknown as Record<string, unknown>,
                'c',
                'complaints',
              ),
            );
          }
          return toolResult({ vehicle: resolved.vehicle, ...complaints.payload });
        }

        const matched = complaints.value.filter((complaint) =>
          complaintMatchesFilters(complaint, input.keyword, input.component),
        );
        const ranked = matched
          .map((complaint) => ({
            complaint,
            relevance: scoreComplaintRelevance(complaint, {
              keyword: input.keyword,
              component: input.component,
            }),
          }))
          .sort(
            (a, b) =>
              b.relevance.score - a.relevance.score ||
              (b.complaint.dateComplaintFiled ?? '').localeCompare(
                a.complaint.dateComplaintFiled ?? '',
              ),
          )
          .slice(0, input.limit);

        const tallies = {
          crashes: matched.filter((c) => c.crash).length,
          fires: matched.filter((c) => c.fire).length,
          injuries: matched.reduce((sum, c) => sum + (c.injuryCount ?? 0), 0),
          deaths: matched.reduce((sum, c) => sum + (c.deathCount ?? 0), 0),
        };

        const payload: Record<string, unknown> = {
          vehicle: resolved.vehicle,
          totalComplaints: complaints.value.length,
          matched: matched.length,
          tallies,
          complaints: ranked.map(({ complaint, relevance }) => ({
            ...complaint,
            relevance: {
              score: relevance.score,
              matchedTerms: relevance.matchedTerms,
              breakdown: relevance.breakdown,
            },
            citation: citationFields(formatComplaintCitation(complaint)),
          })),
          allegationCaveat:
            'Consumer complaints are allegations submitted to NHTSA; they are not NHTSA defect findings.',
          retrievedAt: nowIso(),
        };

        if (complaints.value.length === 0) {
          const diagnosis = await zeroResultDiagnosis(client, resolved.lookup, 'c', 'complaints');
          payload['note'] = diagnosis.note;
          if (diagnosis.knownModels) payload['knownModels'] = diagnosis.knownModels;
        } else if (matched.length === 0) {
          payload['note'] =
            `NHTSA holds ${complaints.value.length} complaints for this vehicle, but none matched ` +
            'the keyword/component filter. Loosen the filter to see them.';
        }

        return toolResult(payload);
      },
    );
  };
}

export function buildDecodeVinTool(client: NhtsaClient): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'nhtsa_decode_vin',
      {
        title: 'Decode a VIN',
        description: `${DECODE_VIN_DESCRIPTION}\n\n${LIVE_SENTENCE}`,
        inputSchema: {
          vin: z.string().describe('The 17-character VIN to decode.'),
          modelYear: z.coerce.number().int().optional().describe('Optional model year hint.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (input) => {
        const resolved = await resolveVehicle(client, {
          vin: input.vin,
          modelYear: input.modelYear,
        });
        if (!resolved.ok) return toolResult(resolved.payload);
        return toolResult({ vehicle: resolved.vehicle, retrievedAt: nowIso() });
      },
    );
  };
}

export function buildGetRecallTool(client: NhtsaClient): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'nhtsa_get_recall',
      {
        title: 'Fetch a recall campaign',
        description: `${GET_RECALL_DESCRIPTION}\n\n${LIVE_SENTENCE}`,
        inputSchema: {
          campaignNumber: z.coerce
            .string()
            .describe('The NHTSA campaign number, e.g. "21V978000".'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ campaignNumber }) => {
        const recalls = await callNhtsa(() => client.getCampaign(campaignNumber.trim()));
        if (!recalls.ok) return toolResult({ campaignNumber, ...recalls.payload });

        return toolResult({
          found: recalls.value.length > 0,
          campaignNumber,
          recallCount: recalls.value.length,
          recalls: recalls.value.map((recall) => ({
            ...recall,
            citation: citationFields(formatRecallCitation(recall)),
          })),
          ...(recalls.value.length === 0
            ? {
                note: 'NHTSA has no campaign under this number as of retrievedAt. Verify the number — a mistyped campaign number and a nonexistent recall look identical here.',
              }
            : {}),
          retrievedAt: nowIso(),
        });
      },
    );
  };
}

export function buildGetComplaintTool(client: NhtsaClient): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'nhtsa_get_complaint',
      {
        title: 'Fetch a complaint',
        description: `${GET_COMPLAINT_DESCRIPTION}\n\n${LIVE_SENTENCE}`,
        inputSchema: {
          odiNumber: z.coerce.string().describe('The ODI complaint number, e.g. "11753468".'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ odiNumber }) => {
        const complaints = await callNhtsa(() => client.getComplaint(odiNumber.trim()));
        if (!complaints.ok) return toolResult({ odiNumber, ...complaints.payload });

        return toolResult({
          found: complaints.value.length > 0,
          odiNumber,
          complaints: complaints.value.map((complaint) => ({
            ...complaint,
            citation: citationFields(formatComplaintCitation(complaint)),
          })),
          ...(complaints.value.length === 0
            ? { note: 'NHTSA has no complaint under this ODI number as of retrievedAt.' }
            : {}),
          retrievedAt: nowIso(),
        });
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// Law tools (corpus-backed — no upstream, no unavailable path)
// ─────────────────────────────────────────────────────────────────────

const LAW_NOUN_PLURAL = 'statute sections';

export function buildSearchSafetyLawTool(laws: LawCorpus): ToolRegistrar {
  const freshness = laws.freshness();
  return (server) => {
    server.registerTool(
      'nhtsa_search_safety_law',
      {
        title: 'Search federal vehicle safety law',
        description: withFreshness(SEARCH_SAFETY_LAW_DESCRIPTION, freshness, LAW_NOUN_PLURAL),
        inputSchema: {
          query: z
            .string()
            .describe('Plain-language question or terms, e.g. "disable safety device".'),
          limit: z.coerce.number().int().min(1).max(20).default(5),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, limit }) => {
        const hits = laws.searchLaws(query, limit);
        return toolResult({
          sections: hits.map((hit) => ({
            section: hit.section.section,
            heading: hit.section.heading,
            subchapter: hit.section.subchapter,
            score: hit.score,
            snippet: hit.snippet,
            citation: citationFields(formatLawCitation(hit.section, laws.meta)),
          })),
          ...(hits.length === 0
            ? {
                note: `No sections of 49 U.S.C. chapter 301 matched. The chapter covers motor vehicle safety standards, recalls, and the make-inoperative prohibition — state law and FMVSS regulations are outside it.`,
              }
            : {}),
          legalNote: LEGAL_ADVICE_NOTE,
          ...freshnessFields(freshness, {
            note: impliesRecency(query, freshness),
            itemNounPlural: LAW_NOUN_PLURAL,
          }),
        });
      },
    );
  };
}

export function buildGetLawSectionTool(laws: LawCorpus): ToolRegistrar {
  const freshness = laws.freshness();
  return (server) => {
    server.registerTool(
      'nhtsa_get_law_section',
      {
        title: 'Fetch a safety law section',
        description: withFreshness(GET_LAW_SECTION_DESCRIPTION, freshness, LAW_NOUN_PLURAL),
        inputSchema: {
          section: z.coerce.string().describe('Section number: "30122", "§30122", "30120A".'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ section }) => {
        const found = laws.getSection(section);
        if (!found) {
          return toolResult({
            found: false,
            section,
            note: `49 U.S.C. chapter 301 has no section "${section}". Use nhtsa_search_safety_law to find the section you need.`,
            legalNote: LEGAL_ADVICE_NOTE,
            ...freshnessFields(freshness),
          });
        }

        return toolResult({
          found: true,
          section: {
            section: found.section,
            heading: found.heading,
            subchapter: found.subchapter,
            text: found.text,
            citation: citationFields(formatLawCitation(found, laws.meta)),
          },
          legalNote: LEGAL_ADVICE_NOTE,
          ...freshnessFields(freshness),
        });
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────

/** Register all seven nhtsa_* tools. Pair with `registerNhtsaConnectorTools`. */
export function registerNhtsaTools(
  server: RepairMCPServer<NhtsaItem>,
  client: NhtsaClient,
  laws: LawCorpus,
): void {
  server.registerCustomTool(buildCheckRecallsTool(client));
  server.registerCustomTool(buildSearchComplaintsTool(client));
  server.registerCustomTool(buildDecodeVinTool(client));
  server.registerCustomTool(buildGetRecallTool(client));
  server.registerCustomTool(buildGetComplaintTool(client));
  server.registerCustomTool(buildSearchSafetyLawTool(laws));
  server.registerCustomTool(buildGetLawSectionTool(laws));
}
