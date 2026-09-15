# Kickoff spec: Ohio state vertical (state #9)

> **Status 2026-09-14 (evening): SHIPPED** — `https://oh.repairmcp.com/mcp`
> (deployment `04d76e91-76d4-433c-908b-28efbf01b369`, deployed
> 2026-09-15T01:26:34Z UTC, the evening of 2026-09-14 Pacific) live and
> verified on the wire; see the OH row in CLAUDE.md's build status. `/health`
> reports 51 sections, capturedAt 2026-09-15, currentThrough 2026-09-15,
> newestEffectiveDate 2026-03-21, captureSources chapter 33 / section 18,
> domains insurance 9 / repair_law 16 / employment 17 / safety 9, statusNotes
> the two 4513.60/4513.61 veto lines. Wire probes: "insurer wrote it for 20
> hours and I can't repair it for that" → `OAC 3901-1-54, effective
> 2/14/2022` first with the "name of at least one repair shop" excerpt;
> `oh_get_authority` on "ORC 4513.60" → `ORC 4513.60, effective 11/25/2025`
> with the verbatim "upon complaint of a repair garage or place of storage"
> text and the statusNote in the payload; the connector `search` on "tech
> quit friday when do I have to pay him" → `orc:4113.15` first. The real
> capture corrected five things the plan below got wrong: (1) ORC 3901.93 on
> the chapter-3901 page prints no catchline — unrequested catchline-less
> heads now parse as an empty heading, and a NAMED cite with no catchline
> hard-fails by name; (2) OAC 4123:1-5-03 and 4123:1-5-99 on the wanted
> chapter page are PDF-filed — unrequested PDF-filed rules are skipped with a
> capture warning instead of failing the page, a named one still hard-fails;
> (3) OAC 3745-31-30 prints a Prior Effective Date "6/7/2010 (Emer.)" — the
> annotation is stripped before the date parses; (4) the OAC chapter page's
> Supplemental Information lags the rule's own page (3901-1-54's chapter
> view stated only 2 of its 4 real prior effective dates), so every
> Administrative Code rule is captured from its own rule page rather than a
> chapter page — the fetch plan is 7 ORC chapter pages + 5 ORC section pages
> + 1 Constitution page + 12 OAC rule pages = 25 requests (~4 minutes),
> captureSource chapter 33 / section 18, not the plan's originally stated 18
> requests and 43/8; (5) the shared get-authority payload emitted a fixed
> field list, so `packages/state-law/src/tools.ts` gained an optional
> `statusNote` spread (commit 140f15a, additive-only test) — the plan's
> stated exception, and it was needed. The zone WAF rate limit FIRED on
> oh.repairmcp.com — a 30 parallel-request burst returned 22×200 then 8×429,
> matching pa.'s behavior; fl., ca., deg., and ny. still return 0/30 under
> the same test (CLAUDE.md Backlog, first entry).

Written 2026-09-14. Pattern follows WA → MT → CO → TX → CA → FL → NY → PA:
a state package on `@repairmcp/state-law`, a Worker at `oh.repairmcp.com`,
registration in `scripts/state-registry.ts` so the 4-week drift checker
covers Ohio automatically. Every capture surface below was verified **on the
wire this day** before a line of code was written: every chapter page the
manifest names was fetched and its section list read back, every singleton
section page was fetched, and the effective date, Latest Legislation marker,
and text length of all 51 manifest sections were tabulated from the saved
pages (not from memory or from the research summaries).

Ohio is #4 of Tier 1 (FL, NY, PA, **OH**, IL, MI, NC), per the project
owner's "Remaining states ordering" decision recorded in
`docs/PA-VERTICAL-KICKOFF.md`. Illinois follows.

Two decisions in this build are the project owner's, made 2026-09-14 after
the surfaces were probed, and are recorded here because they are policy,
not code:

1. **Everything comes from the official publisher despite its robots.txt.**
   The Legislative Service Commission's `codes.ohio.gov` serves the Ohio
   Revised Code, the Ohio Administrative Code, and the Ohio Constitution as
   clean server-rendered HTML with a per-section effective date on every
   page. Its `robots.txt` is `User-agent: * / Disallow: /` — no crawl-delay,
   no exceptions, no bot challenge (the site answered every probe promptly
   with full pages under the project's own `RepairMCP-Bot/1.0` user agent).
   Same shape as leginfo (CA) and the Pennsylvania Code (PA). Decision:
   capture from the official site at a **10-second per-fetch floor**
   (`FetchOpts.minDelayMs`), by whole-chapter page wherever the manifest
   names two or more sections in a chapter so the whole capture is 18
   requests, and record that choice on /legal and in the corpus source
   note. Cornell LII mirrors the OAC but NOT the Revised Code, so a mirror
   route would have left the statutes uncaptured anyway. Do not lower the
   pace or route to the mirror without asking.
2. **Ohio gets a fourth domain, safety, and it is thin on purpose.** Federal
   OSHA governs private shops (ORC Chapter 4167, the Public Employment Risk
   Reduction Program, reaches public employers only). On top of that Ohio
   has two state layers no shipped state has: the Bureau of Workers'
   Compensation's "specific safety requirements" for workshops and
   factories (OAC 4123:1-5), whose violation gives an injured worker an
   additional award under ORC 4121.47 and Ohio Const. art. II § 35 (the
   VSSR award), and two Ohio EPA rules that name auto body refinishing.
   The Ohio Fire Code (OAC 1301:7-7-24, flammable finishes) is NOT
   captured: its "rule text" is a two-page PDF of Ohio's amendments to the
   copyrighted International Fire Code, not self-contained law; it is
   stated as an honest absence. Decision: four domains, nine safety
   sections.

---

## 1. Success criteria

Same bar as PA (kickoff §1): an Ohio shop asks a claims or shop question in
shop language and gets verbatim Ohio law with a paste-ready citation. The
Ohio headliners, in demo order:

1. **"I can't repair it for the insurer's number"** → OAC 3901-1-54(H)(1):
   when a partial loss is settled on the insurer's written estimate, the
   insurer supplies the claimant a copy, and "if the claimant subsequently
   claims that necessary repairs will exceed the written estimate, the
   insurer shall pay the difference between the written estimate and a
   higher estimate obtained by the claimant or promptly provide the
   claimant with the name of at least one repair shop that will make the
   repairs for the amount of the written estimate. If the insurer provides
   the name of only one repair shop, it shall ensure that the repairs are
   performed in a workmanlike manner." No other shipped state puts the
   pay-the-difference-or-name-a-shop duty in a rule this plainly.
2. **Steering** → 3901-1-54(H)(8): "An insurer shall not require a claimant
   to travel an unreasonable distance to inspect a replacement automobile,
   to obtain a repair estimate, or to have the automobile repaired at a
   specific repair shop." (H)(5): an insurer that elects to repair and
   designates a shop "shall cause the damaged automobile to be restored to
   its condition prior to the loss." Stated honestly: Ohio has **no
   statutory steering ban** — the Revised Code's unfair-practices catalog
   (3901.21) says nothing about repair shops, and the closest statute is
   the rule's own (H)(1).
3. **Storage** → 3901-1-54(H)(9): "An insurer shall provide notice to a
   claimant prior to termination of payment for automobile storage
   charges." **Betterment** → (H)(2) and (H)(3): itemized on the estimate,
   only for a measurable decrease in market value, capped at the
   replacement cost of the parts.
4. **Total loss** → 3901-1-54(H)(6) and (H)(7): the replacement-vehicle
   method (same manufacturer, same or newer year, similar body style,
   options and mileage) and the cash-settlement method (average of two or
   more comparables in the local market within 90 days, then proximate
   markets, then dealer quotations, then a recognized database or
   guidebook, used consistently), sales-tax reimbursement within 30 days
   of purchase with written notice of that right, the 35-day right to
   renegotiate. Then ORC 4505.11(C): when an insurer "declares it
   economically impractical to repair" and pays, it applies for the
   salvage title within thirty business days. Stated honestly: **no
   statutory total-loss percentage** — the trigger is the insurer's own
   determination.
5. **Claim deadlines** → 3901-1-54(F)(2): acknowledge within fifteen days;
   (G)(1): accept or deny within twenty-one days of proof of loss, then
   written status every forty-five days; (G)(2): a denial must cite the
   policy provision; (G)(6): tender payment within ten days of accepting
   an undisputed claim; 3901-1-07(C), the general
   companion the rule itself says applies concurrently ((J)): denial must
   cite the provision, no compelling suit by lowballing, twenty-one days
   to reply to Department inquiries. The statute behind both: ORC 3901.20
   (the prohibition) and 3901.21 (the catalog, whose only claims item is
   (P), no pattern settlements) — with **no private right of action**
   (3901.22 is administrative; Zoppo v. Homestead Ins. Co., 71 Ohio St.3d
   552 (1994), and Hoskins v. Aetna Life Ins. Co., 6 Ohio St.3d 272
   (1983), make bad faith a common-law tort). Say so.
6. **Aftermarket crash parts** → ORC 1345.81: every written estimate using
   non-OEM aftermarket crash parts must identify each part and carry the
   ten-point-type notice ("This estimate has been prepared based upon the
   use of one or more aftermarket crash parts supplied by a source other
   than the manufacturer of your motor vehicle. Warranties applicable to
   these aftermarket crash parts are provided by the parts manufacturer or
   distributor rather than by your own motor vehicle manufacturer."), the
   customer signs, the part carries the maker's mark — and a violation is a
   CSPA unfair practice. 3901-1-54(H)(4) binds the insurer's estimate to
   it and requires the licensed salvage dealer's location for like kind
   and quality parts.
7. **The shop's own obligations** → OAC 109:4-3-13, the Attorney General's
   motor vehicle repair rule, **amended effective March 21, 2026**: the
   estimate-choice form on face-to-face contact when the job exceeds fifty
   dollars ((A)(1)), the posted notice ((A)(2)), the after-hours duplicate
   form ((B)(1)), authorization before additional work of ten per cent or
   more of the estimate ((C)(2)), no charge for unauthorized work ((C)(5)),
   disassembly-charge disclosure ((C)(4)), towing-basis disclosure
   ((C)(7)), the itemized invoice with new/used/remanufactured and the
   identity of the individual performing the repair ((C)(12)), tender of
   replaced parts ((C)(13)), the written receipt on request ((C)(14)),
   subcontracting disclosure ((C)(16)). The private remedy behind it:
   ORC 1345.09 (treble damages or $200, up to $5,000 noneconomic, fees).
8. **Holding and disposing of the car** → ORC 4505.101(A): a repair garage
   holding a vehicle worth **less than $3,500**, unclaimed fifteen days
   after the repair or agreed storage, sends certified notice to owner and
   lienholders, and after fifteen more days takes title free and clear.
   For anything worth more: ORC 4513.60(A)(1), "The sheriff or chief, upon
   complaint of a repair garage or place of storage, may order into storage
   any motor vehicle … that has been left at the garage or place of storage
   for a longer period than that agreed upon," then 4513.62 disposal.
   Stated honestly: Ohio's bailee's lien, ORC 1333.41, says in its own
   division (E) that it "does not apply to a bailee for hire who performs
   any service or provides any materials with respect to motor vehicles" —
   **no statutory garage keeper's lien**; the possessory lien is common law
   and a question for counsel.
9. **Wage rules with teeth** → ORC 4113.15 (wages for the first half of the
   month by the first, second half by the fifteenth; thirty days late with
   no dispute → liquidated damages of six per cent or $200, whichever is
   greater), 4113.19 (no deduction for "wares, tools, or machinery
   destroyed or damaged" without an express contract — the comeback-
   chargeback answer), 4111.03 (time and a half over forty, FLSA exemptions
   by reference, the (D) definitions), 4111.031 (the 2022 travel-time and
   preliminary-activity exemption), 4111.10 (unpaid overtime plus costs and
   fees), 4111.14 (three years of records, the constitutional complaint
   and two-times-back-wages remedy, $150 a day for retaliation), Ohio
   Const. art. II § 34a (the indexed minimum wage, adjusted every January),
   4111.02 (the statute pointing at it), 4111.01 and 4111.08. Stated
   honestly: **no adult break law** — 4109.07(C)'s thirty-minute rest
   after five hours is for minors.
10. **1099 techs** → ORC 4123.35 (every private employer pays into the
    state fund or self-insures), 4123.74 (the complying employer's
    immunity), 4123.75 (the injured worker of a noncomplying employer is
    paid from the surplus fund and the employer is pursued), 4123.77 (the
    noncomplying employer loses the fellow-servant, assumption-of-risk,
    and contributory-negligence defenses), 4123.01 (the "employee"
    definition, with the twenty-factor test that the statute scopes to
    construction contracts — say so), 4123.90 (no retaliation for a claim).
11. **Safety, Ohio-only** → ORC 4121.47: "No employer shall violate a
    specific safety rule adopted by the administrator of workers'
    compensation," with the additional award and the penalty for a second
    violation within twenty-four months; OAC 4123:1-5-12 (grinding,
    polishing, wire buffing), 4123:1-5-13 (vehicles supported by jacks or
    hoists "substantially blocked or cribbed"), 4123:1-5-16 (cutting and
    welding, cylinder storage), 4123:1-5-17 (PPE, incl. eye protection
    "for all spray paint operations" and respirators), 4123:1-5-18
    (control of air contaminants), 4123:1-5-01 (scope); Ohio EPA
    3745-31-30(C)(2)(f), the auto body refinishing permit-by-rule (two or
    fewer booths, fifty jobs a week, three thousand gallons a year,
    enclosed booth with filtration, HVLP or equivalent), and 3745-21-18,
    the motor vehicle refinishing VOC rule that applies **only in sixteen
    named counties** (Cincinnati/Dayton and Cleveland/Akron). Both limits
    are stated in the tool description.

## 2. Corpus manifest (51 sections, four domains, three codes)

### 2.1 insurance — ORC 3901, 1345.81, 4505.11, 1343.03; OAC 3901-1 (9)

- **ORC 3901.19** (definitions, eff. 9/1/2002), **3901.20** (the
  prohibition, eff. 1/5/1988), **3901.21** (the catalog, eff. 10/24/2024,
  20.7 KB and mostly rating and underwriting; kept because it is the
  statute the rules amplify and (P) is the one claims item),
  **3901.22** (hearings, orders, penalties, the AG's class action on
  behalf of policyholders, eff. 9/1/2002).
- **ORC 1345.81** (aftermarket crash parts, eff. 9/13/2022) — cross-listed
  in repair_law by topic, one record.
- **ORC 4505.11** (salvage title on an insurer's total loss, eff.
  6/30/2021, 15.8 KB).
- **ORC 1343.03** (statutory interest when no rate is stipulated, eff.
  9/8/2016; the general rate via 5703.47 — not a claims prompt-pay
  statute, and the description says so).
- **OAC 3901-1-54** (eff. 2/14/2022, prior 9/1/1993, 11/12/2004, 4/5/2007,
  11/3/2016; Five Year Review 2/27/2027), **3901-1-07** (eff. 2/14/2022).

### 2.2 repair_law — ORC 1345, OAC 109:4-3, ORC 4505.101/.104, 4513, 1333.41, 4738.01 (16)

- **ORC 1345.01** (definitions, eff. 10/3/2023), **1345.02** (unfair or
  deceptive acts, eff. 10/24/2024), **1345.03** (unconscionable acts, eff.
  4/6/2017), **1345.09** (private causes of action, eff. 7/3/2012),
  **1345.13** (remedies cumulative, eff. 7/14/1972).
- **OAC 109:4-3-01** (construction, purpose, definitions, eff. 1/7/2007),
  **109:4-3-13** (motor vehicle repairs or services, eff. 3/21/2026, prior
  9/11/1978, 3/14/2005, 8/10/2015).
- **ORC 4505.101** (title to an unclaimed vehicle at a repair garage, eff.
  4/7/2023), **4505.104** (the towing/storage-facility title route for
  vehicles ordered into storage, eff. 10/24/2024).
- **ORC 4513.60** (vehicle left on private property; the repair-garage
  complaint, eff. 11/25/2025), **4513.601** (private tow-away zones, eff.
  4/7/2023, 14.6 KB), **4513.61** (police storage, eff. 11/25/2025),
  **4513.62** (disposal of unclaimed vehicles ordered into storage, eff.
  10/24/2024), **4513.63** (abandoned junk vehicles, eff. 10/24/2024).
  4513.60 and 4513.61 carry the site's bracketed "[Governor's veto not
  reflected; see H.B. 434 status report]" catchline note — see §3.
- **ORC 1333.41** (the bailee's lien that excludes motor vehicles, eff.
  7/22/1994) — captured precisely so the absence is stated in the law's
  own words.
- **ORC 4738.01** (salvage dealer definitions, eff. 3/23/2015) — the
  evidence that a repair shop is not a licensed salvage dealer and that
  Ohio has no body-shop licensing statute.

### 2.3 employment — Ohio Const. II § 34a; ORC 4111, 4113, 4109.07, 4123 (17)

- **Ohio Const. art. II § 34a** (Minimum Wage, eff. 12/8/2006).
- **ORC 4111.01** (eff. 4/4/2007), **4111.02** (eff. 3/21/2017),
  **4111.03** (overtime, eff. 7/6/2022), **4111.031** (exemptions, eff.
  7/6/2022), **4111.08** (records, eff. 1/1/2010), **4111.10** (liability,
  eff. 7/6/2022), **4111.14** (implementing § 34a, eff. 7/3/2019, 21.6 KB).
- **ORC 4113.15** (semimonthly payment, eff. 3/20/2019), **4113.19**
  (scrip and deductions, eff. 10/1/1953).
- **ORC 4109.07** (minors' hours and the thirty-minute rest, eff.
  10/3/2023).
- **ORC 4123.01** (definitions, eff. 9/23/2022, 19 KB), **4123.35**
  (premiums and self-insurance, eff. 3/24/2021, 41.9 KB — the longest
  section in the corpus), **4123.74** (immunity, eff. 10/20/1993),
  **4123.75** (remedy against a noncomplying employer, eff. 10/20/1993),
  **4123.77** (common-law defenses denied, eff. 3/20/2019), **4123.90**
  (retaliation, eff. 11/3/1989).

### 2.4 safety — ORC 4121.47; OAC 4123:1-5; OAC 3745 (9)

- **ORC 4121.47** (violating a specific safety rule, eff. 7/11/2001).
- **OAC 4123:1-5-01** (scope and definitions, eff. 6/30/2023, 33.9 KB),
  **4123:1-5-12** (abrasive grinding, polishing, buffing, eff. 6/30/2023),
  **4123:1-5-13** (motor vehicles and mobile equipment, eff. 6/30/2023),
  **4123:1-5-16** (cutting and welding, eff. 6/30/2023), **4123:1-5-17**
  (personal protective equipment, eff. 2/1/2024), **4123:1-5-18**
  (control of air contaminants, eff. 9/1/2023).
- **OAC 3745-31-30** (permits-by-rule, eff. 3/11/2023, **96.7 KB** — an
  omnibus rule whose (C)(2)(f) is the auto body refinishing
  permit-by-rule; captured whole because sections are the addressable
  unit, with the annotation's quote-safe excerpts scoped to (C)(2)(f)),
  **3745-21-18** (motor vehicle refinishing VOC limits, eff. 3/27/2022,
  sixteen counties).

### 2.5 Honest caveats and absences (tool-description and annotation content)

- No private right of action under ORC 3901.20/3901.21; 3901.22 is the
  Superintendent's remedy and the AG's. Bad faith is common law (Zoppo,
  Hoskins).
- No statutory steering ban. 3901-1-54(H)(1), (H)(5), (H)(8) are the
  rule-level protections; nothing bars an insurer from recommending a
  shop.
- No labor rate rule, no paint-and-materials rule, no prompt-pay interest
  statute for claims (1343.03 is the general rate).
- No statutory total-loss percentage. 4505.11 triggers on the insurer's
  "economically impractical to repair" determination; 3901-1-54(H)(7)
  governs the valuation.
- No statutory garage keeper's lien for motor vehicles (1333.41(E)); the
  routes are 4505.101 under $3,500 and a 4513.60 complaint above it.
- No body shop licensing (4738 licenses salvage dealers, 4517 dealers).
- No state OSHA plan for private employers (ORC 4167 is public-only);
  the BWC specific safety requirements are enforced through the VSSR
  award, not inspections; the Ohio Fire Code's spray-finishing text is
  IFC-by-reference and not captured; 3745-21-18 is county-limited.
- No adult meal or rest break statute (4109.07 is minors).
- No Ohio Department of Insurance bulletin on auto physical damage claims
  was found. The department's portal (`insurance.ohio.gov`) is a
  JavaScript shell that answers HTTP 404 to any non-browser user agent
  (verified: the same URL answers 200 to a browser UA and 404 to
  `RepairMCP-Bot/1.0` and to `curl`); the bulletin PDFs live on
  `dam.assets.ohio.gov`, which is open, but no auto-claims bulletin
  surfaced in any search. The corpus states one publisher.
- Ohio H.B. 636 (the "Auto Insurance Transparency Act," an OEM-parts
  option mandate) was introduced 12/23/2025 and was in committee at
  capture. Pending, not law; the description dates the statement.
- 4513.60 and 4513.61 print a "Governor's veto not reflected" note: the
  text shown is H.B. 434's as enacted by the General Assembly, and the
  site has not yet applied a veto. The corpus carries that note per
  section (`statusNote`) and every payload for those sections surfaces it.
- The 4123.01 twenty-factor employee test is scoped by the statute to
  construction contracts; for a 1099 tech it is persuasive, not binding.

## 3. Capture surface — codes.ohio.gov, verified on the wire 2026-09-14, and the traps

### 3.1 The three page shapes, one block parser

- **Section pages**: `https://codes.ohio.gov/ohio-revised-code/section-{N}`,
  `.../ohio-administrative-code/rule-{N}` (colons in rule numbers are
  literal in the path: `rule-109:4-3-13`, `rule-4123:1-5-17`),
  `.../ohio-constitution/section-2.34a`. Head is
  `<h1>Section 3901.21 <span class='codes-separator'>|</span> Catchline.</h1>`
  (rules: `Rule 3901-1-54 | …`; constitution: `Article II, Section 34a |
  Minimum Wage`).
