/**
 * New York's corpus: the shared StateLawCorpus driven by the NY profile.
 * NyCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveNyCitationQuery } from './identity.js';
import { NY_CODES, NY_DOMAINS, NyCorpusFileSchema, type NySection } from './schema.js';
import { NY_TOPICS, baselineTopics } from './taxonomy.js';

export const NY_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['new', 'york', 'ny']);

export const NY_CORPUS_PROFILE: CorpusProfile = {
  state: 'NY',
  codes: NY_CODES,
  domains: NY_DOMAINS,
  topics: NY_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveNyCitationQuery,
  displayCite,
  extraStopwords: NY_EXTRA_STOPWORDS,
  corpusFileSchema: NyCorpusFileSchema,
};

export type NyScoreBreakdown = ScoreBreakdown;
export type NyHit = StateLawHit<NySection>;
export type NyQueryResult = StateQueryResult<NySection>;
export type NyQueryOpts = StateQueryOpts;

export class NyCorpus extends StateLawCorpus<NySection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(NY_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
