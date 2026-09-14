# Kickoff spec: Pennsylvania state vertical (state #8)

> **Status 2026-09-14 (same day): SHIPPED** — `https://pa.repairmcp.com/mcp`
> (deployment `baf2d24b-c670-4fb6-be4d-d1dbe435e7f0`, deployed
> 2026-09-14T20:34:58Z) live and verified on the wire; see the PA row in
> CLAUDE.md's build status. `/health` reports 89 sections, current through
> 2026-09-14, captured 2026-09-14, paCodeEffectiveThrough "56 Pa.B. 4026
> (July 4, 2026)", captureSources legis 58 / pacode 31, domains insurance 37
> / repair_law 19 / employment 33. The real capture (14 requests, 93 s) ran
> clean on the first attempt; task review against the saved real pages, run
> before a line of the capture itself executed, caught four parser/manifest
> corrections the plan below got wrong: (1) consolidated pages print
> subsection markers as inline bold (`<b>(a)&nbsp;General rule.--</b>text`)
> — the plan's "bold-led paragraph is a note" rule emptied half of chapter
> 73 and was replaced by "bold text opening with ( or a quotation mark is
> body"; empty named cites now hard-fail; subchapter labels with a decimal
> (`SUBCHAPTER B.1`) are handled; (2) act pages: the plan's
> standalone-history-note regex swept long body subsections ending in an
> inline note into historyNotes; replaced by a structural rule (one pair of
> parentheses enclosing only `;`-joined act-note clauses); (3) Pennsylvania
> Code: chapter 9's preamble adoption line reads "Subchapter A", so the
> chapter-level date fallback accepts Chapter or Subchapter lines, a
> section's Source lines are scoped to its own cite, and a range-reserved
> head (`§ § 231.91—231.99. {Reserved}.`) is skipped; (4) identity: act
> aliases are tested whole before the section split ("The Minimum Wage Act
> of 1968" resolves) and curly quotes normalize. Two kickoff readback
> expectations were also wrong against the real page: 75 Pa.C.S. 7301
> prints its own note (effective 2/7/2003); 7307 is the chapter-inherit
> case (7/1/1977). The zone WAF rate limit FIRED on pa.repairmcp.com — a 30
> parallel-request burst returned 20×200 then 10×429 — the first hostname
> since Florida where it has; fl., ca., deg., and ny. still return 0/30
> under the same test (CLAUDE.md Backlog, first entry).

Written 2026-09-14. Pattern follows WA → MT → CO → TX → CA → FL → NY: a
state package on `@repairmcp/state-law`, a Worker at `pa.repairmcp.com`,
registration in `scripts/state-registry.ts` so the 4-week drift checker
covers Pennsylvania automatically. Every capture surface below was verified
**on the wire this day** before a line of code was written; every chapter
and act page the manifest names was fetched and its section list read back,
and every Pennsylvania Code section named was fetched individually and its
heading, Source note, and currency sentence confirmed.

**The state order on file was wrong, and this document corrects it.**
CLAUDE.md and the FL/NY kickoff docs recorded FL → NY → MN → PA → OH → IL →
MI → NC → MA → GA. The project owner's actual "Remaining states ordering"
decision (shown 2026-09-14) is: **Tier 1 — FL, NY, PA, OH, IL, MI, NC**
(big markets, strong law, clean publishers, in that order); **Tier 2 — GA,
TN, NJ** (large markets whose official code is LexisNexis-hosted behind a
bot challenge; each needs a California-style mirror decision before a
kickoff, and Georgia is the one worth fighting for). Minnesota is not in
Tier 1. Pennsylvania is #3 of Tier 1, behind the two shipped states, so it
is correctly next; **Ohio follows** (codes.ohio.gov serves the ORC and OAC
as clean HTML).

Two decisions in this build are the project owner's, made 2026-09-14 after
the surfaces were probed, and are recorded here because they are policy,
not code:

1. **The Pennsylvania Code comes from the official publisher despite its
   robots.txt.** The Legislative Reference Bureau's site
   (`pacodeandbulletin.gov`) answers every request with clean HTML, a
   per-section Source note carrying real effective dates, and a sitewide
   currency sentence on every page. Its `robots.txt` says `User-agent: *
   Disallow: /`, name-blocks GPTBot, ChatGPT-User, and Amazonbot, and
   blocks `/Display/pacode` even for Googlebot. There is no bot challenge;
   the block is a directive, not a wall. Decision: capture from the
   official site at a **10-second per-fetch floor** (`FetchOpts.minDelayMs`,
   the CA leginfo mechanism), by chapter page rather than by section so
   the whole capture is five requests, and record that choice on /legal and
   in the corpus source note. The alternative — Cornell LII's mirror at its
   10 s crawl delay — was declined because LII's Pennsylvania pages are
   inconsistent: 31 Pa. Code 62.3 carries its Source note there, but 37 Pa.
   Code 301.5 carries no Source note and no currency line at all, and
   nothing on LII states how current the mirror is. "The corpus states its
   own cutoff" is the convention this project cares about most, and only
   the official site satisfies it. Do not lower the pace or route to the
   mirror without asking.
2. **Statutes come from the Legislature's static mirror, whole pages, not
   the new palegis.us endpoint.** `legis.state.pa.us/WU01/LI/LI/...` still
   serves every consolidated chapter and every unconsolidated act as plain
   server-rendered HTML with a real HTTP 404 on absence. The newer
   `palegis.us/statutes/.../view-statute` endpoint returns an empty
   navigation shell to a plain fetch and only renders text with an
   undocumented `iFrame=true` parameter; it is the by-hand cross-check and
   the fallback if the mirror is ever retired, not a capture surface.

---

## 1. Success criteria

Same bar as NY (kickoff §1): a Pennsylvania shop asks a claims or shop
question in shop language and gets verbatim Pennsylvania law with a
paste-ready citation. The Pennsylvania headliners, in demo order:

1. **The appraiser may not steer, and must work with the shop the customer
   chose** → 31 Pa. Code 62.3(f): "(4) Not mention the name of any repair
   shop, unless the appraiser includes disclosure that there is no
   requirement to use any specified repair shop", "(3) Review the appraisal
   with an authorized representative of the repair shop which is selected
   by the consumer", "(1) Not have a conflict of interest", "(2) Obtain the
   consumer's consent before authorizing the removal of a motor vehicle
   from one location to another". The statute behind it: 63 P.S. 861(d),
   "No appraiser or his employer shall require that repairs be made in any
   specified repair shop." No other shipped state puts the anti-steering
   duty on the **appraiser's license**.
2. **The appraisal must be an amount the car can actually be fixed for** →
   31 Pa. Code 146.8(d) (an insurer's appraisal "shall be in an amount for
   which it may be reasonably expected the damage can be satisfactorily
   repaired"), (f) (when the insurer elects to repair, the car is restored
   to its pre-loss condition), (g) (no cash settlement below what the
   insurer would pay to repair), (e) (betterment and depreciation must be
   documented in the file), (a) (no pushing a third-party claimant onto
   their own policy), (b) (no unreasonable travel to inspect or obtain an
   estimate). 146.8 is the automobile-specific settlement standard; it was
   not in the kickoff draft and surfaced only when the chapter's table of
   contents was read.
3. **The appraiser must come out** → 63 P.S. 861(f)(5): "Inspect a vehicle
   within six working days of assignment to the appraiser"; 861(e):
   supplements may be by photo or video, "provided that in the case of
   disputed repairs a personal inspection shall be required" (amended
   2016). The New York 216.7 six-business-day headliner has a Pennsylvania
   twin, in the statute rather than a regulation.
