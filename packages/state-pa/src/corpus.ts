/**
 * Pennsylvania's corpus: the shared StateLawCorpus driven by the PA profile.
 * PaCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolvePaCitationQuery } from './identity.js';
import { PA_CODES, PA_DOMAINS, PaCorpusFileSchema, type PaSection } from './schema.js';
import { PA_TOPICS, baselineTopics } from './taxonomy.js';

export const PA_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['pennsylvania', 'pa', 'commonwealth']);

export const PA_CORPUS_PROFILE: CorpusProfile = {
  state: 'PA',
  codes: PA_CODES,
  domains: PA_DOMAINS,
  topics: PA_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolvePaCitationQuery,
  displayCite,
  extraStopwords: PA_EXTRA_STOPWORDS,
  corpusFileSchema: PaCorpusFileSchema,
};

export type PaScoreBreakdown = ScoreBreakdown;
export type PaHit = StateLawHit<PaSection>;
export type PaQueryResult = StateQueryResult<PaSection>;
export type PaQueryOpts = StateQueryOpts;

export class PaCorpus extends StateLawCorpus<PaSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(PA_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
