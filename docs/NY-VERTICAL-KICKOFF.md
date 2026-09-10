# Kickoff spec: New York state vertical (state #7)

> **Status 2026-09-10 (same day): SHIPPED** — `https://ny.repairmcp.com/mcp`
> (version `9f9c249c-1b83-41fc-8e79-24a43acaf808`) live and verified on the
> wire; see the NY row in CLAUDE.md's build status. The real capture forced
> three parser fixes, no statute-article corrections: a bare "Sec." contents
> line and a wrapped SUBPART banner in CR 142's `bodyEnd` matching, the CR-82
> page-6 sidebar leaking into 15 NYCRR 82.2, and DFS phrasing gaps ("informal
> opinion" wording and Circular Letter 11's dateline sitting two lines above
> the cite instead of one). The zone WAF rate limit returned zero 429s on
> ny.repairmcp.com across 30 parallel requests — the fourth hostname after
> fl., ca., and deg. where it does not fire (CLAUDE.md Backlog, first entry).
> The display cite for guidance carries the code word "DFS Guidance" (e.g.
> "DFS Guidance OGC Opinion 04-06-03") — a deviation from the original §4
> draft, accepted.

Written 2026-09-10. Pattern follows WA → MT → CO → TX → CA → FL: a state
package on `@repairmcp/state-law`, a Worker at `ny.repairmcp.com`,
registration in `scripts/state-registry.ts` so the 4-week drift checker
covers New York automatically. Every capture surface below was verified
**on the wire this day** before a line of code was written; every cite in
the manifest was fetched and its catchline read back.

New York is state #7 by the population-ordered decision of 2026-09-09
(FL → NY → MN → PA → OH → IL → MI → NC → MA → GA). It is the fourth-largest
fleet in the country, and Regulation 64 (11 NYCRR Part 216) is the most
detailed insurer-conduct rule any shipped state carries.

Three decisions in this build are the project owner's, made 2026-09-10
after the surfaces were probed, and are recorded here because they are
policy, not code:

1. **Regulation 64 comes from the Legal Information Institute's mirror.**
   The official NYCRR publisher (Thomson Reuters, `govt.westlaw.com/nycrr`)
   answers every non-browser request with a Cloudflare challenge — the
   California calregs situation exactly. DFS does not host the text; its
   regulation index links to Westlaw. Decision: capture 11 NYCRR Part 216
   from LII (`law.cornell.edu/regulations/new-york/`), name that provenance
   on the legal page, in the corpus source note, in every tool description,
   and on each section (`captureSource: "lii"`), and keep the Register
   history so currency is visible per section. Everything else in the
   corpus comes from an official publisher. The alternatives — official-only
   (losing Part 216 entirely) or manual browser saves replayed from a
   directory (no automated drift checking) — were declined, as in CA.
2. **Statutes come from the Senate's public site, one page per section**
   (approach A of three). The Open Legislation JSON API was declined for
   v1: it needs a registered key (an account, a secret on disk for the
   Scheduled Task) and delivers the same line-broken text the HTML carries.
3. **A DFS guidance code ships in v1** — six hand-picked OGC opinions and
   circular letters on total loss, steering, and Regulation 64, each pinned
   by URL with its stated date and status. One of them (Circular Letter 16
   of 2000, on 2610(b)) is WITHDRAWN and is captured because a shop will be
   shown it; the corpus states the withdrawal rather than letting it be
   cited as live guidance.

---

## 1. Success criteria

Same bar as FL (kickoff §1): a New York shop asks a claims or shop question
in shop language and gets verbatim New York law with a paste-ready
citation. The New York headliners, in demo order:

