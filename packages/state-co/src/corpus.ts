/**
 * Colorado's corpus: the shared StateLawCorpus driven by the CO profile.
 * CoCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveCoCitationQuery } from './identity.js';
import { CO_CODES, CO_DOMAINS, CoCorpusFileSchema, type CoSection } from './schema.js';
import { CO_TOPICS, baselineTopics } from './taxonomy.js';

export const CO_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['colorado']);

export const CO_CORPUS_PROFILE: CorpusProfile = {
  state: 'CO',
  codes: CO_CODES,
  domains: CO_DOMAINS,
  topics: CO_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveCoCitationQuery,
  displayCite,
  extraStopwords: CO_EXTRA_STOPWORDS,
  corpusFileSchema: CoCorpusFileSchema,
};

export type CoScoreBreakdown = ScoreBreakdown;
export type CoHit = StateLawHit<CoSection>;
export type CoQueryResult = StateQueryResult<CoSection>;
export type CoQueryOpts = StateQueryOpts;

export class CoCorpus extends StateLawCorpus<CoSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(CO_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