- **Chapter pages**: `.../ohio-revised-code/chapter-{N}`,
  `.../ohio-administrative-code/chapter-{N}` (`chapter-109:4-3`,
  `chapter-4123:1-5`). A `table.laws-table` of `content-head` /
  `content-body` pairs; the head is
  `<span class="content-head-text"><a href="section-3901.21">Section
  3901.21 <span class='codes-separator'>|</span> Catchline.</a></span>`
  (ORC hrefs relative, OAC hrefs absolute `/ohio-administrative-code/
  rule-…`) and the body is the SAME block a section page carries. Verified
  byte-identical body text for 3901.21 on both pages (20,638 chars each).
  Chapter 3901 carries 150 sections in 667 KB; 4123 carries 158 in 705
  KB; 4123:1-5 carries 30 rules in 426 KB; 3901-1 carries 23 in 472 KB.
- **The block**, common to all three: `div.laws-section-info` with
  `label`/`value` pairs — `Effective:` (always), `Latest Legislation:`
  (ORC only, e.g. "Senate Bill 40 - 135th General Assembly"),
  `Promulgated Under:` (OAC only), `PDF:` (an authenticated PDF link,
  ignored); then the body, `<section class="laws-body">` on ORC and OAC
  pages and **`<div class="laws-body">` on the Constitution page** (the
  parser accepts both); then on OAC pages `section.laws-history`
  ("Supplemental Information": `Authorized By:`, `Amplifies:`, `Five Year
  Review Date:`, `Prior Effective Dates:`). The labels are exactly these
  strings — not "Statutory Authority", not "Rule Amplifies".
