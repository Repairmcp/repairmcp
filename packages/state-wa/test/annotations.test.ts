import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/wa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/wa-annotations.json' with { type: 'json' };
import { WaAnnotationsFileSchema, WaCorpusFileSchema } from '../src/schema.js';
import { WA_TOPICS } from '../src/taxonomy.js';

/**
 * The substring guarantee — named for the disaster it prevents. The May 2026
 * corpus shipped a field called quoteSafeExcerpt whose contents were
 * model-written paraphrase with legally material drift ("fully completed proof
 * of loss" for the rule's "fully completed and executed proofs of loss").
 * Here an excerpt is quote-safe because it IS the captured text, provably.
 */

const corpus = WaCorpusFileSchema.parse(corpusJson);
const annotations = WaAnnotationsFileSchema.parse(annotationsJson);
const sectionByKey = new Map(corpus.sections.map((s) => [`${s.code} ${s.cite}`, s]));

describe('annotation integrity over the committed data', () => {
  test('every annotation key resolves to a captured section', () => {
    for (const key of Object.keys(annotations)) {
      expect(sectionByKey.has(key)).toBe(true);
    }
  });

  test('every quoteSafeExcerpt is a literal substring of its section text', () => {
    for (const [key, annotation] of Object.entries(annotations)) {
      const section = sectionByKey.get(key)!;
      for (const excerpt of annotation.quoteSafeExcerpts ?? []) {
        expect(section.text.includes(excerpt)).toBe(true);
      }
    }
  });

  test('every topic is in the taxonomy', () => {
    const known = new Set<string>(WA_TOPICS);
    for (const annotation of Object.values(annotations)) {
      for (const topic of annotation.topics) {
        expect(known.has(topic)).toBe(true);
      }
    }
  });

  test('the insurance/repair dispute stars are annotated with use-case vocabulary', () => {
    const required = [
      'WAC 284-30-330',
      'WAC 284-30-390',
      'WAC 284-30-391',
      'WAC 284-30-392',
      'WAC 284-30-394',
      'RCW 48.30.015',
      'RCW 46.71.015',
      'RCW 46.71.025',
      'WAC 296-126-092',
    ];
    for (const key of required) {
      const annotation = annotations[key];
      expect(annotation).toBeDefined();
      expect(annotation!.claimUseCases?.length ?? 0).toBeGreaterThan(0);
      expect(annotation!.quoteSafeExcerpts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('the May-branch drift phrase is not in any excerpt — the real rule says "executed proofs"', () => {
    const s380 = sectionByKey.get('WAC 284-30-380')!;
    expect(s380.text).toContain('fully completed and executed proofs of loss');
    for (const annotation of Object.values(annotations)) {
      for (const excerpt of annotation.quoteSafeExcerpts ?? []) {
        expect(excerpt).not.toBe('fully completed proof of loss');
      }
    }
  });
});
