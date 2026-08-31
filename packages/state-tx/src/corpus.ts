/**
 * Texas's corpus: the shared StateLawCorpus driven by the TX profile.
 * TxCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveTxCitationQuery } from './identity.js';
import { TX_CODES, TX_DOMAINS, TxCorpusFileSchema, type TxSection } from './schema.js';
import { TX_TOPICS, baselineTopics } from './taxonomy.js';

export const TX_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['texas']);

export const TX_CORPUS_PROFILE: CorpusProfile = {
  state: 'TX',
  codes: TX_CODES,
  domains: TX_DOMAINS,
  topics: TX_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveTxCitationQuery,
  displayCite,
  extraStopwords: TX_EXTRA_STOPWORDS,
  corpusFileSchema: TxCorpusFileSchema,
};

export type TxScoreBreakdown = ScoreBreakdown;
export type TxHit = StateLawHit<TxSection>;
export type TxQueryResult = StateQueryResult<TxSection>;
export type TxQueryOpts = StateQueryOpts;

export class TxCorpus extends StateLawCorpus<TxSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(TX_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
