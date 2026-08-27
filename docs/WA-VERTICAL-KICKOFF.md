# Kickoff spec: Washington state vertical

Written 2026-08-27, the handoff into a fresh planning session. Read
`docs/ARCHITECTURE.md` for the core abstractions and the NHTSA build (shipped
earlier today — see CLAUDE.md's build-status row) for the pattern this build
follows. Start the next session in plan mode with "plan the Washington
vertical" and work this file. This supersedes §2 of
`docs/NEXT-VERTICALS-KICKOFF.md`.

**Travis's scope directive (2026-08-27, verbatim intent):** not just insurance
claims practices. "Pretty much anything that would be of interest to a
collision repair facility, from the law about repairs / insurance relations /
consumer rights, to safety requirements, what is required of each shop,
HR/employee resources etc. These state corpuses should have a ton of valuable
information."

---

## 1. What the May branch actually holds (audited 2026-08-27)

Branch `codex/washington-binding-authority` (18 commits, 2026-05-09..11):
`packages/state-wa` (~1,000 LOC, 24 tests), `apps/state-wa-server` (STDIO
only), a 1,456-line plan and 354-line spec under `docs/superpowers/`, and the
corpus at `apps/state-wa-server/data/wa-authority.json`.

### The corpus is the problem, and it is disqualifying as-is

13 documents (10 WAC 284-30 sections, 3 RCW 48.30 sections), 20 chunks, **547
total words of legal text** — median 26 words per chunk against a real median
of ~329 words per section in the NHTSA capture. The audit's honest read: **the
text is model-written paraphrase, not captured source.** Specifics that prove
it:

- Summary voice throughout ("Unfair claim practices include…") — phrasing that
  appears nowhere in the WAC.
- `quoteSafeExcerpt` drifts in legally material ways: "fully completed proof
  of loss" vs the rule's "properly executed proofs of loss" (WAC 284-30-380);
  RCW 48.30.015's excerpt contains a literal `...` ellipsis and its summary
  omits the treble-damages and attorney-fee remedy — the most valuable part of
  the statute.
- 0 of 13 documents carry an effective date; `lastVerifiedAt` is the authoring
  date on all 13, verified by nothing.
- WAC 284-30-330 has ~19 enumerated practices; 2 are represented. Coverage of
  the sections' actual words: under 10%.
- The schema's own `aftermarket_parts` and `photo_estimate` topics have zero
  corpus coverage.
- The spec's title for WAC 284-30-392 and the corpus's disagree — resolve at
  capture.

**Treat 100% of the branch corpus text as unverified and replace it.** Do not
ship a field named `quoteSafeExcerpt` unless it is enforced to be a real
substring of captured text. The root cause is documented in the May spec
itself: it forbade "automated scraping" and made verbatim capture a manual
instruction to the author, which produced paraphrase. That constraint is
overridden — the NHTSA law corpus proved the capture-script approach
(one polite request, verbatim text, self-checked currency).

### What the branch code is worth (port / rewrite / replace)

**Port intact (~60%):**
- `src/scoring.ts` — additive scorer with exact-citation short-circuit at 1.0
  and citation-shaped-miss short-circuit at 0. **One bug:** the adapter passes
  `topics: []` into the scorer and applies topics as a hard pre-filter, so the
  scorer's topic component is dead in production. Fix or delete the component.
- The 15-topic taxonomy (`short_pay, fair_settlement, labor_rate, steering,
  estimate_dispute, supplement_handling, prompt_investigation, claim_denial,
  misrepresentation, aftermarket_parts, total_loss, valuation_dispute,
  photo_estimate, storage_towing, repair_facility_choice`) and the
  `appliesTo` / `repairerConsumerImpact` / `claimUseCases` metadata — a
  genuine contribution main's law schema lacks. Keep as **derived annotations
  over captured verbatim sections**, never as hand-written text.
- All four tool *descriptions* (good USE THIS WHEN / shop vocabulary),
  the `EDUCATIONAL_CAVEAT` / `factsToVerify` framing of
  `wa_build_rebuttal_packet`, and the test suite structure (24 cases).
- The May spec's posture statement, which stands: "identify what Washington
  binding authority says, label it accurately, provide reliable citations. It
  should not decide whether an insurer violated the law."

**Rewrite to current conventions (same list the NHTSA revival followed):**
- `citation.ts` → `identity.ts`: `WA_IDENTITY`, `wac:`/`rcw:` id namespace,
  one producer building core `Citation` with dates through `fmtDateUtc`.
  Short form carries the effective date: `WAC 284-30-330(7), effective
  9/1/1978` reads straight into a dispute letter.
- Inert `server-adapter.ts` (formatCitation throws) → real `SourceAdapter` on
  the `packages/nhtsa/src/adapter.ts` model, then `openai.ts` with core's
  connector builders. WA is a pure corpus source, so **pass `freshness`** to
  the builders (NHTSA deliberately doesn't — mixed live/corpus).
- `apps/state-wa-server`: delete STDIO, write `worker.ts` on the
  `apps/nhtsa-server/src/worker.ts` pattern — stateless, module-level
  validated corpus, `/mcp` + `/health` with corpus meta.

**Replace with the main-branch law-corpus pattern:** adopt
`packages/nhtsa/src/laws/{schema,parse,search,adapter}.ts` +
`scripts/capture-uscode.ts` as the template. Full verbatim section text,
constructor-time Zod parse, `freshness()` → core `CorpusFreshness`,
capture script that hard-fails when it cannot state currency.

Four tools become the surface (port, plus connector search/fetch):
`wa_search_authority`, `wa_get_authority`, `wa_find_supporting_authority`,
`wa_build_rebuttal_packet` — plus whatever the expanded scope needs (see §3
tool-shape decision).

---

## 2. Sources, verified capturable (probed live 2026-08-27)

The legislature's site serves **whole chapters in one page**:

- `https://app.leg.wa.gov/WAC/default.aspx?cite=284-30&full=true` — 342 KB,
  every section, anchored `<a name='284-30-330'>`, `<h3>` number + `<h3>`
  heading, body paragraphs in indented divs (verbatim regulatory text,
  subsection numbering preserved), and a trailing bracketed history note per
  section — `[Statutory Authority: … filed 7/27/78, effective 9/1/78.]` —
  **the per-section effective date is right there.**
- `https://app.leg.wa.gov/RCW/default.aspx?cite=46.71&full=true` — identical
  template. One parser covers both, in the `capture-uscode.ts` style.
- No robots.txt exists (404). Capture is one request per chapter; keep the
  polite-scraping convention anyway (RepairMCP-Bot UA, delay between
  chapters).
- **No site-level currency marker** (unlike OLRC's `currentthrough`). The
  honest freshness statement is therefore: `syncedAt` = capture date from the
  official publisher (leg.wa.gov serves current law), `currentThrough` =
  capture date, plus per-section effective dates parsed from history notes.
  Decide the exact wording in plan mode; degrade to silence if a history note
  won't parse — never guess.
- Terms of reuse: state law text is public record; the plan session should
  still eyeball leg.wa.gov's site-terms page once and note it in the commit.

---

## 3. The expanded scope: domains and candidate chapters

Everything below is a candidate list from domain knowledge — **verify every
cite in plan mode before capture** (chapter numbers, whether the chapter is
current, what's collision-relevant inside it). Each domain becomes a set of
captured chapters; the topic taxonomy grows to route across them.

### A. Insurance claims, consumer rights (the original core — capture first)
- **WAC 284-30** (whole chapter): unfair claims settlement practices —
  -330 specific practices, -350 misrepresentation, -360/-370/-380 handling
  standards, -390 motor vehicle claims practices, -391..-394 total loss,
  valuation reports, subrogation deductible, storage/towing denial.
- **RCW 48.30**: unfair practices; 48.30.015 is the Insurance Fair Conduct
  Act (unreasonable denial → treble damages + attorney fees — the section a
  shop hands a customer).
- **RCW 19.86** Consumer Protection Act (the private-action hook; short).
- OIC bulletins / technical advisories: nonbinding interpretive layer, PDFs —
  explicitly a later phase, matching the May spec's future path. The schema's
  `legalEffect` enum will need `nonbinding` when it lands.

### B. Auto repair law and shop obligations
- **RCW 46.71** Automotive Repair Act (whole chapter): written estimates,
  disclosure of aftermarket/non-OEM body parts, authorization to exceed,
  customer remedies, the lien interplay.
- The repair lien chapter (likely RCW 60.08 chattel liens — verify which one
  actually governs repair possessory liens).
- Scope calls: RCW 46.80 (vehicle wreckers — shops parting totals),
  RCW 46.55 (towing/impound — shops that tow). In only if cheap.

### C. Workplace safety (WISHA / L&I) — the big one, needs curation
- **WAC 296-800** (safety and health core rules — applies to every employer).
- Spray finishing / paint booths (verify the exact WAC chapter for
  spray-finishing operations), respiratory protection (**WAC 296-842** —
  isocyanates make this the collision-shop rule), hazard communication
  (**WAC 296-901**), hexavalent chromium (chromate primers — verify cite).
- Strategy: these chapters are large and only partly collision-relevant.
  Decide in plan mode between whole-chapter capture with topic routing vs a
  curated section list per chapter. Bias toward whole chapters — curation is
  what produced the coverage holes last time — but check the size budget (§4).

### D. HR / employment
- **RCW 49.46** (minimum wage, overtime, paid sick leave),
  **WAC 296-126-092** (meal and rest breaks — the question every shop asks).
- Key sections rather than whole titles: RCW 49.60 (discrimination),
  RCW 50A (paid family/medical leave), RCW 51 (workers' comp employer
  duties), youth employment rules (WAC 296-125 — apprentices and prohibited
  equipment in shops).

### E. Business/licensing
- Verify in plan mode what Washington actually requires of a repair facility
  beyond general business licensing (RCW 46.71 obligations; wreckers license
  under 46.80 for those who need it). Likely thin — keep it thin.

**Priority when in doubt: A + B are the launch bar (they serve the site
card's promise); C + D are what makes the corpus "a ton of valuable
information"; E is a footnote.** Shipping A+B first and growing C/D by
capture-script re-runs is acceptable if the plan session finds the full sweep
too big for one pass — the capture script makes adding a chapter a data task.

---

## 4. Decisions to settle in plan mode

1. **Package shape — the state #2 question, now with a third option.** The
   original choice was `packages/state-wa` vs `packages/state-regs` with
   per-state data. The NHTSA build created a second consumer of the
   law-corpus shape (`laws/schema,parse,search,adapter` + capture script), so
   consider extracting those into a shared package (`packages/law-corpus` or
   similar) that both NHTSA and every state vertical import — core stays
   vertical-agnostic, and state #2 becomes a data + config task. Decide
   whether to extract now or copy once more and extract at state #2 (the
   rule-of-three argument). Whatever is chosen: the per-state part should be
   data files + identity + topic taxonomy, not code.
2. **Corpus size budget.** WAC 284-30 is ~342 KB HTML (~150 KB text). The
   full A–D sweep is plausibly 1.5–3 MB of text. Bundled-in-Worker is fine to
   roughly 3 MB gzipped (NHTSA ships 260 KB gzip total today); past that, D1
   machinery already exists. Measure at capture, decide then, don't guess.
3. **Chunk layer as derived index.** Keep the branch's chunk/topic/use-case
   annotations, but chunks become references into captured section text
   (offsets or exact substrings), with a test asserting every
   `quoteSafeExcerpt` is a literal substring of its section's captured text.
   Annotation lives in a separate hand-maintained file keyed by section
   citation, so a re-capture never destroys it and a renumbered section fails
   loudly.
4. **Citation format.** `WAC 284-30-330(7), effective 9/1/1978` short form;
   long form carries chapter title + leg.wa.gov URL. Dates via `fmtDateUtc`.
   Subsection-level citation (the "(7)") is what an appraiser pastes — decide
   whether subsection anchors are worth parsing or the section-level cite is
   v1.
5. **Tool shape across domains.** The four `wa_*` tools were designed for
   insurance disputes. The expanded scope needs either a `domain` filter
   (insurance / repair_law / safety / employment) on the existing tools or
   separate search tools per domain. Bias toward fewer tools + a domain
   parameter + the grown topic taxonomy; the rebuttal-packet tool stays
   insurance-scoped.
6. **The legal-advice line.** `LEGAL_ADVICE_NOTE` pattern from
   `packages/nhtsa/src/laws/notes.ts`, on every tool and every law document,
   plus the branch's stronger dispute-tool caveats. /legal already covers the
   service side; echo it.
7. **Freshness wording** for a source with no self-stated currency (§2).
8. **Hostname + WAF.** `wa.repairmcp.com`, custom_domain, workers_dev false.
   The zone's single rate-limit rule matches path `/mcp` without pinning the
   hostname — verified empirically during the NHTSA launch (429s on the new
   hostname with no dashboard change), so nothing to do beyond the burst
   test after deploy.
9. **Site + legal updates at flip time**: the "State regulations" card goes
   live with the connector URL; check whether /legal's data-sources paragraph
   needs a Washington sentence; example prompts tested against the live
   server first, per convention.

---

## 5. Demo criteria (the bar before flipping the card)

From the original kickoff, still binding:
- "Can the insurer make me use aftermarket parts in Washington?" → the actual
  WAC/RCW sections quoted with numbers and effective dates (this query had
  ZERO corpus coverage on the branch — it must work now).
- "What does Washington say about steering?" → WAC 284-30-390's
  repair-facility-choice provisions, quoted.

From the expanded scope:
- "Do I have to give the customer a written estimate?" → RCW 46.71.025.
- "What breaks are my painters entitled to?" → WAC 296-126-092.
- "Is the insurer allowed to deny storage charges?" → WAC 284-30-394.
- A total-loss valuation dispute question returning the -391/-392 standards.

Every answer: verbatim text, section number, effective date, leg.wa.gov URL —
never a summary from model memory. That is the entire point of the vertical,
and it is exactly what the May corpus could not do.

---

## 6. Sequence

1. Plan session (this file + the branch audit in CLAUDE.md context) →
   settle §4, verify §3 cites.
2. Build the capture script + verbatim corpus for domains A+B; port/rewrite
   per §1; annotation layer; tests (including the substring guarantee and
   the ambiguity checks the NHTSA build modeled).
3. Wire check against real queries, deploy `wa.repairmcp.com`, burst test.
4. Capture domains C+D (size-budget check), grow taxonomy, redeploy.
5. Flip the site card, /legal check, tested prompts, CLAUDE.md build row,
   outreach note. Then state #2 gets decided by what §4.1 chose.