1. **Manual workers must be paid weekly** → Lab. Law 191(1)(a). Body techs
   are manual workers; the Vega line of cases made a
   late paycheck a liquidated-damages claim under 198 (1st Dep't 2019). No other shipped
   state has this. 198 was amended 2025-05-16 (the revision date the
   Senate site shows) — the capture reads what it says now.
2. **Steering** → Ins. Law 2610(a) (no requiring repairs at a particular
   place or shop) and (b) (no recommending or suggesting a shop unless
   requested, with the right-to-choose notice). Beside it: DFS OGC Opinion
   04-06-03 on "certified" shop programs, and Circular Letter 16 (2000),
   withdrawn 12/4/2003 after Allstate v. Serio — stated as withdrawn.
3. **The insurer's physical-damage duties** → 11 NYCRR 216.7: inspection
   within six business days of notice, negotiation in good faith, the
   parts and labor provisions, total-loss valuation in (c), the sales tax
   and salvage provisions. Amended eff. 2/1/2017 and 6/9/2021 per the
   Register history LII carries.
4. **Prompt handling** → 216.4 (acknowledge within 15 business days), 216.5
   (investigation), 216.6 (settlement standards), 216.10 (third-party
   property damage claims — the claimant who is not the insured). The
   statutory catalog is Ins. Law 2601, stated plainly as carrying NO
   private right of action (Rocanova v. Equitable, 1994).
5. **The shop's own obligations** → 15 NYCRR 82.5 (written estimate,
   authorization, parts return, the invoice, air bag and A/C rules) and
   Veh. & Traf. Law 398-d; registration in 398-c and 82.3; 82.18 (insurers
   and repair shops) and 82.13 (quality repairs and subcontractors).
6. **Holding and selling the car** → Lien Law 184 (the bailee's lien on a
   motor vehicle) and 200–202 (sale to satisfy the lien, notice,
   advertisement).
7. **Wage rules with teeth** → Lab. Law 162 (meal periods), 161 (one day
   rest in seven), 193 (deductions — the comeback-chargeback question),
   195 (wage notice and statements), 198-c (wage supplements); 12 NYCRR
   142-2.3 (call-in pay), 142-2.4 (spread of hours), 142-2.10
   (deductions and expenses).
8. **1099 techs** → Workers' Comp. Law 2 (definitions), 10, 50, 52 (effect
   of failure to secure compensation).

## 2. Corpus manifest (95 sections, three domains, ten codes)

### 2.1 insurance — Ins. Law; 11 NYCRR 216; DFS guidance (22)

- **Ins. Law art. 26 (Unfair Claim Settlement Practices; Other Misconduct):**
  2601, 2610.
- **Ins. Law art. 34 (Property/Casualty Insurance Contracts):** 3411
  (automobile physical damage insurance: standard provisions, required
  inspections, duties of insurer, salvage). Revised 2023-11-26.
- **11 NYCRR Part 216 (Regulation 64):** 216.0 (preamble), 216.1, 216.2,
  216.3, 216.4, 216.5, 216.6, 216.7, 216.8, 216.9, 216.10, 216.11, 216.12.
  216.13 (mediation) is REPEALED on the mirror and is not captured; the
  manifest's absence of it is deliberate, and a test asserts no repealed
  section leaks in.
- **DFS guidance (6):** OGC Opinion 01-10-05 (settlements of total loss
  motor vehicle damage claims), OGC Opinion 02-12-20 (fair claim
  settlement), OGC Opinion 04-06-03 (section 2610 — certified autobody
  repair shops), OGC Opinion 06-06-09 (interpretation of Regulation 64),
  Circular Letter 11 (1991) (scope of Regulation 64), Circular Letter 16
  (2000) (application of 2610(b) — WITHDRAWN effective December 4, 2003).
  Circular Letter 13 (2011) was checked and dropped: flood program only.

### 2.2 repair_law — Veh. & Traf. Law; 15 NYCRR 82; Gen. Bus. Law; Lien Law (34)

- **Veh. & Traf. Law art. 12-A (Motor Vehicle Repair Shop Registration
  Act):** 398, 398-a, 398-b, 398-c, 398-d, 398-e, 398-f, 398-g, 398-h — the
  whole article (nine sections; no 398-i exists).
- **15 NYCRR Part 82 (Motor Vehicle Repair Shops):** 82.1 through 82.19 —
  the whole part as the DMV booklet prints it (19 sections, incl. 82.13
  quality repairs / repair shop standards / subcontractors, 82.18 insurers
  and repair shops, 82.19 consumers and repair shops). The booklet's front
  matter (contents, regional offices, phone directory) and appendices (the
  VS-47A sign, the appraisal sign) are NOT sections and are discarded.
- **Gen. Bus. Law art. 22-A:** 349 (unfair, deceptive, or abusive acts and
  practices — revised 2026-04-03), 350 (false advertising).
- **Lien Law:** 184 (lien of bailee of motor vehicles), 200 (sale of
  personal property to satisfy a lien), 201 (notice of sale), 202 (sale to
  be advertised).

### 2.3 employment — Lab. Law; 12 NYCRR 142; Workers' Comp. Law (39)

- **Lab. Law art. 5 (Hours of Labor):** 160 (hours to constitute a day's
  work), 161 (one day rest in seven), 162 (time allowed for meals).
