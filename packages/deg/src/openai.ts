/**
 * DEG's ChatGPT connector surface: the `search` and `fetch` tools.
 *
 * These sit alongside the four `deg_*` tools rather than replacing them. A
 * client that understands the richer surface (Claude) uses it; ChatGPT looks
 * for `search` and `fetch` by name and uses those.
 *
 * The asymmetry worth knowing about: ChatGPT never sees a `citation` object,
 * because the connector contract has no field for one. `citation.shortForm` is
 * therefore carried in `fetch`'s metadata and named in the tool description —
 * that is the only path by which citation discipline reaches ChatGPT at all.
 */
import {
  buildOpenAiFetchTool,
  buildOpenAiSearchTool,
  type ConnectorDocument,
  type CorpusFreshness,
  type RepairMCPServer,
  type ToolRegistrar,
} from '@repairmcp/core';
import { formatDegCitation } from './identity.js';
import type { DegSource } from './ports.js';
import type { DEGInquiry } from './schema.js';

const DEG_CONNECTOR_SEARCH_DESCRIPTION = `Search the Database Enhancement Gateway (DEG) — the collision repair industry's authoritative record of how labor times, included operations, and "not-included" items have been resolved across the CCC, Mitchell, and Audatex estimating databases. 22,652 inquiries going back to 2007.

USE THIS WHEN:
- Writing or reviewing a repair supplement and you need precedent for a line item an insurer cut, denied, or short-paid
- Someone asks whether an operation is included or non-included — blend time, weld-thru primer, R&I for access, feather-prime-block, underhood lamp aim, frame measurement during blueprinting
- A P-pages, MOTOR GTE, Mitchell DBRM, or Audatex Qapter question comes up and you want to see whether DEG has ruled on it
- Reviewing a DRP estimate and you want to check an item against industry consensus before agreeing to it

INPUT: query — plain shop-floor language works best. "R&I rear bumper for refinish on adjacent panel", "weld-thru primer non-included", "blend time two-tone refinish".

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt only. Call fetch with an id to read the full issue summary, suggested action, and the IP's resolution before quoting anything in a supplement.`;

const DEG_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one complete DEG inquiry by id — the full issue summary, the submitter's suggested action, and the information provider's official resolution.

USE THIS WHEN:
- A search hit looks like strong precedent and you need the complete text before citing it
- You need to confirm the inquiry's status before relying on it — never cite an unresolved inquiry as established practice
- You need to check vehicle applicability (year / make / model / body) before applying a resolution to an estimate; DEG resolutions are sometimes platform-specific

INPUT: id — the inquiry id from a search result, e.g. "40990".

OUTPUT: { id, title, text, url, metadata }. text is the full record. url is the DEG page on degweb.org — cite it.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "DEG #40990 (4/8/2026)". Use it verbatim in supplement narratives, rebuttal letters, and estimate notes. Never paraphrase it, never reformat the date, never drop the # or the parentheses — that string is how an insurer's auditor cross-references back to the source entry. metadata.status tells you whether the inquiry is resolved or still pending with the IP.`;

/** Blank-safe section join: an absent field contributes nothing, not "undefined". */
function section(label: string, value: string | undefined): string | null {
  const v = value?.trim();
  return v ? `${label}: ${v}` : null;
}

/**
 * Flatten an inquiry into the one text blob the connector contract allows.
 *
 * Labelled sections rather than raw concatenation: the model has to be able to
 * tell the submitter's *suggested* action apart from the IP's *actual*
 * resolution, and running them together loses exactly the distinction that
 * decides whether an operation is established practice.
 */
export function degInquiryToDocument(inq: DEGInquiry): ConnectorDocument {
  const vehicle = [inq.vehicleYear, inq.vehicleMake, inq.vehicleModel, inq.body]
    .filter(Boolean)
    .join(' ');
  const citation = formatDegCitation(inq);

  const text = [
    section('Inquiry', `DEG #${inq.inquiryNumber}`),
    section('Information provider', inq.ip ?? 'not identified'),
    section('Inquiry type', inq.inquiryType),
    section('Area of vehicle', inq.areaOfVehicle),
    section('Vehicle', vehicle),
    section('Status', inq.status),
    section('Issue', inq.issueSummary),
    section('Suggested action', inq.suggestedAction),
    section('Resolution', inq.resolution),
  ]
    .filter((s): s is string => s !== null)
    .join('\n\n');

  return {
    text,
    metadata: {
      citation: citation.shortForm,
      citationLong: citation.longForm,
      ip: inq.ip,
      status: inq.status,
      inquiryType: inq.inquiryType,
      areaOfVehicle: inq.areaOfVehicle,
      vehicleYear: inq.vehicleYear,
      vehicleMake: inq.vehicleMake,
      vehicleModel: inq.vehicleModel,
      submittedAt: inq.submittedAt.toISOString(),
      resolvedAt: inq.resolvedAt?.toISOString(),
    },
  };
}

export function buildDegConnectorSearchTool(
  adapter: DegSource,
  freshness?: CorpusFreshness,
): ToolRegistrar {
  return buildOpenAiSearchTool(adapter, {
    description: DEG_CONNECTOR_SEARCH_DESCRIPTION,
    title: 'Search DEG',
    toDocument: degInquiryToDocument,
    freshness,
  });
}

export function buildDegConnectorFetchTool(
  adapter: DegSource,
  freshness?: CorpusFreshness,
): ToolRegistrar {
  return buildOpenAiFetchTool(adapter, {
    description: DEG_CONNECTOR_FETCH_DESCRIPTION,
    title: 'Fetch DEG inquiry',
    toDocument: degInquiryToDocument,
    freshness,
  });
}

/**
 * Register the two OpenAI connector tools. Pair with `registerDegTools`.
 *
 * These two matter most for freshness: the wrong-currency claim that prompted
 * all of this came from ChatGPT, which sees no `citation` object and reaches the
 * corpus only through here.
 */
export async function registerDegConnectorTools(
  server: RepairMCPServer<DEGInquiry>,
  adapter: DegSource,
): Promise<void> {
  const freshness = (await adapter.corpusMeta()) ?? undefined;
  server.registerCustomTool(buildDegConnectorSearchTool(adapter, freshness));
  server.registerCustomTool(buildDegConnectorFetchTool(adapter, freshness));
}
