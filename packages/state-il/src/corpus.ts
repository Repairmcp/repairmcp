/**
 * Illinois's corpus: the shared StateLawCorpus driven by the IL profile.
 * IlCorpus stays a CLASS — the Worker news it up.
 */
import {
  StateLawCorpus,
  type CorpusProfile,
  type ScoreBreakdown,
  type StateLawHit,
  type StateQueryOpts,
  type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveIlCitationQuery } from './identity.js';
import { IL_CODES, IL_DOMAINS, IlCorpusFileSchema, type IlSection } from './schema.js';
import { IL_TOPICS, baselineTopics } from './taxonomy.js';

export const IL_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['illinois', 'il', 'ilcs', 'compiled', 'statutes', 'administrative', 'adm', 'code', 'section', 'act', 'part']);

export const IL_CORPUS_PROFILE: CorpusProfile = {
  state: 'IL',
  codes: IL_CODES,
  domains: IL_DOMAINS,
  topics: IL_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveIlCitationQuery,
  displayCite,
  extraStopwords: IL_EXTRA_STOPWORDS,
  corpusFileSchema: IlCorpusFileSchema,
};

export type IlScoreBreakdown = ScoreBreakdown;
export type IlHit = StateLawHit<IlSection>;
export type IlQueryResult = StateQueryResult<IlSection>;
export type IlQueryOpts = StateQueryOpts;

export class IlCorpus extends StateLawCorpus<IlSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(IL_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
