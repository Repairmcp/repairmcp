# Kickoff spec: California state vertical (state #5)

Written 2026-09-04. Pattern follows WA → MT → CO → TX: a state package on
`@repairmcp/state-law`, a Worker at `ca.repairmcp.com`, registration in
`scripts/state-registry.ts` so the 4-week drift checker covers California
automatically. Every capture surface below was verified **on the wire this
day**; the two research passes that preceded the build were right about the
statutes and Cal/OSHA and wrong-by-omission about the regulations (see §3).

Two decisions in this build were the project owner's, made 2026-09-04 after
the surfaces were probed, and are recorded here because they are policy,
not code:

1. **leginfo.legislature.ca.gov's robots.txt disallows every agent**
   (`Disallow: /`, `Crawl-Delay: 10`) — the first publisher in this project
   to do so (WA, MT, CO, and TX publishers all allow). Decision: fetch
   politely at the stated 10-second delay. The Legislature is the official
   publisher of public-record text, the capture is ~16 article/chapter views
   every four weeks, and the bot names itself. `FetchOpts.minDelayMs` was
   added to the shared capture contract so the delay is enforced in code.
2. **The official CCR publisher is closed to automated access.** Westlaw's
   calregs site (the OAL contract publisher) answers every non-browser
   request with a Cloudflare challenge; a bot-challenge bypass was never on
   the table. Decision: capture Titles 10 and 16 (and Wage Order 9) from the
   Legal Information Institute's mirror, name that provenance on the legal
   page, in the corpus source note, in every tool description, and on each
   section (`captureSource`), and keep the Register history so currency is
   visible per section. The alternatives — official-only (statutes + Cal/OSHA
   + two narrow CDI PDFs, losing 2695.7, 2695.8, and every BAR rule) or
   manual browser saves replayed from a directory (no automated drift
   checking) — were declined.

---

## 1. Success criteria

Same bar as TX (kickoff §1): a California shop asks a claims question in
shop language and gets verbatim California law with a paste-ready citation.
The California headliners, in demo order:

