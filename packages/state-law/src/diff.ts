/**
 * Corpus diffing — the truly state-agnostic half of capture. The writer
 * (capture-state) and the watcher (check-state) both use this, so they
 * cannot disagree about what "changed" means. Chapter-page assembly stays in
 * state-wa: it is shaped like Washington's site, and Montana's two pipelines
 * share none of that shape.
 */

export interface CorpusDiff {
  added: string[];
  removed: string[];
  changedText: string[];
}

/** Keys are `CODE:cite`, e.g. `WAC:284-30-330`, `MCA:33-18-201`. Text comparison is exact. */
export function diffCorpus<S extends { code: string; cite: string; text: string }>(
  prev: readonly S[],
  next: readonly S[],
): CorpusDiff {
  const key = (s: S): string => `${s.code}:${s.cite}`;
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
