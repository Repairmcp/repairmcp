/**
 * Section-splitter over the text of a whole regulation booklet (unpdf,
 * pages merged). The DMV's CR-82 (15 NYCRR Part 82) and the DOL's CR 142
 * (12 NYCRR Part 142) are both official, verbatim printings of one Part
 * with front matter (contents, offices) the splitter must skip and, for
 * CR-82, appendices (signs) it must stop before. The CO whole-title idea
 * applied to PDF text: find the body, split on section heads, keep
 * everything between heads as that section's text.
 *
 * A head is a line the spec's regex matches in full (group 1 cite, group 2
 * title). Contents entries look like heads but sit BEFORE bodyStart, and
 * in CR 142 they lack the section sign; both are excluded structurally.
 * Page footers ("Part 82 - Page 16") are dropped by `dropLines`.
 *
 * CR 142 also prints a SUBPART banner plus a short contents list (only the
 * first line prefixed `Sec.`, the rest bare cites) between one subpart's
 * last section body and the next subpart's first head — not a fixed set of
 * lines `dropLines` can name individually. `skipFrom` discards everything
 * from the banner line up to (not including) the next section head.
 *
 * The skip region is unbounded by construction — a false-positive
 * `skipFrom` match inside real prose, or a missed head after a real banner,
 * would otherwise silently drop body text with no signal. `skipOnly`
 * closes that hole: every line discarded inside a skip region must match
 * it, or the split fails naming the line (and fails naming the region if
 * the body ends while still skipping). Required whenever `skipFrom` is set.
 */
export interface PartSplitSpec {
  /** Anchored to a whole line: ^…$ with the m flag. Group 1 = cite, group 2 = title. */
  head: RegExp;
  /** The line the body begins at (the first head, as printed). */
  bodyStart: RegExp;
  /** The line the body ends before (e.g. APPENDIX), when the booklet has trailing matter. */
  bodyEnd?: RegExp;
  dropLines: readonly RegExp[];
  /** From a line matching this, discard every line up to (not including) the next section head. */
  skipFrom?: RegExp;
  /**
   * Every line discarded inside a skipFrom region must match this, or the
   * split fails naming the line. Required whenever `skipFrom` is set.
   */
  skipOnly?: RegExp;
}

export interface SplitSection {
  cite: string;
  heading: string;
  text: string;
}

export function splitPartText(raw: string, spec: PartSplitSpec): SplitSection[] {
  if (spec.skipFrom && !spec.skipOnly) {
    throw new Error('PartSplitSpec.skipFrom is set without skipOnly — a skip region with no bound on what it may discard.');
  }
  const lines = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !spec.dropLines.some((re) => re.test(l)));
  const start = lines.findIndex((l) => spec.bodyStart.test(l));
  if (start < 0) throw new Error('No body start marker in the booklet text — template drift, or the PDF did not extract.');
  let end = lines.length;
  if (spec.bodyEnd) {
    const e = lines.findIndex((l, i) => i > start && spec.bodyEnd!.test(l));
    if (e > start) end = e;
  }
  const body = lines.slice(start, end);

  const out: SplitSection[] = [];
  let current: SplitSection | undefined;
  let skipping = false;
  let skipStartLine: string | undefined;
  for (const line of body) {
    const head = spec.head.exec(line);
    if (head) {
      skipping = false;
      skipStartLine = undefined;
      current = { cite: head[1]!, heading: head[2]!.trim(), text: '' };
      out.push(current);
      continue;
    }
    if (spec.skipFrom && spec.skipFrom.test(line)) {
      skipping = true;
      skipStartLine = line;
      continue;
    }
    if (skipping) {
      if (!spec.skipOnly!.test(line)) {
        throw new Error(
          `Skip region after "${skipStartLine}" contains a line that is not contents-shaped: "${line}" — a section head was missed or real text was about to be dropped.`,
        );
      }
      continue;
    }
    if (!current) throw new Error(`Body text before the first section head: "${line.slice(0, 60)}".`);
    current.text = current.text ? `${current.text}\n${line}` : line;
  }
  if (skipping) {
    throw new Error(`Skip region after "${skipStartLine}" ran to the end of the body without a section head.`);
  }
  return out;
}