1. **Steering** → Ins. Code 758.5 (no required or steered shop; written
   notice of the right to choose; restoration to pre-loss condition when
   the insurer's recommendation is accepted), backed by 10 CCR 2695.8(d)
   and 2695.85 (the Bill of Rights).
2. **The paint and materials cap** → Ins. Code 758.6: an insurer may not pay
   an amount unrelated to an accepted paint and materials methodology. No
   other shipped state has an analog.
3. **Labor rate surveys** → 10 CCR 2695.81: the standardized survey, and
   what an insurer may and may not do with one.
4. **OEM procedures with a regulatory hook** → 16 CCR 3365: auto body and
   frame repairs follow the manufacturer's specifications or nationally
   distributed, periodically updated industry specifications. The strongest
   repair-standard rule in any shipped state.
5. **Response and decision deadlines** → 10 CCR 2695.5 (15 days) and 2695.7
   (40 days to accept or deny; 30 days to pay).
6. **Flat-rate techs** → Lab. Code 226.2: piece-rate employees get separate
   pay for rest periods and nonproductive time, itemized. Wage Order 9's
   definition puts vehicle repair inside its scope.
7. **Final pay** → Lab. Code 201/202/203; **comeback chargebacks** → 221/224.
8. **Spray booths** → 8 CCR 5446 and the Article 137 orders; respirators →
   5144. California has a state OSHA plan, so the safety domain returns.

## 2. Corpus manifest (97 sections, four domains)

### 2.1 insurance — Ins. Code, Veh. Code, 10 CCR (23)

- **Ins. Code Div. 1, Pt. 2, Ch. 1, Art. 5.1 (Unlawful Practices):** 758,
  758.5, 758.6.
- **Art. 6.5 (Unfair Practices):** 790.03 (the (h) catalog), 790.035.
- **Ch. 12, Art. 4.5 (Insurer Inspections):** 1874.85, 1874.86, 1874.87 —
  the whole article.
- **Veh. Code:** 544 (total loss salvage vehicle defined), 11515 (the
  insurer's salvage duties on a total).
- **10 CCR 2695 (Fair Claims Settlement Practices Regulations):** 2695.1
  through 2695.8, 2695.12 through 2695.14, 2695.81, 2695.85. The property,
  surety, and life sections (2695.9–.11) are out of scope; 2695.15–.17 no
  longer exist (renumbered in 1997); 2695.82 is the survey questionnaire
  form and adds nothing 2695.81 does not say.

### 2.2 repair_law — Bus. & Prof. Code, 16 CCR, Civ. Code (39)

- **B&P Ch. 20.1 (Motor Vehicle Replacement Parts):** 9875, 9875.1, 9875.2 —
  the non-OEM crash-part disclosure duty lives HERE, not in the Automotive
  Repair Act; 10 CCR 2695.8(g) cross-references it.
- **B&P Ch. 20.3 (the Automotive Repair Act):** 9880.1, 9884, 9884.7,
  9884.8, 9884.9, 9884.10, 9884.11, 9884.16, 9884.17, 9884.19, and the
  auto body article 9889.50–9889.53. Note 9884.16: an unregistered shop has
  no lien, no storage, and no suit on the repair.
- **16 CCR Div. 33 (Bureau of Automotive Repair):** 3303; Art. 7 disclosure
  rules 3352–3358 (3353 estimate, 3354 additional authorization, 3355
  replaced parts, 3356 invoice, 3357 hazardous-waste charges, 3358 records);
  Art. 8 accepted trade standards 3360, 3365, 3367, 3368; Art. 9 false or
  misleading 3371–3376. 3359 is repealed; 3361–3363 do not exist on the
  mirror (the sweep returned generic pages); 3364 and 3366 are VIN and air
  conditioning and are out of scope. **3353 carries its 2025 teardown
  amendment** (Register 2025, No. 22, operative 7/1/2025) — visible only
  after the parser was cut to the mirror's active tab (§3.2).
- **Civ. Code Ch. 6.5 (Liens on Vehicles):** 3068, 3068.1, 3068.2, 3071.

### 2.3 safety — 8 CCR from DIR, plus Lab. Code 6401.7 (17)

3203 (IIPP), 3380 (protective devices), 3400 (first aid), 5144
(respirators), 5153 (spray coating ventilation and PPE), 5155 (airborne
contaminants), 5162 (eyewash), 5194 (hazcom), Article 137 spray coating:
5445, 5446 (booths), 5450 (ventilation), 5451 (flammable liquids), 5452
(fire protection), 5453 (operation and maintenance), 5461 (organic
peroxides and dual-component coatings — the isocyanate order), 6151 (fire
extinguishers); Lab. Code 6401.7 (the IIPP statute).

### 2.4 employment — Lab. Code, Wage Order 9 (18)

Lab. Code 200, 201, 202, 203, 204, 221, 224, 226, 226.2, 226.7, 510, 512,
1194, 2751, 2802, 3700, 3706; 8 CCR 11090 (IWC Wage Order 9, one section
with its 22 numbered parts).

### 2.5 Honest caveats and absences (tool-description and annotation content)

- **No private right of action under 790.03** (Moradi-Shalal, 1988). The
  Department of Insurance enforces the FCSPR; 2695.12 and 790.035 penalties
  are payable to the Department, not the claimant.
- **No prompt-payment interest remedy** like Texas 542.060. The deadlines
  are 2695.5 and 2695.7; the consequence is a Department complaint.
- **No statutory total-loss percentage.** Veh. Code 544 defines the total by
  repair cost against value; 2695.8(b) sets the valuation method.
- **No mandatory appraisal statute** for auto claims. Appraisal is a policy
  clause when the policy has one.
- **226.2 applies to piece-rate employees.** Whether a flat-rate body shop
  plan is piece-rate is a question for counsel, stated, not decided.
- **Statute headings are editorial.** California prints no catchlines. The
  schema records `headingSource: 'manifest'` on every statute and the tool
  descriptions say to quote the text, never the heading.
- **The CCR text is from a mirror.** Stated everywhere a shop could see it.

## 3. Capture surfaces — verified on the wire 2026-09-04, and the traps

### 3.1 Statutes — leginfo.legislature.ca.gov (official, plain HTML)

- Two views share one per-section markup: the TEXT view
  `codes_displayText.xhtml?lawCode=BPC&division=3.&title=&part=&chapter=20.3.&article=`
  (wrapper `<div id="manylawsections">`, one `<h6>` head per section with a
  JS self-link) and the SECTION view `codes_displaySection.xhtml?lawCode=INS&sectionNum=758.5.`
  (wrapper `codeLawSectionNoHead`, head `<h6><b>758.5.</b></h6>`). Hierarchy
  headers `<h4>`/`<h5>` print DIVISION / PART / CHAPTER / ARTICLE with
  bracketed section ranges — the manifest pins one per view as a tripwire.
- The history note is an `<i>(…)</i>` opening with a session-law verb:
  `(Amended by Stats. 2018, Ch. 503, Sec. 3. (AB 3141) Effective January 1, 2019.)`.
  The text view wraps it in a styled `<p>`; the section view prints the bare
  `<i>` after the last `</p>` — the `<i>` identifies it in both. Newest
  "Effective <date>" or "operative <date>" wins (226.2's "Section operative
  January 1, 2021, by its own provisions" is when the text took hold).
  1937 enactments state no date and get none.
- **Absence is HTTP 200 with an empty `single_law_section` div.** No wrapper
  → the parser throws. **Dual versions** (Lab. Code 226.7 in 2026) 302 the
  section view to a JSF picker with POST-only links; the text view prints
  both blocks, and `selectVersion` keeps the newest version effective on or
  before the capture date (or the last printed, with a warning naming it).
- No currency marker anywhere on the site. Currency is the capture date.
- Capture is one fetch per manifest view (16 views), at the robots.txt
  10-second crawl delay (`LEGINFO_CRAWL_DELAY_MS`, enforced through
  `FetchOpts.minDelayMs`).

### 3.2 CCR Titles 10 and 16, and Wage Order 9 — the LII mirror

- `https://www.law.cornell.edu/regulations/california/{T}-CCR-{§}`, one page
  per section. `<h1 id="page_title">Cal. Code Regs. Tit. 16, § 3353 - Estimate/Work Order Requirements</h1>`
  is the identity tripwire (title AND cite cross-checked); the breadcrumb
  `<li>`s give the hierarchy (Title > Division/Chapter > Subchapter >
  Article), cross-checked against the manifest's expected article; the text
  is `<div class="statereg-text">` of `<p>`s and nested
  `<div class="subsect"><span class="designator">(a)</span>…` blocks; the
  notes are `<div class="statereg-notes">` `<note>` blocks — the authority
  note and the numbered Register history separated by `<br/>`.
- **The trap:** the page also carries a prior point-in-time copy behind a
  "Compare" tab (`tab_default_2`) with its OWN shorter history. Parsing the
  whole page took the older copy's history and reported 16 CCR 3353 as
  effective 2018 when its 2025 teardown amendment was on the page. The
  parser is cut to `tab_default_1`.
- **Dates:** Register entries state `filed M-D-YY; operative M-D-YY` (or
  `effective`), the older `effective thirtieth day thereafter` (filing date
  plus 30), `effective upon filing`, and one transcription prints
  `operative 1/1/2017` with slashes. Two-digit years are pre-2000. Changes
  without regulatory effect and editorial corrections contribute no date.
- **Absence is HTTP 200 with a generic "California Code of Regulations" page
  and no h1** — detected by the missing title, not by status.
- No currency marker of its own; the newest Register cite per section is
  the visible currency signal. robots.txt `Crawl-delay: 10`, enforced.
- Wage Order 9 (8 CCR 11090) is captured here too: DIR publishes it only as
  a two-column PDF; the mirror has it as clean HTML with all 22 parts.

### 3.3 Title 8 (Cal/OSHA) — dir.ca.gov/title8 (official, plain HTML)

- `https://www.dir.ca.gov/title8/{§}.html`, one section per page, two markup
  generations sharing a skeleton: `<div class="chapter-article">` (Subchapter
  / Group / Article lines — the Article line becomes chapter/chapterTitle),
  `<h1>§5446. Spray Booths.</h1>`, then either bare `<P>` runs (old) or
  `co_paragraphText` divs (new), `Note: Authority cited …`, `HISTORY`, and
  numbered Register entries. A line-based read handles both.
- Explanatory NOTEs inside the body are regulation text and stay; a guide
  link DIR places under some h1s is stripped.

### 3.4 What was checked and not used

- CDI's own site: the Fair Claims page is a table of contents linking to
  Westlaw; two narrow PDFs exist (the 2695.81 rulemaking text, the Bill of
  Rights consumer document); the only auto-body bulletins are 2002-4 and
  2002-8 on insurer inspections, superseded in substance by Ins. Code
  1874.85. Nothing captured from CDI.
- BAR's site links every regulation to Westlaw; its compiled PDF is the
  2019 edition. Nothing captured from BAR.

## 4. Identity and citations

- Eight codes: `Cal. Ins. Code`, `Cal. Bus. & Prof. Code`, `Cal. Lab. Code`,
  `Cal. Veh. Code`, `Cal. Civ. Code`, `10 CCR`, `16 CCR`, `8 CCR`. Display
  cites "Cal. Ins. Code 758.5", "10 CCR 2695.8", "8 CCR 5446".
- Every cite is a single number with an optional decimal; the shared
  factory's group splitter cannot read that, so California resolves
  everything itself. **Bare cites resolve by exact section number** —
  `CA_CITE_CODES` is built from the manifests at module load and throws on
  a number claimed by two codes. Code-worded forms ("Ins. Code 758.5",
  "B&P 9884.9", "Labor Code 226.2"), CCR forms ("10 CCR 2695.8", "Cal. Code
  Regs. tit. 16, § 3353", "8 C.C.R. 5446", "CCR 2695.81"), id forms, and
  named aliases ("Automotive Repair Act" and "Fair Claims Settlement
  Practices Regulations" list their chapters; "Wage Order 9" and "Consumer
  Bill of Rights" fetch their sections) all resolve.
- `chapter` values read naturally after the word "chapter" in the shared
  payloads: "chapter 20.3 (Div. 3) Cal. Bus. & Prof. Code (Automotive
  Repair)", "chapter 1, art. 5.1 (Div. 1, Pt. 2) Cal. Ins. Code (Unlawful
  Practices)", "chapter 5, subch. 7.5, art. 1 (Tit. 10) 10 CCR (Fair Claims
  Settlement Practices Regulations)". They are unique per code.
- Citations carry `effective M/D/YYYY` when the source states a date.
  **No edition or session pin exists** — none of the three surfaces states
  currency — so the 4-week drift checker is the freshness mechanism and
  `/health` reports `captureSources` instead of a currency sentence.

## 5. Package/app shape, tools, tests, deploy

`packages/state-ca` (schema with `captureSource` and `headingSource`,
taxonomy with the safety and employment topics restored plus
`paint_materials`, `labor_rate`, `estimate_authorization`,
`repair_standards`, `replaced_parts`, `shop_registration`, `piece_rate`,
`expense_reimbursement`, `commission_pay`; three parsers; three capture
pipelines; the profile), `apps/state-ca-server` (same worker.ts shape;
`/health` adds `captureSources` + the four-domain breakdown), registry entry
`ca`, `CA-LAW-ATTENTION.txt`, four `ca_*` tools + the connector pair.

Demo gauntlet (shop phrasing; annotation vocabulary is the bridge):

1. steering / network shop → 758.5 first
2. "they cap paint and materials at $X" → 758.6 first
3. "adjuster says the prevailing rate is $X from their survey" → 2695.81 first
4. supplement sitting unanswered → 2695.5 / 2695.7 top 3
5. OEM procedure denied as "not necessary" → 16 CCR 3365 first
6. aftermarket parts pushed → 2695.8 / 9875.1 top 3
7. total loss valuation → 2695.8 top 3
8. storage charges after total loss → 2695.8 / 3068 top 3
9. teardown before the estimate / customer didn't authorize → 9884.9 / 3353 / 3354 top 3
10. customer won't pay, car sitting here → 3068 top 3
11. flat-rate tech rest period pay → 226.2 first
12. tech quit, final check → 201 or 202 first; comeback chargeback → 221 / 224 top 3
13. spray booth clearance → 5446 first; respirator program → 5144 first
14. exact cite short-circuit + "Automotive Repair Act" chapter listing — structural

Deploy: `ca.repairmcp.com` custom domain, `workers_dev: false`, burst-test
the zone WAF rule on the new hostname (expect 429s ~20/10s).

## 6. Risks

- **The mirror's template.** LII is a third party with no contract to us.
  The parser refuses anything that does not carry the h1 identity, the
  breadcrumb, and the active-tab text region, so drift fails loudly at the
  4-week check rather than shipping wrong text.
- **The mirror's lag.** LII showed the 2025 BAR amendment in the same season
  it was adopted, but nothing guarantees that pace. The per-section Register
  history is the visible signal; a shop-facing dispute over a freshly
  amended rule should be checked against the official publisher by hand.
- **leginfo's robots posture.** Fetching at all is the project owner's
  decision; the delay is enforced in code. If the Legislature blocks the
  bot, the capture fails loudly and the corpus keeps serving.
- **Dual-version statutes.** `selectVersion` picks by date and always warns;
  the warning is the human's cue to read both versions on leginfo.
