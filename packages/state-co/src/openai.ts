/**
 * Colorado's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as the
 * co_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { CoAdapter, CoItem } from './adapter.js';
import type { CoCorpus } from './corpus.js';
import { coStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const CO_CONNECTOR_SEARCH_DESCRIPTION = `Search Colorado state law for collision repair facilities: insurance claims handling (CRS 10-4-120 anti-steering and payment duties, including the (3)(e) reasonable-repair-costs duty; the CRS 10-3-1104 unfair claims practices catalog; the Model Quality Replacement Parts Act's aftermarket-parts disclosure; DOI Regulation 5-1-14 prompt payment and 5-2-15 total-loss valuation; DOI Bulletin B-5.04), the Motor Vehicle Repair Act (written estimates, charges over the estimate, storage, parts return, invoices), towing rules, and employment rules (the Wage Act and the COMPS Order).

USE THIS WHEN:
- A Colorado claim dispute needs the actual rule: steering, short-pay, OEM procedure payment, supplement, prompt payment, aftermarket parts disclosure, total loss valuation, storage
- A shop obligation question: written estimates and invoices, charges exceeding the estimate, returning replaced parts, storage charges, tow-in rules
- An HR question: rest and meal breaks, the flag-hour overtime exemption question, final paycheck timing, payroll deductions for tools or equipment

KNOWN CAVEATS, answer these honestly instead of inventing law: CRS 10-3-1104 carries NO private right of action (Division of Insurance enforcement; common-law bad faith is case law outside this corpus). The Division of Insurance has publicly declined to decide whether refusing a specific OEM procedure is "unreasonable" under 10-4-120 — the statute text is here, the agency's enforcement posture is a fact to state. The COMPS overtime exemption for salespersons, parts-persons, and mechanics says "dealers" — whether an independent body shop qualifies is an OPEN question, never settled. Colorado has NO state OSHA plan: spray booth, respirator, and hazard communication duties come from federal OSHA (29 CFR), outside this corpus. Repair-lien and mechanic's-lien statutes are not in this corpus. Bulletin B-5.04 is DIVISION GUIDANCE, not law.

INPUT: query — one string. Shop phrasing works ("adjuster is refusing to pay for the OEM repair procedure"); so does a citation ("CRS 10-4-120").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const CO_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Colorado law section by id, e.g. "crs:10-4-120" or "3 ccr:702-5-1-14".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. CCR rules carry their effective date; CRS statutes carry the edition. Law sections quote the law; they are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "CRS 10-4-120, 2026 edition" or "3 CCR 702-5-1-14, effective 12/30/2025". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerCoTools. */
export function registerCoConnectorTools(
  server: RepairMCPServer<CoItem>,
  adapter: CoAdapter,
  corpus: CoCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, coStateIdentity, {
    searchDescription: CO_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: CO_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Colorado law documents',
    fetchTitle: 'Fetch a Colorado law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
