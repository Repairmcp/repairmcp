/**
 * Florida's corpus: the shared StateLawCorpus driven by the FL profile.
 * FlCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveFlCitationQuery } from './identity.js';
import { FL_CODES, FL_DOMAINS, FlCorpusFileSchema, type FlSection } from './schema.js';
import { FL_TOPICS, baselineTopics } from './taxonomy.js';

export const FL_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['florida']);

export const FL_CORPUS_PROFILE: CorpusProfile = {
  state: 'FL',
  codes: FL_CODES,
  domains: FL_DOMAINS,
  topics: FL_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveFlCitationQuery,
  displayCite,
  extraStopwords: FL_EXTRA_STOPWORDS,
  corpusFileSchema: FlCorpusFileSchema,
};

export type FlScoreBreakdown = ScoreBreakdown;
export type FlHit = StateLawHit<FlSection>;
export type FlQueryResult = StateQueryResult<FlSection>;
export type FlQueryOpts = StateQueryOpts;

export class FlCorpus extends StateLawCorpus<FlSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(FL_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
