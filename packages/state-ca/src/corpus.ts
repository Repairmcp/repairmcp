/**
 * California's corpus: the shared StateLawCorpus driven by the CA profile.
 * CaCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveCaCitationQuery } from './identity.js';
import { CA_CODES, CA_DOMAINS, CaCorpusFileSchema, type CaSection } from './schema.js';
import { CA_TOPICS, baselineTopics } from './taxonomy.js';

export const CA_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['california']);

export const CA_CORPUS_PROFILE: CorpusProfile = {
  state: 'CA',
  codes: CA_CODES,
  domains: CA_DOMAINS,
  topics: CA_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveCaCitationQuery,
  displayCite,
  extraStopwords: CA_EXTRA_STOPWORDS,
  corpusFileSchema: CaCorpusFileSchema,
};

export type CaScoreBreakdown = ScoreBreakdown;
export type CaHit = StateLawHit<CaSection>;
export type CaQueryResult = StateQueryResult<CaSection>;
export type CaQueryOpts = StateQueryOpts;

export class CaCorpus extends StateLawCorpus<CaSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(CA_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
