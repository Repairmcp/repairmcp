/**
 * Montana's corpus: the shared StateLawCorpus driven by the MT profile.
 * MtCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveMtCitationQuery } from './identity.js';
import { MT_CODES, MT_DOMAINS, MtCorpusFileSchema, type MtSection } from './schema.js';
import { MT_TOPICS, baselineTopics } from './taxonomy.js';

export const MT_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['montana']);

export const MT_CORPUS_PROFILE: CorpusProfile = {
  state: 'MT',
  codes: MT_CODES,
  domains: MT_DOMAINS,
  topics: MT_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveMtCitationQuery,
  displayCite,
  extraStopwords: MT_EXTRA_STOPWORDS,
  corpusFileSchema: MtCorpusFileSchema,
};

export type MtScoreBreakdown = ScoreBreakdown;
export type MtHit = StateLawHit<MtSection>;
export type MtQueryResult = StateQueryResult<MtSection>;
export type MtQueryOpts = StateQueryOpts;

export class MtCorpus extends StateLawCorpus<MtSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(MT_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
