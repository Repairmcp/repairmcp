/**
 * NHTSA's ChatGPT connector surface: the `search` and `fetch` tools.
 *
 * Same asymmetry as DEG's connector (see packages/deg/src/openai.ts): ChatGPT
 * never sees a `citation` object, so `citation.shortForm` rides in fetch
 * metadata and the description tells the model to use it verbatim.
 *
 * No `freshness` opts are passed to the core builders — this is a mixed
 * live/corpus source. The live records are as current as NHTSA itself and
 * carry `retrievedAt`; each law document states its own currency inside its
 * text and citation. A single corpus-cutoff sentence would be wrong for the
 * live half and redundant for the law half.
 */
import {
  buildOpenAiFetchTool,
  buildOpenAiSearchTool,
  type ConnectorDocument,
  type RepairMCPServer,
} from '@repairmcp/core';
import type { NhtsaItem, NhtsaLiveAdapter } from './adapter.js';
import {
  formatComplaintCitation,
  formatLawCitation,
  formatRecallCitation,
} from './identity.js';
import { LEGAL_ADVICE_NOTE } from './laws/notes.js';
import type { NhtsaLawSection } from './laws/schema.js';
import type { NhtsaComplaint, NhtsaRecall } from './schema.js';
import { nowIso } from './live.js';

const NHTSA_CONNECTOR_SEARCH_DESCRIPTION = `Search NHTSA — federal recall campaigns and consumer complaints queried live from NHTSA's public data services, plus the federal motor vehicle safety statute (49 U.S.C. chapter 301, including the §30122 "make inoperative" prohibition that binds repair shops).

USE THIS WHEN:
- Checking a vehicle for open recalls before delivery or during repair planning
- Someone has seen the same failure on the same platform more than once and wants to know whether NHTSA complaints show a pattern
- A question about what federal law says a repair shop, dealer, or insurer may do — disabling or removing safety devices, recall repair obligations, remedies without charge

INPUT: query — one string. For vehicles, lead with year make model, then keywords: "2020 Ford Transit steering". For legal questions, plain language works: "disable safety device", "recall remedy free of charge".

OUTPUT: results — up to 10 matches, each { id, title, text, url }. Recall and complaint results are live from NHTSA at request time. Law results quote 49 U.S.C. ch. 301 and state their own currency. Call fetch with an id before quoting anything.`;

const NHTSA_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one complete NHTSA record by id: a recall campaign ("recall:21V978000"), a consumer complaint ("complaint:11753468"), or a section of the federal vehicle safety statute ("law:30122").

USE THIS WHEN: a search hit looks relevant and you need the full record before citing it — the complete recall remedy text, the full complaint narrative, or the exact statutory wording.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. Recalls and complaints are fetched live from NHTSA; metadata.retrievedAt says when. Complaints are consumer allegations, not NHTSA defect findings — the text says so and you must preserve that caveat. Law sections quote the statute verbatim; they are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "NHTSA Recall 21V978000 (reported 12/16/2021)" or "49 U.S.C. §30122 (current through P.L. 119-87, 4/30/2026)". Use it verbatim — never reformat the date, never drop the campaign number.`;

function joinSections(parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null).join('\n\n');
}

function section(label: string, value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const text = String(value).trim();
  return text ? `${label}: ${text}` : null;
}

function recallDocument(recall: NhtsaRecall): ConnectorDocument {
  const citation = formatRecallCitation(recall);
  const stopDrive =
    recall.parkIt || recall.parkOutSide
      ? [
          recall.parkIt ? 'PARK IT — do not drive' : null,
          recall.parkOutSide ? 'PARK OUTSIDE — fire risk while parked' : null,
        ]
          .filter(Boolean)
          .join('; ')
      : undefined;

  return {
    text: joinSections([
      section('Recall campaign', recall.campaignNumber),
      section('Manufacturer', recall.manufacturer),
      section('Component', recall.component),
      section('Report received', recall.reportReceivedDate),
      section('Stop-drive advisory', stopDrive),
      section('Units affected', recall.unitsAffected),
      section('Summary', recall.summary),
      section('Consequence', recall.consequence),
      section('Remedy', recall.remedy),
      section('Notes', recall.notes),
    ]),
    metadata: {
      citation: citation.shortForm,
      citationLong: citation.longForm,
      kind: 'recall',
      campaignNumber: recall.campaignNumber,
      reportReceivedDate: recall.reportReceivedDate,
      parkIt: recall.parkIt,
      parkOutSide: recall.parkOutSide,
      retrievedAt: nowIso(),
    },
  };
}

function complaintDocument(complaint: NhtsaComplaint): ConnectorDocument {
  const citation = formatComplaintCitation(complaint);
  const vehicle = [complaint.modelYear, complaint.make, complaint.model]
    .filter(Boolean)
    .join(' ');

  return {
    text: joinSections([
      section('Consumer complaint', `ODI ${complaint.odiNumber}`),
      section('Vehicle', vehicle || undefined),
      section('Component', complaint.component),
      section('Filed', complaint.dateComplaintFiled),
      section('Crash', complaint.crash === undefined ? undefined : complaint.crash ? 'yes' : 'no'),
      section('Fire', complaint.fire === undefined ? undefined : complaint.fire ? 'yes' : 'no'),
      section('Injuries', complaint.injuryCount),
      section('Deaths', complaint.deathCount),
      section('Narrative', complaint.summary),
      section('Caveat', complaint.allegationCaveat),
    ]),
    metadata: {
      citation: citation.shortForm,
      citationLong: citation.longForm,
      kind: 'complaint',
      odiNumber: complaint.odiNumber,
      crash: complaint.crash,
      fire: complaint.fire,
      injuryCount: complaint.injuryCount,
      deathCount: complaint.deathCount,
      allegationCaveat: complaint.allegationCaveat,
      retrievedAt: nowIso(),
    },
  };
}

export function nhtsaItemToDocument(
  item: NhtsaItem,
  adapter: NhtsaLiveAdapter,
): ConnectorDocument {
  switch (item.metadata.kind) {
    case 'recall':
      return recallDocument(item.metadata.record as NhtsaRecall);
    case 'complaint':
      return complaintDocument(item.metadata.record as NhtsaComplaint);
    case 'law': {
      const law = item.metadata.record as NhtsaLawSection;
      const citation = adapter.formatCitation(item);
      return {
        text: joinSections([
          `49 U.S.C. §${law.section} — ${law.heading}`,
          section('Subchapter', law.subchapter),
          law.text,
          `Currency: ${citation.shortForm}`,
          LEGAL_ADVICE_NOTE,
        ]),
        metadata: {
          citation: citation.shortForm,
          citationLong: citation.longForm,
          kind: 'law',
          sectionNumber: law.section,
          heading: law.heading,
          retrievedAt: nowIso(),
        },
      };
    }
  }
}

/** Register the two OpenAI connector tools. Pair with `registerNhtsaTools`. */
export function registerNhtsaConnectorTools(
  server: RepairMCPServer<NhtsaItem>,
  adapter: NhtsaLiveAdapter,
): void {
  const toDocument = (item: NhtsaItem) => nhtsaItemToDocument(item, adapter);
  server.registerCustomTool(
    buildOpenAiSearchTool(adapter, {
      description: NHTSA_CONNECTOR_SEARCH_DESCRIPTION,
      title: 'Search NHTSA',
      toDocument,
    }),
  );
  server.registerCustomTool(
    buildOpenAiFetchTool(adapter, {
      description: NHTSA_CONNECTOR_FETCH_DESCRIPTION,
      title: 'Fetch NHTSA record',
      toDocument,
    }),
  );
}