- **Lab. Law art. 6 (Payment of Wages):** 190, 191, 193, 195, 198, 198-c.
- **Lab. Law art. 19 (Minimum Wage Act):** 652, 663.
- **12 NYCRR Part 142 (Minimum Wage Order for Miscellaneous Industries and
  Occupations):** 142-1.1 and 142-2.1 through 142-2.23 (24 sections).
  Subpart 142-3 (nonprofitmaking institutions) is out of scope.
- **Workers' Comp. Law:** 2, 10, 50, 52.

### 2.4 Honest caveats and absences (tool-description and annotation content)

- **No private right of action under Ins. Law 2601.** Rocanova v. Equitable
  Life (1994) settled it; the remedy is a DFS complaint, and 216.11
  (examinations) is how DFS enforces. Bad-faith exposure in New York is a
  contract-law question for counsel. Say so — this is the opposite of
  Florida's 624.155.
- **2610(b)'s reach is narrower than its text reads.** The Second Circuit
  in Allstate v. Serio (2001) held the Department could not bar insurers
  from recommending shops as the 2000 circular letter read the statute;
  the letter was withdrawn. The corpus carries the statute, the withdrawn
  letter marked withdrawn, and the 2004 OGC opinion on certified-shop
  programs; the tool description says the (b) recommendation clause has
  been narrowed by litigation and points to counsel.
- **No standalone aftermarket crash parts statute.** The parts provisions
  live in 216.7; there is no Florida-style ch. 501 pt. I. Stated.
- **No statutory total-loss percentage.** Total-loss valuation is 216.7(c)'s
  method; there is no Florida 80 percent test. Stated.
- **No labor rate survey rule.** 216.7 governs negotiation; nothing like
  California's 2695.81 exists. Stated.
- **No state OSHA plan for private employers.** PESH covers public
  employers only; federal OSHA governs the spray booth. The safety domain
  is absent, as in MT, CO, TX, and FL.
- **Statutes carry a REVISION date, not a session-law effective date.**
  The Senate site states "Viewing most recent revision (from YYYY-MM-DD)"
  per section; that is the date of the current text and it is what the
  citation carries ("N.Y. Ins. Law 2610, revised 6/23/2017"). New York
  prints no statewide "current through" line on any surface examined;
  meta carries the capture date, as California does.
- **Part 82 carries the DMV booklet edition, not per-section dates.** The
  booklet prints "CR-82 (5/26)" and no history; citations read "15 NYCRR
  82.5, CR-82 (5/26)" and the edition is pinned so a reissued booklet
  fails loudly at re-capture. Part 142 prints "As amended Effective June
  24, 2020" once for the whole order, and every 142 section carries it.

## 3. Capture surfaces — verified on the wire 2026-09-10, and the traps

### 3.1 Statutes — www.nysenate.gov (official, plain HTML, behind Cloudflare)

- One page per section: `https://www.nysenate.gov/legislation/laws/{LAW}/{SECTION}`
  with the law id in the Senate's own abbreviations (ISC, VAT, GBS, LIE,
  LAB, WKC — note GBS not GBL) and the section as printed (`398-D`,
  `198-C`, upper case). Fully server-rendered Drupal; UTF-8.
