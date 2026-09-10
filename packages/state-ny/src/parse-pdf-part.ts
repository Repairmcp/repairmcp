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
 * CR-82 prints a different shape: page 6 interrupts 82.2's own definitions
 * with a sidebar (the running "Sec." contents list, then the "PART 82 /
 * MOTOR VEHICLE REPAIR SHOP / (Statutory authority: ...)" title block, then
 * DMV's "Please note: ..." formatting disclaimer) that ends with a fixed
 * closing sentence rather than the next section head — `skipUntil` is an
 * INCLUSIVE end marker: the region ends at (and discards) the first line
 * matching it, and normal body text resumes on the next line.
 *
 * A skip region is unbounded by construction unless closed some other way
 * — a false-positive `skipFrom` match inside real prose, or a missed close,
 * would otherwise silently drop body text with no signal. Exactly one of
 * two closing rules must be given whenever `skipFrom` is set: `skipOnly`
 * (every discarded line must be contents-shaped, or the split fails naming
 * the line; the region closes at the next section head) or `skipMaxLines`
 * with `skipUntil` (the region closes at the first line matching
 * `skipUntil`, and exceeding `skipMaxLines` lines without closing fails
 * naming the region). Reaching the end of the body while still skipping
 * fails UNLESS the body itself was truncated by `bodyEnd` — a skip region
 * legitimately ending exactly at `bodyEnd` is fine, because every line it
 * discarded already passed `skipOnly` (or, under `skipUntil`, `bodyEnd`
 * itself is what cut the region off before its own close line appeared).
 */
export interface PartSplitSpec {
  /** Anchored to a whole line: ^…$ with the m flag. Group 1 = cite, group 2 = title. */
  head: RegExp;
  /** The line the body begins at (the first head, as printed). */
  bodyStart: RegExp;
  /**
   * The line the body ends before (e.g. APPENDIX, or the unique next-Subpart
   * head), when the booklet has trailing matter. Matched as the FIRST
   * occurrence after bodyStart — a banner PHRASE can recur (wrapped into
   * earlier prose describing what it excludes); the marker here must be a
   * line that is structurally unique, not merely the common case.
   */
  bodyEnd?: RegExp;
  dropLines: readonly RegExp[];
  /** From a line matching this, discard lines until the region closes (see skipOnly / skipUntil). */
  skipFrom?: RegExp;
  /**
   * Closing rule: every line discarded inside a skipFrom region must match
   * this, or the split fails naming the line; the region closes at the next
   * section head. Mutually exclusive with skipUntil — exactly one is
   * required whenever skipFrom is set.
   */
  skipOnly?: RegExp;
  /**
   * Closing rule: the skip region ends at (and discards) the first line
   * matching this — an INCLUSIVE end marker, unlike bodyEnd. No shape
   * check runs on the lines in between. Mutually exclusive with skipOnly —
   * exactly one is required whenever skipFrom is set. Pair with
   * skipMaxLines so a missed close fails loudly instead of running away.
   */
  skipUntil?: RegExp;
  /** With skipUntil: throw naming the region if it exceeds this many lines without closing. */
  skipMaxLines?: number;
}

export interface SplitSection {
  cite: string;
  heading: string;
  text: string;
}

export function splitPartText(raw: string, spec: PartSplitSpec): SplitSection[] {
  if (spec.skipFrom) {
    const hasOnly = !!spec.skipOnly;
    const hasUntil = !!spec.skipUntil;
    if (hasOnly === hasUntil) {
      throw new Error('PartSplitSpec.skipFrom requires exactly one of skipOnly or skipUntil — a skip region with no bound (or two conflicting bounds) on what it may discard.');
    }
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
  let truncatedAtBodyEnd = false;
  if (spec.bodyEnd) {
    // The FIRST match after bodyStart. A banner PHRASE can recur — CR 142's
    // Subpart 142-2 banner sentence itself wraps onto a line reading
    // "SUBPART 142-3" ("...COVERED BY THE PROVISIONS OF / SUBPART 142-3"),
    // well before the real Subpart 142-3 section — which is why bodyEnd is
    // pinned to the unique `§ 142-3.1` head rather than the recurring
    // banner text. A marker chosen to be structurally unique is safe to
    // match on first occurrence; a marker that merely usually is unique
    // (the banner phrase) is not.
    for (let i = start + 1; i < lines.length; i++) {
      if (spec.bodyEnd.test(lines[i]!)) {
        end = i;
        truncatedAtBodyEnd = true;
        break;
      }
    }
  }
  const body = lines.slice(start, end);

  const out: SplitSection[] = [];
  let current: SplitSection | undefined;
  let skipping = false;
  let skipStartLine: string | undefined;
  let skipLineCount = 0;
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
      skipLineCount = 0;
      continue;
    }
    if (skipping) {
      skipLineCount++;
      if (spec.skipMaxLines && skipLineCount > spec.skipMaxLines) {
        throw new Error(`Skip region after "${skipStartLine}" exceeds ${spec.skipMaxLines} lines without closing — a close marker was missed or real text is being dropped.`);
      }
      if (spec.skipUntil) {
        if (spec.skipUntil.test(line)) skipping = false;
        continue;
      }
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
  if (skipping && !truncatedAtBodyEnd) {
    throw new Error(`Skip region after "${skipStartLine}" ran to the end of the body without a section head.`);
  }
  return out;
}
