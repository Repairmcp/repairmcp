/**
 * Ohio's corpus: the shared StateLawCorpus driven by the OH profile.
 * OhCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveOhCitationQuery } from './identity.js';
import { OH_CODES, OH_DOMAINS, OhCorpusFileSchema, type OhSection } from './schema.js';
import { OH_TOPICS, baselineTopics } from './taxonomy.js';

export const OH_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['ohio', 'oh', 'revised', 'administrative', 'code', 'rule', 'division']);

export const OH_CORPUS_PROFILE: CorpusProfile = {
  state: 'OH',
  codes: OH_CODES,
  domains: OH_DOMAINS,
  topics: OH_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveOhCitationQuery,
  displayCite,
  extraStopwords: OH_EXTRA_STOPWORDS,
  corpusFileSchema: OhCorpusFileSchema,
};

export type OhScoreBreakdown = ScoreBreakdown;
export type OhHit = StateLawHit<OhSection>;
export type OhQueryResult = StateQueryResult<OhSection>;
export type OhQueryOpts = StateQueryOpts;

export class OhCorpus extends StateLawCorpus<OhSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(OH_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