- Markup: `h2.nys-openleg-result-title-headline` ("SECTION 2610"),
  `h3.nys-openleg-result-title-short` (the catchline — New York prints
  catchlines, so headings are source text like Florida),
  `h4.nys-openleg-result-title-location` ("Insurance (ISC) CHAPTER 28,
  ARTICLE 26" — the chapter value is read from here), and the text in one
  `div.nys-openleg-result-text` with `<br />` line breaks and HTML
  entities. The body opens with "§ 2610. <catchline>." which the parser
  strips only after cross-checking it against the headline.
- **Revision date:** `div.nys-openleg-history-published` — "Viewing most
  recent revision (from 2017-06-23)". Read as `effectiveDate`. The
  history `<select>` lists prior revision dates; not used.
- **Absence is HTTP 200** with "The requested entry could not be found."
  and no result-text div. Detected by the missing wrapper.
- **Cloudflare sits in front of the site.** One 403 (a "Just a moment"
  challenge page) appeared during probing after four quick requests and
  cleared within 15 seconds; 33 sequential fetches at a 2 s pause then
  passed clean. The capture uses the io-wide pause, retries a 403 once
  after a 30 s backoff, and fails the run loudly on a second — a partial
  corpus is never written.
- robots.txt disallows only Drupal internals and `/search`; `/legislation/`
  is allowed; no crawl delay.
- Article listing pages exist (`/legislation/laws/VAT/A12-A`) but the
  manifest names every cite explicitly, so they are not a capture surface.
- The legacy `public.leg.state.ny.us` host no longer resolves; the
  Assembly's site is a bill tracker, not a statute host.

### 3.2 Part 82 — dmv.ny.gov/forms/cr82.pdf (official, one PDF, 23 pages)

- `https://dmv.ny.gov/forms/cr82.pdf` — 446 KB, `application/pdf`, 23
  pages, 53.5 K characters through `unpdf`. Fetched via
  `io.fetchBinary` (the CO hook).
- The booklet: cover ("CR-82 (5/26) MOTOR VEHICLE REPAIR SHOP
  REGULATIONS"), contents, regional offices, then "PART 82 REGULATIONS OF
  THE COMMISSIONER OF MOTOR VEHICLES", sections headed
  `Section 82.1 Introduction.` and thereafter `82.2 Definitions.` … `82.19
  Consumers and repair shops.`, then appendices (signs). The parser
  locates the contents table, discards everything through it, splits on
  the `^82\.\d+ <Title>\.$` heads (the CO whole-title split), and stops at
  "APPENDIX". The edition is read from the cover's `CR-82 (M/YY)` token and
  pinned (`NY_CR82_EDITION`).
- Extraction-fidelity tripwire: a section parsing to near-nothing against
  a populated prior version aborts the capture (the CO bulletin rule).

### 3.3 Part 142 — forms.labor.ny.gov/WP/CR142.pdf (official, one PDF, 36 pages)

- `https://forms.labor.ny.gov/WP/CR142.pdf` — 184 KB, 36 pages, 75.8 K
  characters. (The `dol.ny.gov/system/files/…/cr142-.pdf` copy answers
  403 to a non-browser fetch; the forms host is the capture URL.)
- Cover states the currency: "As amended Effective June 24, 2020" and the
  print code "CR 142 (12/25)". The parser reads the effective date from
  the cover and stamps every section with it; the print code is recorded
  in meta for drift visibility but is NOT pinned (a reprint with the same
  amendment date is not drift).
- Sections are headed `§ 142-2.4 Additional rate for split shift and
  spread of hours.`; the subpart contents lists repeat the heads without
  the section sign, which is how the parser tells contents from body.
  Only subparts 142-1 and 142-2 are kept.

### 3.4 Regulation 64 — LII mirror (provenance stated everywhere)

- `https://www.law.cornell.edu/regulations/new-york/11-NYCRR-216.7`; the
  part index at `/regulations/new-york/title-11/chapter-IX/part-216` lists
  216.0 through 216.13 and is the capture-time cross-check that the
  manifest is complete (216.13 shows "(Repealed)" in its title).
- Same page family as California's CCR mirror: `h1#page_title` reads
  "N.Y. Comp. Codes R. & Regs. Tit. 11 § 216.7 - <title>" (title AND cite
  cross-checked), the active tab `tab_default_1` holds the regulation,
  the "Compare" tab holds an older copy (cut, as in CA), text in
  `statereg-text` blocks, Register history in a note block: "Amended New
  York State Register February 1, 2017/Volume XXXIX, Issue 05, eff.
  2/1/2017 Amended … June 9, 2021/Volume XLIII, Issue 23, eff. 6/9/2021".
  The newest `eff.` date is the section's effectiveDate; "No prior version
  found" (15 NYCRR 82.5 shows it) means no date, and the citation omits it.
- **Absence is HTTP 200** with a generic "New York Codes, Rules, and
  Regulations" h1 (`id="page-title"`, not `page_title`) and no
  `tab_default_1`. Detected by the missing wrapper.
- robots.txt: `Crawl-delay: 10`, nothing disallowing `/regulations/`.
  Enforced through `FetchOpts.minDelayMs`. 14 fetches ≈ 2.5 minutes.
- Part 82 is NOT taken from LII even though LII carries it: the DMV
  booklet is official and verbatim. LII's 82.x pages are the by-hand
  cross-check.

### 3.5 DFS guidance — dfs.ny.gov (official, plain HTML)

- Six pinned URLs (OGC opinions at `/insurance/ogco{yyyy}/rg{id}.htm`,
  circular letters at `/industry_guidance/circular_letters/cl{yyyy}_{n}`).
  Drupal, server-rendered, `div.body-area` / `div.body-area-in` around the
  content. The `<title>` states the document number and subject ("OGC
  Opinion No. 04-06-03: Section 2610 - Certified Autobody Repair Shops");
  the parser cross-checks the number in the title against the manifest.
- The issue date is in the body's dateline (opinions open with the date;
  circular letters print "May 10, 2000" under the number). The parser
  reads it and hard-fails if absent. A page whose body opens with
  "WITHDRAWN EFFECTIVE <date>" sets `dfsStatus: "withdrawn"` with the
  date; the manifest states the expected status so a silent withdrawal
  of a live letter (or a resurrection) is drift.
- robots.txt disallows only Drupal internals; no crawl delay. Six fetches
  at the io-wide pause.

### 3.6 What was checked and not used

- `govt.westlaw.com/nycrr` — Cloudflare challenge on `/robots.txt` itself
  (HTTP 403, "Just a moment…"). Not a capture surface.
- DFS regulation index (`/industry_guidance/regulations/ins_regs_by_part_number`)
  and the P&C laws page — link to Westlaw for text; no text hosted.
- The Open Legislation API — 401 without a key; declined for v1 (§ preface).
- Circular Letter 13 (2011) — National Flood Insurance Program only.
- Justia's NYCRR copy — a second mirror, answers 403 to a bot; not needed.

## 4. Identity and citations

- Ten codes: `N.Y. Ins. Law`, `N.Y. Veh. & Traf. Law`, `N.Y. Gen. Bus.
  Law`, `N.Y. Lien Law`, `N.Y. Lab. Law`, `N.Y. Workers' Comp. Law`,
  `11 NYCRR`, `15 NYCRR`, `12 NYCRR`, `DFS Guidance`. Display cites
  "N.Y. Ins. Law 2610", "11 NYCRR 216.7", "15 NYCRR 82.5", "12 NYCRR
  142-2.4", "DFS Guidance OGC Opinion 04-06-03", "DFS Guidance Circular
  Letter 16 (2000)".
- Statute section numbers repeat across codes (2 exists in Workers' Comp.
  Law and could in any code; 160–162 exist in Labor Law and elsewhere),
  so a bare number is NOT unique. `NY_CITE_CODES` is built from the
  manifests; a bare number claimed by exactly one code resolves to it; a
  number claimed by two resolves to a listing of both rather than a
  guess (the CA collision guard, relaxed from throw to listing because
  New York's collisions are real, not hypothetical). Regulation cites
  (`216.7`, `82.5`, `142-2.4`) are unique by shape and resolve by exact
  match. Code-worded forms ("Ins. Law § 2610", "Insurance Law 2610",
  "ISC 2610", "VTL 398-d", "Labor Law 191", "GBL 349", "Lien Law 184",
  "WCL 2"), NYCRR forms ("11 NYCRR 216.7", "11 N.Y.C.R.R. § 216.7", "Reg
  64 § 216.7"), guidance forms ("OGC 04-06-03", "Circular Letter 16
  (2000)"), id forms, and named aliases ("Regulation 64" / "Reg 64" → the
  Part 216 listing, "Repair Shop Registration Act" / "Article 12-A" → VAT
  398 listing, "Repair Shop Regulations" → Part 82 listing, "Minimum Wage
  Order" → Part 142 listing) all resolve.
- `chapter` values: statutes carry the article as the Senate prints it
  ("art. 26", "art. 12-A", "art. 22-A", "art. 6", "art. 19"), and Lien Law
  and Workers' Comp. Law carry whatever article the location line prints (not
  assumed here; read at capture). Regulations carry the part ("Part 216",
  "Part 82", "Part 142, subpart 2"). Guidance carries "OGC opinions" or
  "Circular letters".
- Citations: statutes "N.Y. Ins. Law 2610, revised 6/23/2017" (the
  Senate's revision date); 11 NYCRR "11 NYCRR 216.7, effective 6/9/2021"
  (newest Register `eff.`), or no date when the mirror has no history;
  15 NYCRR "15 NYCRR 82.5, CR-82 (5/26)" (the pinned booklet edition);
  12 NYCRR "12 NYCRR 142-2.4, effective 6/24/2020"; guidance "DFS
  Guidance OGC Opinion 04-06-03, issued 6/8/2004" and "DFS Guidance
  Circular Letter 16 (2000), issued 5/10/2000, withdrawn 12/4/2003".
- `NY_CR82_EDITION` is pinned by a test against corpus meta so a
  reissued booklet fails at re-capture and a human reads what changed.

## 5. Package/app shape, tools, tests, deploy

`packages/state-ny` (schema with `captureSource` per section and
`dfsStatus` on guidance, three domains, ten codes; taxonomy; five
manifests — statutes, part82, part142, reg64, dfs; four parsers —
`parse-senate.ts`, `parse-pdf-part.ts` (shared by 82 and 142, the head
regex is a parameter), `parse-lii-nycrr.ts`, `parse-dfs.ts`; `pdf-text.ts`
behind a dynamic `import()` exactly as CO; five capture pipelines and the
profile; identity; four `ny_*` tools + the connector pair),
`apps/state-ny-server` (same worker.ts shape; `/health` adds
`captureSources` counts {senate, dmv, dol, lii, dfs}, `cr82Edition`, and
the three-domain breakdown), registry entry `ny`, `NY-LAW-ATTENTION.txt`.

Reuse over copy: the LII parser generalizes CA's `parse-ccr-lii.ts` (h1
prefix and URL shape become parameters) — if the generalization is
byte-clean against CA's fixtures it moves into `packages/state-law`;
otherwise NY carries its own copy and the extraction is noted as a
candidate. The PDF section-splitter borrows CO's whole-title approach but
is written fresh over `unpdf` text (CO splits HTML, not PDF text).

Demo gauntlet (shop phrasing; the annotation vocabulary is the bridge):

1. "my painter says he has to be paid every week, is that true" → Lab. Law
   191 first, 198 top 3
2. "adjuster is telling the customer to take it to their shop" → Ins. Law
   2610 first; OGC 04-06-03 top 3; the withdrawn letter NOT top 3
3. "insurer hasn't come out to look at the car in two weeks" → 216.7
   first (six business days)
4. "aftermarket parts on a two-year-old car" → 216.7 first
5. "total loss lowball" → 216.7 top 2; "they want to keep the car for
   salvage" → 3411 / 216.7 top 3
6. "claim acknowledged? nothing in three weeks" → 216.4 / 216.5 top 3
7. "third-party claimant, not our insured, carrier slow-walking" →
   216.10 first
8. "can I sue the insurer for bad faith" → 2601 first, with the
   no-private-action note in the payload
9. "do I need a written estimate / authorization before I start" → 82.5
   first, 398-d top 3
10. "customer won't pay, can I keep the car" → Lien Law 184 first; "sell
    it" → 200 / 201 top 3
11. "registration" → 398-c / 82.3 top 3
12. "lunch breaks for techs" → Lab. Law 162 first; "six days a week" →
    161 first
13. "charging a tech for a comeback" → Lab. Law 193 first; 142-2.10 top 3
14. "call-in pay / spread of hours" → 142-2.3 / 142-2.4 first
15. "1099 tech and comp" → WKC 2 / 10 top 3; "no comp policy" → 52 first
16. exact cite short-circuit; "Regulation 64" and "Article 12-A" listings;
    the shipped manifest has no bare-number collisions, so a bare "2"
    resolves to Workers' Comp. Law 2; the two-claimant rule (resolve to
    null, word the code) is a guard for a future manifest and is tested
    conditionally — structural

Deploy: `ny.repairmcp.com` custom domain, `workers_dev: false`,
burst-test the zone WAF rule on the new hostname (and re-check the
Backlog's open finding that it stopped firing at the FL launch).

## 6. Risks

- **Cloudflare on nysenate.gov.** The one transient 403 during probing is
  the signal. The capture is 33 fetches at 2 s with a single 30 s retry;
  a persistent block fails the run and the drift checker writes the
  attention file rather than reporting stale text as current.
- **LII lag on a fresh Reg 64 amendment.** Same residual as CA: the
  per-section Register history is the visible signal, and a dispute over
  a freshly amended rule is checked against Westlaw by hand.
- **Booklet reissues.** DMV reissues CR-82 without renumbering; the
  edition pin catches it and the human reads the diff. DOL's CR 142 print
  code moves without an amendment; only the amendment date is pinned.
- **PDF text order.** `unpdf` returns page text in reading order for both
  booklets (verified: every section head found once, in order). A future
  reformat that breaks the order fails the section-count cross-check
  against the contents table.
- **Length bias.** 3411, 216.7, 82.5, and 142-2.x are long; the demo suite
  pins the headliners and the annotation layer carries the routing. Same
  cross-state scorer candidate noted under CO, CA, and FL.