4. **Aftermarket crash parts must be disclosed on the appraisal** → 62.3(c)
   (10)–(11): a statement that the appraisal was prepared on aftermarket
   crash parts, the warranty consequence, and identification of every
   such part. There is no standalone crash-parts statute; the duty lives
   here.
5. **Total loss is a formula, and the methods are named** → 62.3(e): the
   loss is a total loss "if the cost of repairing a motor vehicle exceeds
   its appraised value less salvage value, or the motor vehicle cannot be
   repaired to its predamaged condition"; replacement value by the guide
   source method (average of two approved guides), the actual cost method,
   or dealer quotations, with the evaluation report sent to the consumer
   within five working days. 62.3(d): salvage value disclosure. Then 75
   Pa.C.S. 1161 (certificate of salvage required) and 1165 (reconstructed
   vehicles).
6. **Claim deadlines** → 146.5 (acknowledge within 10 working days), 146.6
   (investigation complete within 30 days, status every 45 days after),
   146.7 (accept or deny within 15 working days of proof of loss; a denial
   must cite the policy provision; delay notices). The statutory catalog is
   40 P.S. 1171.5(a)(10), stated plainly as carrying **no private right of
   action** (D'Ambrosio v. Pennsylvania National Mutual, Pa. 1981).
7. **Bad faith with teeth, for the insured** → 42 Pa.C.S. 8371: interest at
   prime plus 3 percent from the date of the claim, punitive damages,
   costs and attorney fees. First-party only — a third-party claimant has
   no 8371 claim against the other driver's insurer. Say so.
8. **The shop's own obligations** → 37 Pa. Code 301.5, the Attorney
   General's repair-shop trade practices: the written record before work
   starts (2), no charging for repairs not authorized in writing or above
   the authorized price, with the oral-authorization record rule (3) and
   (5), the posted disclosures — parts return, new/used/rebuilt, storage
   charges, estimate fees (4), the 24-hour rule (6), free correction of
   defective work (7), the itemized invoice (8), no charging for work not
   performed (9), no using the customer's car (11). The private remedy
   behind it: 73 P.S. 201-9.2 (treble damages).
9. **Holding and disposing of the car** → 75 Pa.C.S. 7311 (a garage or
   repair shop must report a vehicle of unknown ownership left 15
   consecutive days, or left 15 days after repair or storage was
   complete), 7305 (notice to owner and lienholders), 7306 (the reclaiming
   party pays towing and storage), 7307 and 7308 (disposal and public sale
   of unclaimed vehicles). Stated honestly: Pennsylvania has **no clean
   statutory garagekeeper's lien** — the only citation anyone offers is an
   Act of December 14, 1863 partly repealed in 1953; the possessory lien
   is common law and a question for counsel. Chapter 73 is the statutory
   route a shop can actually follow.
10. **Wage rules with teeth** → 43 P.S. 260.5 (final wages due by the next
    regular payday), 260.10 (wages 30 days late: liquidated damages of 25
    percent or $500, whichever is greater), 260.3 (regular payday), 260.4
    (notification of pay rate and payday), 260.9a (civil remedies, fees);
    34 Pa. Code 9.1 (authorized deductions — the comeback-chargeback
    answer) and 9.2 (no deduction below minimum wage); 43 P.S. 333.104
    (minimum wage and overtime after 40 hours) with 34 Pa. Code 231.41–.43
    (overtime rate, workweek, regular rate — amended 2022); 231.1
    (definitions), 231.21 (the minimum wage is owed for hours worked
    "regardless of whether the wage is paid on an hourly, salaried, or
    commissioned, piece rate, or any other" basis — the flat-rate hook),
    231.22 (deductions and allowances for board and lodging), 231.31,
    231.36, 231.37 (records, pay statement, posting).
11. **1099 techs** → the Workers' Compensation Act: 77 P.S. 22 (section
    104, "employe" definition), 431 (section 301, liability), 461 (section
    302, contractors and subcontractors), 481 (section 303, exclusivity),
    501 (section 305, insurance required, penalties).

## 2. Corpus manifest (89 sections, three domains, ten codes)

### 2.1 insurance — 31 Pa. Code 146 and 62; 40 P.S.; 63 P.S.; 42 Pa.C.S.; 75 Pa.C.S. ch. 11 (37)

- **31 Pa. Code Chapter 146 (Unfair Insurance Practices):** 146.1 through
  146.10, the whole chapter (10). Adopted 1978; 146.2 amended 1992, 146.7
  amended 1982, 146.10 added 1992.
- **31 Pa. Code Chapter 62 (Motor Vehicle Physical Damage Appraisers):**
  62.1, 62.2, 62.3 (3). 62.4 is `[Reserved]` and is not captured; a test
  asserts no reserved section leaks in. Chapter 66 (the old No-Fault
  regulations) is entirely reserved and is not a source.
- **Unfair Insurance Practices Act, Act 205 of 1974 (Cl. 40):** sections 1,
  2, 3, 4, 5, 9, 11 → 40 P.S. 1171.1, 1171.2, 1171.3, 1171.4, 1171.5,
  1171.9, 1171.11 (7). Section 5(b) was repealed 2024 and section 12 in
  1978; the act page prints both as repealed and the parser refuses to
  ship a repealed section.
- **Motor Vehicle Physical Damage Appraiser Act, Act 367 of 1972 (Cl.
  63):** sections 1, 2, 3, 6, 9, 10, 11, 12 → 63 P.S. 851, 852, 853, 856,
  859, 860, 861, 862 (8). Sections 4, 5, 7, 8 (renewal, suspension,
  hearings, licensing without examination) are licensing administration
  and are excluded.
- **42 Pa.C.S. 8371** (Subchapter G of Chapter 83, added 1990, effective
  7/1/1990) (1).
- **75 Pa.C.S. Chapter 11, Subchapter D (Salvage Vehicles, Theft Vehicles,
  Reconstructed Vehicles and Flood Vehicles):** 1161, 1162, 1163, 1164,
  1165, 1165.1, 1166, 1167 (8). 1165.2 is `(Expired)` and is excluded.

### 2.2 repair_law — 37 Pa. Code 301; 73 P.S.; 75 Pa.C.S. ch. 73 (19)

- **37 Pa. Code Chapter 301 (Automotive Industry Trade Practices):** 301.1
  through 301.6, the whole chapter (6). 301.1, 301.2, and 301.4 were
  amended effective 8/19/2024; 301.3, 301.5, and 301.6 carry NO Source
  note on the official site and the chapter carries no chapter-level
  adoption note, so those three citations carry no date (silence, never a
  guess).
- **Unfair Trade Practices and Consumer Protection Law, Act 387 of 1968
  (Cl. 12):** sections 1, 2, 3, 3.1, 9.2 → 73 P.S. 201-1, 201-2, 201-3,
  201-3.1, 201-9.2 (5). 3.1 is the Attorney General's rulemaking authority
  that Chapter 301 is issued under; 9.2 is the private action.
- **75 Pa.C.S. Chapter 73, Subchapter A (Abandoned Vehicles and
  Salvors):** 7301, 7304, 7305, 7306, 7307, 7308, 7311, 7312 (8). The
  salvor-authorization, police-duty, and private-property mechanics (7302,
  7303, 7303.1, 7304.1, 7309, 7310, 7311.1, 7311.2) are excluded. The
  definition of "abandoned vehicle" lives in 75 Pa.C.S. 102, a 154 KB
  Title-wide definitions section that is NOT captured; 7311's own text
  carries the 15-day trigger a shop needs.

### 2.3 employment — 43 P.S. (two acts); 34 Pa. Code 231 and 9; 77 P.S. (33)

- **Wage Payment and Collection Law, Act 329 of 1961 (Cl. 43):** sections
  2.1, 3, 4, 5, 6, 7, 8, 9.1, 10, 11.1 → 43 P.S. 260.2a, 260.3, 260.4,
  260.5, 260.6, 260.7, 260.8, 260.9a, 260.10, 260.11a (10). Sections 2, 9,
  11 are repealed (printed as such); 4.1 is railroads.
- **The Minimum Wage Act of 1968, Act 5 of 1968 (Cl. 43):** sections 3, 4,
  5, 8, 12, 13 → 43 P.S. 333.103, 333.104, 333.105, 333.108, 333.112,
  333.113 (6).
- **34 Pa. Code Chapter 231 (Minimum Wage):** 231.1, 231.21, 231.22, 231.31,
  231.36, 231.37, 231.41, 231.42, 231.43 (9). 231.82–231.84 are
  `{Abrogated}` (the 2020 salary-threshold rules repealed by Act 70 of
  2021), and 231.81 is now a one-sentence stub pointing at them, so the
  "special definitions" subchapter is excluded entirely; the white-collar
  exemptions are 43 P.S. 333.105(a)(5)'s reference to the federal
  regulations. The tipped-employee, special-certificate, and
  training-wage sections are out of scope.
- **34 Pa. Code Chapter 9, Subchapter A (Wage Payment and Collection
  Laws):** 9.1 (authorized deductions), 9.2 (restrictions), 9.3 (penalty)
  (3). 9.4 is railroads.
- **Workers' Compensation Act, Act 338 of 1915 (Cl. 77):** sections 104,
  301, 302, 303, 305 → 77 P.S. 22, 431, 461, 481, 501 (5). The 1915 act
  prints no catchlines, so these five headings are manifest descriptors
  recorded as `headingSource: "manifest"` (the CA pattern). West's
  numbering splits some WCA sections' subsections across P.S. numbers
  (301(a) is 431, 301(c) is 411); the manifest cites the P.S. number of
  the section's opening subsection and the payload carries the act
  section number.

### 2.4 Honest caveats and absences (tool-description and annotation content)

- **No private right of action under the Unfair Insurance Practices Act.**
  D'Ambrosio (1981) settled it; enforcement is the Commissioner's (1171.9,
  1171.11). The private remedy is 42 Pa.C.S. 8371, and it belongs to the
  **insured** — a third-party claimant's remedy is a Department complaint
  and the tort claim against the driver. Say both.
- **No labor rate survey rule, no paint-and-materials rule.** 146.8(d) is
  the "reasonably expected to be repaired for" standard; nothing like
  California's 2695.81 or 758.6 exists.
- **No standalone aftermarket crash parts statute.** The disclosure duty
  is 62.3(c)(10)–(11), on the appraiser. Stated.
- **Total loss is a formula, not a percentage.** 62.3(e); there is no
  Florida-style 80 percent test.
- **No statutory garagekeeper's lien in usable form.** The 1863 act is
  partly repealed and not served by the Legislature's site; the
  possessory lien is common law. Chapter 73 (report, notice, costs, sale)
  is the statutory route. For counsel.
- **No body shop licensing.** Pennsylvania licenses the **appraiser** (63
  P.S. 853) and regulates shop conduct through the Attorney General's
  Chapter 301 under the Consumer Protection Law. A shop is not registered
  the way New York's Article 12-A requires.
- **No Insurance Department guidance on steering, parts, or total loss.**
  The Department Notices index (checked 2026-09-14) carries nothing on
  motor vehicle appraisal or repair; its consumer auto guide is a
  brochure, not an interpretation, and is not captured. No guidance code
  ships.
- **No state OSHA plan for private employers** (federal OSHA governs the
  spray booth), **no adult meal or rest break statute** (breaks are for
  minors only), **minimum wage at the federal $7.25**, and the 2020 salary
  threshold for overtime exemption was repealed in 2021. The safety domain
  is absent, as in MT, CO, TX, FL, and NY.
- **No statewide currency line for statutes.** The Legislature's site
  states no "current through Act N" anywhere examined (the consolidated
  landing page, the title index, chapter pages, section pages). Statute
  citations carry the newest history-note date instead (§4); meta carries
  the capture date, as California does. The Pennsylvania Code DOES state
  its currency on every page, and that sentence is parsed into meta.

## 3. Capture surfaces — verified on the wire 2026-09-14, and the traps

### 3.1 Consolidated statutes — legis.state.pa.us static mirror, whole-chapter pages

- `https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/{TT}/00.{CCC}..HTM` —
  one page per chapter (`TT` the title, `CCC` the chapter, zero-padded):
  Title 42 Chapter 83 (399 KB, 94 sections, 8 subchapters), Title 75
  Chapter 11 (205 KB), Title 75 Chapter 73 (89 KB). Static server-rendered
  HTML, hard-wrapped at about 80 columns.
- Per-section pages also exist
  (`00.{CCC}.{SSS}.000..HTM`, section = chapter × 100 + `SSS`; verified
  for 17 sections) and are the `url` each corpus section carries, but
  they are NOT the capture surface: a section's date often lives only in
  its subchapter's or chapter's `Enactment.` note, which the single-section
  page omits (1162, 1165, 1166, 1167, 7304, 7305, 7307 carry no note of
  their own). Whole-chapter capture, split on the `§ NNNN.  Catchline.`
  heads, filtered to the manifest — the CO whole-title pattern. Every
  manifest cite must be found; a missing one hard-fails.
- **History notes and the date rule.** A section's own note is a
  parenthesized line after its text: `(Oct. 24, 2012, P.L.1431, No.178,
  eff. 60 days)`, followed by a prose gloss (`2012 Amendment.  Act 178
  amended subsec. (b).`). Subchapter and chapter notes read `Enactment.
  Subchapter D was added December 9, 2002, P.L.1278, No.152, effective in
  60 days.` and `Enactment.  Unless otherwise noted, Chapter 73 was added
  June 17, 1976, P.L.162, No.81, effective July 1, 1977.` Effective
  clauses come in four shapes: `eff. 60 days` / `effective in 120 days`
  (act date plus N days), `eff. imd.` (the act date), `eff. July 1, 1990`
  / `effective July 1, 1990` (explicit), and — on the whole-chapter page
  only — none (the section is dated by the nearest enclosing Enactment
  note). Newest effective date among the section's own notes wins; a
  section with none inherits its subchapter's, then its chapter's. Notes
  wrap across lines (`effective\nJuly 1, 1977`); lines are joined before
  matching.
- Consolidated sections print catchlines (`§ 7311.  Reports by garage
  keepers of abandoned vehicles.`), so headings are source text.
- **Absence is a real HTTP 404**: an invalid path 302s through
  `newSiteRedirect.cfm` to `palegis.us/404?targetURL=...`, which answers
  404. Verified with `00.099.099.000..HTM`. The cleanest absence behaviour
  of any state so far.
- robots.txt for `legis.state.pa.us`: `/WU01/LI/` is not disallowed;
  `Crawl-delay: 5` for the default agent. Enforced through
  `FetchOpts.minDelayMs`. Three fetches.
- Marker lines like `42c8371h` / `42c8371s` / `75c7301s` (the site's own
  anchors) appear as bare text and are discarded.

### 3.2 Unconsolidated statutes — the same mirror, whole-act pages

- `https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/{YYYY}/0/{AAAA}..HTM` —
  one page per act, by year and act number: 1974/0205 (UIPA, 64 KB),
  1972/0367 (Appraiser Act, 37 KB), 1968/0387 (UTPCPL, 134 KB),
  1961/0329 (WPCL, 41 KB), 1968/0005 (Minimum Wage Act, 72 KB),
  1915/0338 (Workers' Compensation Act, **909 KB, 240 sections**, one
  fetch). Same static HTML.
- The page opens with the act's title line (`Act of Jul. 14, 1961,P.L.
  637, No. 329 Cl. 43 - WAGE PAYMENT AND COLLECTION LAW`), the short
  title, `AN ACT` and its long title, then `TABLE OF CONTENTS` listing
  `Section  5.  Employes Who Are Separated from Payroll before Paydays.`
  (contents lines wrap), then the text with heads `Section 5.  Employes
  Who Are Separated from Payroll before Paydays.--(a)  Separated
  Employes. Whenever ...` — the catchline ends at `.--` and the body
  follows on the same line. The 1915 WCA prints `Section 301.  (a) Every
  employer shall be liable ...` with no catchline; headings for its five
  sections are manifest descriptors. Repealed sections print as `Section
  9.  Notice to Employer and Penalties.--(9 repealed July 14, 1977,
  P.L.82, No.30)` and are refused if a manifest ever names one.
- **History notes** are per section and per subsection, inline and
  parenthesized: `(5 amended July 14, 1977, P.L.82, No.30)`, `(2.1 added
  July 14, 1977, P.L.82, No.30)`, `((e) amended Apr. 14, 2016, P.L.79,
  No.13)`, `((f) repealed in part Oct. 5, 1980, P.L.693, ...)`. They
  carry the amending act's **approval date only** — never an effective
  clause. The date rule: newest amendment date found anywhere in the
  section's text, labeled `amended`; none → the act's own approval date
  from the title line, labeled `enacted`. Citations say what the page
  says (§4).
- **P.S. numbers are not printed.** West's Purdon's numbering (43 P.S.
  260.5) is what everyone cites, but the Legislature's page prints act
  section numbers only. The manifest asserts the P.S. cite for every
  section explicitly (no formula), and a test checks (a) uniqueness and
  (b) consistency with the Pennsylvania Code's own cross-references, which
  do print P.S. numbers against act sections: 62.2 cites "sections 3, 4,
  8 and 11 of the act (63 P.S. §§ 853, 854, 858 and 861)", 146.1 cites
  "sections 4 and 5(10) of the Unfair Insurance Practices Act (40 P.S.
  §§ 1171.4 and 1171.5(10))", 231.1 cites "sections 4(c), 5(a)(5) and 9
  of The Minimum Wage Act (43 P.S. §§ 333.104(c), 333.105(a)(5) and
  333.109)", 301.1 cites "section 3.1 of the Unfair Trade Practices and
  Consumer Protection Law (73 P.S. § 201-3.1)".
- Absence (a wrong year or act number) is the same real 404. Six
  fetches at the 5 s floor.

### 3.3 Pennsylvania Code — pacodeandbulletin.gov, whole-chapter pages, 10 s floor

- `https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/{TTT}/chapter{N}/chap{N}toc.html`
  — despite the name, the chapter "toc" page carries **every section's
  full text, Source note, and case-note blocks** (verified: Chapter 146
  page has 10 heads and 12 Source lines and contains 146.7(f)'s last
  sentence; Chapter 62 has 62.3(f)(4); Chapter 231 has 41 heads; Chapter
  9 has all six subchapters). Five fetches: 031/chapter146,
  031/chapter62, 037/chapter301, 034/chapter231, 034/chapter9.
- Per-section pages
  (`.../chapter{N}/s{N}.{S}.html&d=reduce`) exist, were fetched for all
  29 named sections in the four regulation chapters (HTTP 200, h4 head,
  Source note, currency sentence on every one), and are the `url` each
  corpus section carries; they are not the capture surface.
- Markup: `<h4>§ 146.7. Standards for prompt, fair and equitable
  settlements applicable to insurers.</h4>`, body paragraphs, then a
  `Source` heading whose first line is authority ("The provisions of this
  § 146.7 issued under the Unfair Insurance Practices Act ...") and whose
  second is history ("The provisions of this § 146.7 adopted December 15,
  1978, effective December 16, 1978, 8 Pa.B. 3575; amended May 21, 1982,
  effective May 22, 1982, 12 Pa.B. 1639. Immediately preceding text
  appears at serial pages ..."), then `Cross References` and `Notes of
  Decisions` blocks that are NOT regulation text and are cut. Section
  text ends where the Source heading (or the next h4) begins.
- **The date rule.** Each history entry is `adopted|amended|corrected
  <date>, effective <date>, N Pa.B. N` — the effective date may be
  explicit, relative (`amended May 6, 2022, effective in 90 days` on
  231.1 and 231.43 → the amendment date plus 90), or absent (`amended May
  10, 1974, 4 Pa.B. 916` on 62.1 → the amendment date). Newest effective
  date wins. A section with no history line (301.3, 301.5, 301.6; 231.21,
  231.22, 231.31, 231.36, 231.37, 231.41, 231.42) inherits the
  chapter-level note when one exists ("The provisions of this Chapter 231
  adopted March 18, 1977, effective March 19, 1977, 7 Pa.B. 750, unless
  otherwise noted"; Chapter 146 likewise, 12/16/1978; Chapter 62 "adopted
  December 28, 1973" with no effective clause → 12/28/1973); Chapter 301
  has no chapter-level adoption note, so its three undated sections carry
  no date. One transcription prints an effective date before its
  correction date (231.1: "corrected March 3, 1995, effective March 5,
  1994"); the newest-wins rule is unaffected.
- **Currency: every page states** "The Pennsylvania Code website reflects
  the Pennsylvania Code changes effective through 56 Pa.B. 4026 (July 4,
  2026)." The capture parses it into `meta.paCodeEffectiveThrough`, hard-
  fails if any page lacks it, and hard-fails if the five pages disagree
  (the FL first-page-sets-the-pin rule). It rolls weekly and is recorded,
  not pinned; the drift checker compares section text, and a moved
  `effectiveThrough` with unchanged sections is not drift.
- **Absence is HTTP 200** with "File not found. Please go back and try
  again." Detected by the missing h4 heading, the leginfo/Online
  Sunshine/nysenate shape.
- Pages are Windows-1252 with numeric entities for em dashes and curly
  quotes (`&#151;`, `&#145;`, `&#146;`); the decoder must map the C1
  range 128–159 through cp1252, not `fromCharCode`, or the catchline
  "General provisions—repair shop" loses its dash.
- robots.txt: `User-agent: *` → `Disallow: /`; the project owner's
  decision above. 10 s floor, five fetches, under a minute.

### 3.4 What was checked and not used

- `palegis.us/statutes/consolidated/view-statute?...` — empty shell
  without `iFrame=true`; renders 42 Pa.C.S. 8371 and 40 P.S. 1171.5 with
  it. Fallback and cross-check only. Its robots.txt has no catch-all block.
- `palegis.us/statutes/consolidated` landing page and Title 75 index — no
  currency statement anywhere.
- Cornell LII's Pennsylvania Code mirror — see the preface.
- 31 Pa. Code Chapter 66 — every section `[Reserved]`.
- 75 Pa.C.S. 1798 (attorney fees on first-party benefits) and 1799
  (passive-restraint premium discounts) — MVFRL first-party-benefit
  sections, not physical damage; excluded. 1716 (first-party benefit
  payment interest) likewise.
- 75 Pa.C.S. 102 — 154 KB of Title-wide definitions; excluded, see §2.2.
- The Insurance Department's Auto Insurance Guide PDF — a brochure.

## 4. Identity and citations

- Ten codes: `42 Pa.C.S.`, `75 Pa.C.S.`, `40 P.S.`, `43 P.S.`, `63 P.S.`,
  `73 P.S.`, `77 P.S.`, `31 Pa. Code`, `34 Pa. Code`, `37 Pa. Code`.
  Display cites "42 Pa.C.S. 8371", "75 Pa.C.S. 7311", "40 P.S. 1171.5",
  "63 P.S. 861", "73 P.S. 201-9.2", "43 P.S. 260.5", "43 P.S. 333.104",
  "77 P.S. 481", "31 Pa. Code 62.3", "31 Pa. Code 146.8", "37 Pa. Code
  301.5", "34 Pa. Code 231.43", "34 Pa. Code 9.1".
- Bare numbers resolve by EXACT match through `PA_CITE_CODES`, built from
  the manifests (the CA/NY pattern). The shipped manifest has no bare-
  number collisions (regulation numbers are dotted and distinct;
  consolidated numbers are four digits; P.S. numbers are dotted,
  hyphenated, or three-digit and distinct from each other); the NY
  two-claimant rule (resolve to a listing, never a guess) is kept as the
  guard for a future manifest and tested structurally.
- Input forms that resolve: "42 Pa.C.S. § 8371", "42 Pa. C.S.A. 8371",
  "75 Pa.C.S.A. § 7311", "40 P.S. § 1171.5", "40 Pa. Stat. § 1171.5",
  "43 P.S. 260.5", "43 Pa. Stat. Ann. § 260.5", "31 Pa. Code § 62.3",
  "31 Pa.Code 62.3", "37 Pa. Code 301.5", act-section forms ("UIPA § 5",
  "section 5 of the Unfair Insurance Practices Act", "WPCL section 10",
  "Appraiser Act section 11", "WCA § 305"), id forms, and named aliases
  ("Unfair Insurance Practices Act" / "UIPA" → the 40 P.S. listing,
  "Appraiser Act" / "MVPDAA" / "Physical Damage Appraiser Act" → the 63
  P.S. listing, "Unfair Claims Settlement Practices" / "Chapter 146" →
  the 146 listing, "Automotive Industry Trade Practices" / "Chapter 301"
  → the 301 listing, "UTPCPL" / "Consumer Protection Law" → the 73 P.S.
  listing, "WPCL" / "Wage Payment and Collection Law" → the 260 listing,
  "Minimum Wage Act" → the 333 listing, "Workers' Compensation Act" /
  "WCA" → the 77 P.S. listing).
- `chapter` values: consolidated sections carry the chapter and
  subchapter as printed ("ch. 83, subch. G"; "ch. 11, subch. D"; "ch. 73,
  subch. A"); unconsolidated sections carry the act's short title
  ("Wage Payment and Collection Law"), with the act number and year in
  the source note and the act section number in a per-section field;
  regulations carry the chapter ("Chapter 146"; "Chapter 9, Subchapter A").
- Citations: consolidated "75 Pa.C.S. 1161, effective 12/23/2012"
  (10/24/2012 plus 60 days), "42 Pa.C.S. 8371, effective 7/1/1990",
  "75 Pa.C.S. 1165, effective 2/7/2003" (inherited from Subchapter D's
  enactment, 12/9/2002 plus 60 days); unconsolidated "43 P.S. 260.5,
  amended 7/14/1977", "63 P.S. 861, amended 4/14/2016", "43 P.S. 260.10,
  amended 7/14/1977", a never-amended section "enacted <act date>";
  regulations "31 Pa. Code 62.3, effective 10/23/1999", "31 Pa. Code
  146.8, effective 12/16/1978", "34 Pa. Code 231.43, effective 8/4/2022",
  "37 Pa. Code 301.5" (no date — silence). Every date through
  `fmtDateUtc`.
- There is no edition pin: nothing in Pennsylvania rolls on a calendar the
  way FL's edition or NY's booklet does. The Pennsylvania Code currency
  sentence is recorded in meta and reported by /health; drift is text
  drift.

## 5. Package/app shape, tools, tests, deploy

`packages/state-pa` (schema with `captureSource: "legis" | "pacode"`,
`headingSource`, and `actSection` per section, three domains, ten codes;
taxonomy; three manifests — `sources-consolidated.ts` (three chapters,
17 cites), `sources-acts.ts` (six acts with explicit P.S. maps, 41 cites),
`sources-pacode.ts` (five chapters, 31 cites); three parsers —
`parse-consolidated.ts` (whole-chapter split on `§ NNNN.` heads with the
Enactment-note inheritance), `parse-act.ts` (whole-act split on `Section
N.` heads, catchline optional, repealed refusal), `parse-pacode.ts` (h4
heads, Source-note read, case-note cut, cp1252 decoding); one
`history-dates.ts` carrying all three date rules; three capture pipelines
and the profile with per-host `minDelayMs` (5 s legis, 10 s pacode);
identity; four `pa_*` tools + the connector pair with freshness passed),
`apps/state-pa-server` (same worker.ts shape; `/health` adds
`paCodeEffectiveThrough`, `captureSources` counts {legis, pacode}, and the
three-domain breakdown), registry entry `pa`, `PA-LAW-ATTENTION.txt`.

No PDF or Word reader: every surface is HTML. Nothing new lands in
`packages/state-law` unless the cp1252 entity decoding turns out to be
missing from `html.ts`, in which case it is added there (every state
benefits) rather than in `state-pa`.

Demo gauntlet (shop phrasing; the annotation vocabulary is the bridge):

1. "the adjuster told my customer to take it to their DRP shop" → 31 Pa.
   Code 62.3 first; 63 P.S. 861 top 3
2. "insurer wrote it for 20 hours and I can't repair it for that" →
   146.8 first; 62.3 top 3
3. "appraiser hasn't come out to look at the car in a week" → 63 P.S.
   861 first (six working days)
4. "aftermarket parts on the estimate and the customer never knew" →
   62.3 first
5. "they lowballed the total loss value" → 62.3 first; 146.8 top 3;
   "do they have to tell the customer the salvage value" → 62.3 first
6. "betterment on tires and a battery" → 146.8 first
7. "insurer hasn't even acknowledged the claim, two weeks" → 146.5 first;
   "no decision after a month" → 146.7 or 146.6 first; "denied with no
   reason given" → 146.7 first
8. "third-party claimant, adjuster told him to go through his own policy"
   → 146.8 first
9. "can I sue the insurer for bad faith" → 42 Pa.C.S. 8371 first; 40 P.S.
   1171.5 top 3, with the no-private-action note in the payload
10. "do I need written authorization before I start the repair" → 37 Pa.
    Code 301.5 first; "can I charge storage, do I have to post it" →
    301.5 first; "customer wants his old parts back" → 301.5 first
11. "customer never picked the car up, it's been a month" → 75 Pa.C.S.
    7311 first; 7306 or 7308 top 3
12. "total loss, does it need a salvage title" → 1161 first; "rebuilt a
    salvage car" → 1165 top 3
13. "tech quit Friday, when do I have to pay him" → 43 P.S. 260.5 first;
    "wages 30 days late" → 260.10 first
14. "overtime for a salaried estimator" → 43 P.S. 333.104 first; 34 Pa.
    Code 231.43 top 3
15. "deducting a comeback from a tech's pay" → 34 Pa. Code 9.1 first
16. "1099 tech, no comp policy" → 77 P.S. 501 first; 77 P.S. 22 top 3
17. exact cite short-circuits ("31 Pa. Code § 62.3", "42 Pa.C.S. § 8371",
    "43 P.S. § 260.5", "77 P.S. § 481"); "UIPA", "Chapter 146",
    "Appraiser Act", "WPCL" listings; the structural no-collision test

Deploy: `pa.repairmcp.com` custom domain, `workers_dev: false`,
burst-test the zone WAF rule on the new hostname (the Backlog's first
entry is still open — it has not fired since the FL launch). Site flips to
ten sources, one setup; /legal names both Pennsylvania publishers and the
robots decision the way it names California's.

## 6. Risks

- **The static mirror is legacy.** `legis.state.pa.us` redirects its
  homepage to `palegis.us` but still serves `/WU01/LI/` in full. If the
  mirror is retired, every statute fetch 404s, the capture and the drift
  checker fail loudly, and the fallback is the `view-statute?iFrame=true`
  endpoint (verified to render full text for both consolidated and
  unconsolidated sections, one request per section, robots open).
- **The Pennsylvania Code robots block.** The project owner's decision,
  recorded above. Five requests at 10 s every four weeks is the whole
  footprint. If the LRB adds a bot challenge, the capture fails loudly
  rather than shipping stale text.
- **Relative and inherited dates.** Four effective-clause shapes on the
  statute side and three on the regulation side, plus two inheritance
  rules. `history-dates.ts` carries all of them with a test per shape,
  and the golden citation panel pins the worked examples in §4.
- **The 909 KB Workers' Compensation Act page.** One fetch, ~15,000
  lines; the act parser must split it without quadratic string work. The
  manifest names five of 240 sections.
- **Hard-wrapped text and cp1252.** Both surfaces wrap at ~80 columns and
  the Pennsylvania Code uses C1-range numeric entities. Joining and
  decoding are parser concerns with fixtures from the saved raw pages.
- **Length bias.** 62.3, 146.7, 146.8, 301.5, 1171.5, and 231.43 are long;
  the demo suite pins the headliners and the annotation layer carries the
  routing. Same cross-state scorer candidate noted under CO, CA, FL, NY.
