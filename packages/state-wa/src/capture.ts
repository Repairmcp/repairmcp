/**
 * The pure half of capture: turning parsed chapters into corpus sections and
 * diffing one corpus against another. Shared by scripts/capture-waleg.ts (the
 * writer) and scripts/check-waleg.ts (the scheduled drift checker) so the two
 * can never disagree about what "changed" means — the same one-producer rule
 * as everything else in this repo.
 */
import type { ParsedWaChapter } from './parse.js';
import type { WaSection } from './schema.js';
import { applyFilter, sectionUrl, type WaCaptureSource } from './sources.js';

export interface ChapterFetchGroup {
  code: WaCaptureSource['code'];
  chapter: string;
  sources: WaCaptureSource[];
}

export function chapterKey(group: Pick<ChapterFetchGroup, 'code' | 'chapter'>): string {
  return `${group.code} ${group.chapter}`;
}

/** Manifest entries sharing a chapter share one fetch. Order preserved. */
export function groupByChapter(sources: readonly WaCaptureSource[]): ChapterFetchGroup[] {
  const groups = new Map<string, ChapterFetchGroup>();
  for (const source of sources) {
    const key = `${source.code} ${source.chapter}`;
    const group = groups.get(key) ?? { code: source.code, chapter: source.chapter, sources: [] };
    group.sources.push(source);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Apply every source's filter over its parsed chapter and stamp the identity
 * fields. Throws on a manifest overlap (two entries capturing the same
 * section) and on a group whose chapter was never parsed — the fetch loop
 * must supply every group, and silence would serve a partial corpus.
 */
export function assembleSections(
  parsed: ReadonlyMap<string, ParsedWaChapter>,
  groups: readonly ChapterFetchGroup[],
): WaSection[] {
  const byKey = new Map<string, WaSection>();
  for (const group of groups) {
    const chapter = parsed.get(chapterKey(group));
    if (!chapter) {
      throw new Error(`No parsed chapter for ${chapterKey(group)} — the fetch loop skipped it.`);
    }
    for (const source of group.sources) {
      for (const section of applyFilter(chapter.sections, source.filter)) {
        const key = `${source.code}:${section.cite}`;
        if (byKey.has(key)) {
          throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
        }
        byKey.set(key, {
          cite: section.cite,
          code: source.code,
          chapter: source.chapter,
          chapterTitle: source.chapterTitle,
          heading: section.heading,
          text: section.text,
          ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
          ...(section.historyNote ? { historyNote: section.historyNote } : {}),
          domain: source.domain,
          sourceUrl: sectionUrl(source.code, section.cite),
        });
      }
    }
  }
  return [...byKey.values()];
}

export interface CorpusDiff {
  added: string[];
  removed: string[];
  changedText: string[];
}

/** Keys are `CODE:cite`, e.g. `WAC:284-30-330`. Text comparison is exact. */
export function diffCorpus(
  prev: readonly WaSection[],
  next: readonly WaSection[],
): CorpusDiff {
  const key = (s: WaSection): string => `${s.code}:${s.cite}`;
  const prevByKey = new Map(prev.map((s) => [key(s), s]));
  const nextByKey = new Map(next.map((s) => [key(s), s]));
  return {
    added: [...nextByKey.keys()].filter((k) => !prevByKey.has(k)),
    removed: [...prevByKey.keys()].filter((k) => !nextByKey.has(k)),
    changedText: [...nextByKey.entries()]
      .filter(([k, s]) => prevByKey.has(k) && prevByKey.get(k)!.text !== s.text)
      .map(([k]) => k),
  };
}

export function isCleanDiff(diff: CorpusDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changedText.length === 0;
}
