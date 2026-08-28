/**
 * Washington's corpus: the shared StateLawCorpus (@repairmcp/state-law)
 * driven by the WA profile. Scoring weights, short-circuits, filters, and
 * the annotation enforcement all live in the shared class and reproduce the
 * pre-extraction behavior byte-for-byte — the golden-ranking panel is the
 * proof. WaCorpus stays a CLASS (the Worker news it up).
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveCitationQuery } from './identity.js';
import { WA_DOMAINS, WaCorpusFileSchema, WA_CODES, type WaSection } from './schema.js';
import { WA_EXTRA_STOPWORDS } from './search.js';
import { WA_TOPICS, baselineTopics } from './taxonomy.js';

export const WA_CORPUS_PROFILE: CorpusProfile = {
  state: 'WA',
  codes: WA_CODES,
  domains: WA_DOMAINS,
  topics: WA_TOPICS,
  baselineTopics,
  resolveCitationQuery,
  displayCite,
  extraStopwords: WA_EXTRA_STOPWORDS,
  corpusFileSchema: WaCorpusFileSchema,
};

export type WaScoreBreakdown = ScoreBreakdown;
export type WaHit = StateLawHit<WaSection>;
export type WaQueryResult = StateQueryResult<WaSection>;
export type WaQueryOpts = StateQueryOpts;

export class WaCorpus extends StateLawCorpus<WaSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(WA_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