- **Body markup**: `<p>` paragraphs, OAC paragraphs carry
  `class='first-paragraph level-N'` for outline levels; cross-references
  are `<a class='section-link'>` / `<a class='rule-link'>` whose text is
  kept and tags dropped. The pages are UTF-8 with **zero numeric
  entities, zero curly quotes, zero C1 characters, zero section signs**
  across every saved page — the cleanest text of any state. `&quot;` and
  `&amp;` decode through the shared `decodeEntities`.

### 3.2 Traps, each with a test

- **`div.laws-notice` sits INSIDE `laws-body`** ("Last updated August 27,
  2024 at 4:01 PM" printed inside 4505.104's text on the chapter page).
  Cut before the text is read; a test asserts no "Last updated" line
  survives in any section.
- **Bracketed catchline prefixes.** Three shapes seen: `[Governor's veto
  not reflected; see H.B. 434 status report]` (4513.60, 4513.61, 4513.66),
  `[Repealed effective 10/06/2026 by H.B. 433, 136th General Assembly]`
  (1345.021), `[Former Section 3 of S.B. 166 … codified as R.C. 4123.345
  …]` (4123.345). The parser splits a leading `[…]` off the catchline into
  `statusNote`; a `[Repealed` note on a manifest cite hard-fails the
  capture; any other note is recorded and surfaced. The capture log
  prints every statusNote seen.
- **Absence is a 302 to `/ohio-revised-code/number-not-found/section-X`
  with HTTP 200**, an h1 "Number Not Found", and no `laws-body`. Detected
  by the final URL AND the missing body (belt and braces); a manifest cite
  missing from a chapter page hard-fails.
- **No currency statement anywhere.** The ORC landing page says only that
  "The Legislative Service Commission staff updates the Revised Code on an
  ongoing basis." Per-section `Effective` plus `Latest Legislation` is the
  currency; there is no pin, the CA/PA pattern. Meta records `capturedAt`
  and the newest `effectiveDate` in the corpus.
- **Repealed sections are not otherwise distinguishable** without the
  bracket. An empty body on a manifest cite hard-fails (the PA rule).
- **Some OAC chapters are PDF-only** (the Fire Code, 1301:7-7: "This rule
  was filed with the Legislative Service Commission in PDF format and is
  presented here as filed"). Nothing in the manifest is, and the parser
  hard-fails on that sentence rather than shipping an empty body.
- **Dates are one shape**, "Month D, YYYY", through `fmtDateUtc`. The
  simplest date rule of any state; the Prior Effective Dates line is
  `M/D/YYYY` comma-separated and is recorded as `priorEffectiveDates`
  (ISO), not used for the citation.

### 3.3 The fetch plan — 18 requests at a 10 s floor, about 3 minutes

- ORC chapter pages (7): 3901, 1345, 4505, 4513, 4111, 4113, 4123.
- ORC section pages (5): 1343.03, 1333.41, 4738.01, 4109.07, 4121.47.
- Constitution (1): 2.34a.
- OAC chapter pages (3): 3901-1, 109:4-3, 4123:1-5.
- OAC rule pages (2): 3745-31-30, 3745-21-18.
- `captureSource` per section: `chapter` or `section` (the page shape it
  came from); `/health` reports both counts.
- robots.txt: `Disallow: /`, the decision above. No crawl-delay is stated;
  10 s is the project's own floor.

### 3.4 What was checked and not used

- `insurance.ohio.gov` — 404 to non-browser user agents (see §2.5), the
  bulletin index is a WebSphere portal shell; `dam.assets.ohio.gov` serves
  the PDFs and has an open robots.txt. Not a capture surface for this
  build; revisit if a shop-facing bulletin is ever identified.
- OAC 1301:7-7-24 and -57 (Fire Code) — amendments-only PDFs on the
  copyrighted IFC. Excluded.
- OAC 4101:9-4 — prevailing wage, not minimum wage. OAC 4101:9-2 — minors'
  prohibited occupations. Neither is a flat-rate or piece-rate rule; Ohio
  has none.
- ORC 3937 — the automobile policy chapter; one section (3937.30) mentions
  repair, as a definition. Not shop-facing.
- ORC 4921.25 — PUCO's authority over for-hire tow rates; does not reach a
  shop's own storage billing.
- ORC 4505.111, 4505.181, 4505.20, 3901.211 — checked, not relevant.
- Cornell LII's Ohio mirror — OAC only, no Revised Code. Not needed.

## 4. Identity and citations

- Three codes: `ORC`, `OAC`, `Ohio Const.`. Display cites "ORC 4505.101",
  "ORC 3901.21", "OAC 3901-1-54", "OAC 109:4-3-13", "OAC 4123:1-5-17",
  "Ohio Const. art. II, § 34a".
- Bare numbers resolve by SHAPE, the WA/MT factory configuration: a
  dotted `NNNN.NNN` is ORC, a hyphenated `NNNN-N-NN` or colon-bearing
  `NNN:N-N-NN` is OAC. The shared factory's splitter has never seen a
  colon; if it cannot express `109:4-3-13`, Ohio resolves cites itself
  (the PA/FL/CA pattern) — settle in the plan by reading
  `packages/state-law`'s identity factory first. A structural test
  asserts the manifest has no bare-number collision across codes.
- Input forms that resolve: "R.C. 4505.101", "R.C. § 4505.101", "ORC
  4505.101", "Ohio Rev. Code § 4505.101", "Ohio Revised Code 4505.101",
  "section 4505.101", "OAC 3901-1-54", "Ohio Adm.Code 3901-1-54", "Ohio
  Admin. Code 3901-1-54", "O.A.C. 109:4-3-13", "rule 109:4-3-13", "Ohio
  Const. art. II, § 34a", "Article II, Section 34a", "Section 34a", id
  forms, and named aliases ("CSPA" / "Consumer Sales Practices Act" → the
  1345 listing, "unfair claims settlement" / "claims settlement rule" →
  3901-1-54, "motor vehicle repair rule" / "AG repair rule" → 109:4-3-13,
  "aftermarket crash parts" → 1345.81, "minimum wage amendment" → § 34a,
  "specific safety requirements" / "VSSR" → the 4123:1-5 listing with
  4121.47, "permit-by-rule" → 3745-31-30).
- `chapter` values: ORC sections carry the chapter as printed ("Chapter
  4505 Certificate Of Motor Vehicle Title Law"), OAC rules the chapter
  ("Chapter 3901-1 General Provisions"), the Constitution "Article II".
- Citations: "ORC 4505.101, effective 4/7/2023", "OAC 3901-1-54, effective
  2/14/2022", "OAC 109:4-3-13, effective 3/21/2026", "ORC 4113.19,
  effective 10/1/1953", "Ohio Const. art. II, § 34a, effective
  12/8/2006". Every section has a date; there is no silence path. Every
  date through `fmtDateUtc`.
- Per-section extras: `latestLegislation` (ORC), `priorEffectiveDates`,
  `fiveYearReviewDate`, `authorizedBy`, `amplifies` (OAC), `statusNote`
  (any), `captureSource`.
- No edition pin. Drift is text drift; a moved `Effective` date with
  unchanged text is drift too (the section was re-enacted).

## 5. Package/app shape, tools, tests, deploy

`packages/state-oh` (schema with `captureSource: "chapter" | "section"`,
`statusNote`, the ORC/OAC extras above, four domains, three codes;
taxonomy; one manifest `sources.ts` naming every cite with its code,
domain, and fetch unit; one parser `parse-codes.ts` for the block with two
head readers (h1 and content-head anchor) and the three-shape catchline
splitter; one capture pipeline `capture.ts` with the 10 s floor and the
hard-fails (missing cite, empty body, PDF-filed sentence, repealed note);
identity; four `oh_*` tools + the connector pair with freshness passed),
`apps/state-oh-server` (same worker.ts shape; `/health` adds
`captureSources` {chapter, section} and the four-domain breakdown; no
currency pin field), registry entry `oh`, `OH-LAW-ATTENTION.txt`.

No PDF or Word reader: every surface is HTML. Nothing new lands in
`packages/state-law` unless the identity factory needs the colon shape,
in which case it is added there (every future state with `NNN:N` rule
numbers benefits) rather than in `state-oh`.

Demo gauntlet (shop phrasing; the annotation vocabulary is the bridge):

1. "insurer wrote it for 20 hours and I can't repair it for that" → OAC
   3901-1-54 first, with the (H)(1) excerpt in `quoteSafeExcerpts`
2. "the adjuster told my customer to take it to their DRP shop" →
   3901-1-54 first, with the no-statutory-ban note in the payload
3. "insurer cut off storage on the total loss with no notice" →
   3901-1-54 first ((H)(9))
4. "they lowballed the total loss value" → 3901-1-54 first ((H)(7)); ORC
   4505.11 top 3; "does it need a salvage title" → 4505.11 first
5. "betterment on tires and a battery" → 3901-1-54 first ((H)(2), (H)(3))
6. "aftermarket parts on the estimate and the customer never knew" → ORC
   1345.81 first; 3901-1-54 top 3
7. "insurer hasn't acknowledged the claim in three weeks" → 3901-1-54 or
   3901-1-07 first; "no decision after a month" → 3901-1-54 first;
   "denied with no reason given" → 3901-1-07 first
8. "can I sue the insurer for bad faith" → ORC 3901.22 top 3 with the
   no-private-action note; 3901.20 top 3
9. "do I need written authorization before I start the repair" → OAC
   109:4-3-13 first; "job ran ten percent over the estimate" → 109:4-3-13
   first; "customer wants his old parts back" → 109:4-3-13 first; "can I
   charge for teardown if they don't approve the repair" → 109:4-3-13
   first
10. "customer never picked the car up, it's been a month" → ORC 4505.101
    first; 4513.60 top 3; "the car is worth ten grand, can I take title"
    → 4513.60 top 3 with 1333.41 stated
11. "tech quit Friday, when do I have to pay him" → ORC 4113.15 first;
    "wages 30 days late" → 4113.15 first
12. "deducting a comeback or a broken tool from a tech's pay" → ORC
    4113.19 first
13. "overtime for a flat-rate tech" → ORC 4111.03 first; 4111.031 top 3;
    "what's minimum wage this year" → Ohio Const. art. II § 34a first;
    4111.02 top 3
14. "1099 tech, no comp policy" → ORC 4123.35 first; 4123.75 and 4123.77
    top 3
15. "tech got hurt on a grinder with no guard, BWC says VSSR" → ORC
    4121.47 first; OAC 4123:1-5-12 top 3
16. "respirators for the painter" → OAC 4123:1-5-17 first; "do I need an
    air permit for my booth" → 3745-31-30 first; "VOC limits on
    refinish coatings" → 3745-21-18 first with the county note
17. exact cite short-circuits ("R.C. 4505.101", "ORC 3901.21", "Ohio
    Adm.Code 3901-1-54", "OAC 109:4-3-13", "Article II, Section 34a");
    "CSPA", "VSSR", "unfair claims settlement" listings; the structural
    no-collision test; a test that 4513.60's payload carries its
    statusNote.

Deploy: `oh.repairmcp.com` custom domain, `workers_dev: false`,
burst-test the zone WAF rule on the new hostname (the Backlog's first
entry: it fired on pa., not on fl./ca./deg./ny.). Site flips to eleven
sources, one setup; /legal names the Legislative Service Commission and
the robots decision the way it names California's and Pennsylvania's.

## 6. Risks

- **The robots block.** The project owner's decision, recorded above.
  Eighteen requests at 10 s every four weeks is the whole footprint. If
  the LSC adds a bot challenge, the capture fails loudly rather than
  shipping stale text.
- **The "Governor's veto not reflected" note.** 4513.60 and 4513.61 may
  change when the LSC applies H.B. 434's veto status; the drift checker
  will flag it and the statusNote will disappear or change. That is the
  refresh working. The corpus never hides the note.
- **Length bias.** 3745-31-30 (96.7 KB), 4123.35 (41.9 KB), 4123:1-5-01
  (33.9 KB), 4111.14 (21.6 KB), 3901.21 (20.7 KB), 4123.01 (19 KB), and
  3901-1-54 itself (24.6 KB) are long; the demo suite pins the headliners
  and the annotation layer carries the routing. Same cross-state scorer
  candidate noted under CO, CA, FL, NY, PA — now with nine corpora.
- **Chapter pages up to 705 KB.** The parser must split without quadratic
  string work; the PA act parser (909 KB) is the precedent.
- **The colon in OAC numbers.** The shared identity factory's bare-cite
  splitter is the one place a new shape can bite; settle it in the plan
  by reading the factory, not by assuming.
- **Freshly amended 109:4-3-13 (3/21/2026).** Shops and adjusters will be
  quoting the 2015 text for a while; the citation carries the new date and
  `priorEffectiveDates` shows the lineage.
