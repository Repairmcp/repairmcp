import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/mt-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/mt-annotations.json' with { type: 'json' };
import { MtAnnotationsFileSchema, MtCorpusFileSchema } from '../src/schema.js';
import { MT_TOPICS } from '../src/taxonomy.js';

/** The substring guarantee — the paraphrase disaster stays impossible. */

const corpus = MtCorpusFileSchema.parse(corpusJson);
const annotations = MtAnnotationsFileSchema.parse(annotationsJson);
const sectionByKey = new Map(corpus.sections.map((s) => [`${s.code} ${s.cite}`, s]));

describe('annotation integrity over the committed data', () => {
  test('every annotation key resolves to a captured section', () => {
    for (const key of Object.keys(annotations)) {
      expect(sectionByKey.has(key), `${key} resolves`).toBe(true);
    }
  });

  test('every quoteSafeExcerpt is a literal substring of its section text', () => {
    for (const [key, annotation] of Object.entries(annotations)) {
      const section = sectionByKey.get(key)!;
      for (const excerpt of annotation.quoteSafeExcerpts ?? []) {
        expect(section.text.includes(excerpt), `${key} excerpt is substring`).toBe(true);
      }
    }
  });

  test('every topic is in the taxonomy', () => {
    const known = new Set<string>(MT_TOPICS);
    for (const annotation of Object.values(annotations)) {
      for (const topic of annotation.topics) {
        expect(known.has(topic), `topic ${topic}`).toBe(true);
      }
    }
  });

  test('the dispute stars carry use-case vocabulary and quote-safe excerpts', () => {
    const required = [
      'MCA 33-18-201',
      'MCA 33-18-224',
      'MCA 33-18-242',
      'MCA 33-18-245',
      'MCA 33-23-202',
      'ARM 23.19.202',
      'ARM 23.19.203',
      'MCA 71-3-1201',
      'MCA 39-2-904',
      'MCA 39-3-205',
    ];
    for (const key of required) {
      const annotation = annotations[key];
      expect(annotation, key).toBeDefined();
      expect(annotation!.claimUseCases?.length ?? 0).toBeGreaterThan(0);
      expect(annotation!.quoteSafeExcerpts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('the estimating-system clause is quotable verbatim', () => {
    const excerpts = annotations['MCA 33-18-224']!.quoteSafeExcerpts!;
    expect(
      excerpts.some((e) =>
        e.startsWith('(iii) unilaterally disregard a repair operation or cost identified by an estimating system'),
      ),
    ).toBe(true);
  });
});
