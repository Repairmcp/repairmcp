import type { TxDomain } from './schema.js';

/**
 * The TAC half of the Texas capture manifest. The old texreg.sos.state.tx.us
 * readtac$ URLs are dead; the SOS moved the TAC into an Appian portal whose
 * data endpoint (`_/ui`) answers a plain stateless GET once the client's own
 * protocol headers are supplied (kickoff §3.2). Capture is two-tier like
 * Montana's MCA slot URLs and Colorado's SOS crawl: the browse JSON for a
 * subchapter/division resolves each rule's recordId (NOT derivable from the
 * cite), then the rule-summary JSON carries the verbatim rule text and the
 * Source Note that states its effective dates.
 */
export interface TacCaptureSource {
  code: '28 TAC';
  title: '28';
  part: '1';
  /** Becomes StateSection.chapter, e.g. '5'. */
  chapter: string;
  chapterTitle: string;
  subchapter: string;
  /** Some chapters nest a division under the subchapter; omit when absent. */
  division?: string;
  domain: TxDomain;
  /** Rule cites wanted from this browse page, e.g. '5.501'. Hard-fail when absent. */
  ruleCites: readonly string[];
  note?: string;
}

export const TAC_PORTAL_BASE = 'https://texas-sos.appianportalsgov.com/rules-and-meetings';

/**
 * The Appian client's own protocol headers, without which `_/ui` answers 406
 * "Client not supported". The two feature values are hex renderings of a
 * BigInt constant in the portal's JS bundle (`E=Object.freeze({Accept:…})` in
 * portals-*.cache.js) — verified cookie-free with the RepairMCP-Bot agent
 * 2026-08-31. They are PINNED: an Appian platform upgrade that changes them
 * turns every TAC fetch into a 406 and capture hard-fails loudly — re-derive
 * the values from the bundle (search it for "X-Appian-Features") and update
 * here. That failure mode is the tripwire, never silent staleness.
 */
export const TAC_APPIAN_HEADERS: Record<string, string> = {
  'X-Appian-Features': '7ffceebc',
  'X-Appian-Features-Extended': '3fff779fffdbff7f49dc1fffceebc',
  'X-Appian-Ui-State': 'stateful',
  'x-appian-suppress-www-authenticate': 'true',
};
export const TAC_ACCEPT = 'application/vnd.appian.tv.ui+json';

export function tacBrowseUrl(source: TacCaptureSource): string {
  const division = source.division ? `&division=${source.division}` : '';
  return (
    `${TAC_PORTAL_BASE}/_/ui?interface=VIEW_TAC&title=${source.title}&part=${source.part}` +
    `&chapter=${source.chapter}&subchapter=${source.subchapter}${division}&$locale=en_US`
  );
}

export function tacRuleUrl(recordId: string, queryAsDate: string): string {
  return (
    `${TAC_PORTAL_BASE}/_/ui?interface=VIEW_TAC_SUMMARY&recordId=${recordId}` +
    `&queryAsDate=${encodeURIComponent(queryAsDate)}&$locale=en_US`
  );
}

/** The human landing page for a rule — becomes sourceUrl. */
export function tacRuleSourceUrl(recordId: string): string {
  return `${TAC_PORTAL_BASE}?recordId=${recordId}&interface=VIEW_TAC_SUMMARY`;
}

export const TX_TAC_SOURCES: readonly TacCaptureSource[] = [
  {
    code: '28 TAC', title: '28', part: '1', chapter: '5',
    chapterTitle: 'Property and Casualty Insurance',
    subchapter: 'A', division: '6',
    domain: 'insurance',
    ruleCites: ['5.501'],
    note: 'Notice Requirements to Claimants Regarding Motor Vehicle Repairs — the TDI rule implementing Ins. Code 1952.305/.307; the notice text insurers must give about shop and parts choice.',
  },
  {
    code: '28 TAC', title: '28', part: '1', chapter: '21',
    chapterTitle: 'Trade Practices',
    subchapter: 'C',
    domain: 'insurance',
    ruleCites: ['21.202', '21.203'],
    note: 'Subchapter C, Unfair Claims Settlement Practices: 21.202 definitions, 21.203 the catalog rule TDI enforces alongside Ins. Code 542.003/541.060.',
  },
];
