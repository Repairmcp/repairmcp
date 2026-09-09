# Kickoff spec: Florida state vertical (state #6)

> **Status 2026-09-09 (same day): SHIPPED** — `https://fl.repairmcp.com/mcp`
> live and verified on the wire; see the FL row in CLAUDE.md's build status.
> Two facts the capture corrected in this document are marked inline
> (627.4265's interest; 69B-220.201(3)(m)'s residential scope). One finding
> outside this build: the zone WAF rate limit returned no 429s on any
> hostname at launch — CLAUDE.md Backlog, first entry.

Written 2026-09-09. Pattern follows WA → MT → CO → TX → CA: a state package
on `@repairmcp/state-law`, a Worker at `fl.repairmcp.com`, registration in
`scripts/state-registry.ts` so the 4-week drift checker covers Florida
automatically. Both capture surfaces below were verified **on the wire this
day** before a line of code was written.

Florida is state #6 because of the ordering decision made the same day: the
remaining states ranked by vehicles on the road and by whether the state's
law is worth citing on a shop floor (FL, NY, MN, PA, OH, IL, MI, NC, MA,
GA). Florida is the third-largest fleet in the country with the highest
shop density after Texas, and its motor-vehicle claims statute is a real
one.

Two decisions in this build are the project owner's standing policy applied
to new facts, and are recorded here so they are not silently reversed:

1. **Statutes come from the Legislature's own site, one section per fetch.**
   Online Sunshine (`leg.state.fl.us`) allows crawling (robots.txt disallows
   only `/employees/` for our agent, no crawl delay); the Senate's mirror
   (`flsenate.gov`) serves byte-identical inner markup but asks for a
   10-second crawl delay. The official publisher with the friendlier posture
   wins; 46 fetches at the io-wide 2 s pause is about two minutes. The
   Senate site is the by-hand cross-check, not a capture surface.
2. **FAC rule text exists only as Word 97 `.doc` downloads.** The
   flrules.org rule card is HTML (effective date, history line, the notice
   id that versions the document), but the text itself is behind a
   `readFile.asp` download that answers `application/msword`. There is no
   HTML text view (`type=2` returns a system message). Decision: read the
   `.doc` with a pure-JS reader (`word-extractor`) behind the same dynamic
   `import()` wall Colorado uses for PDFs, so the Worker bundle never sees
   it. The notice id (`tid`) is the version key and drives the same
   skip-unchanged shortcut as Colorado's CCR `ruleVersionId`, with the same
   manifest-filter gate.

---

## 1. Success criteria

Same bar as CA (kickoff §1): a Florida shop asks a claims question in shop
language and gets verbatim Florida law with a paste-ready citation. The
Florida headliners, in demo order:

1. **The motor vehicle claims statute** → Fla. Stat. 626.9743: parts at
   least equivalent in kind and quality (4); when the insurer requires a
   particular shop it owes restoration to pre-loss condition at no extra
   cost (3); the insured gets a copy of the estimate the settlement is based
   on (7); 72 hours' notice before storage payments stop (8); total loss
   valuation methods and documented, itemized deductions (5)–(6); no
   pushing a third-party claimant onto their own policy (2).
2. **Statutory bad faith with a private right of action** → 624.155: any
   person damaged by a 626.9541(1)(i) violation or by an insurer's failure
   to settle in good faith may sue, after the 60-day civil remedy notice
   filed with the Department. The opposite of California's Moradi-Shalal
   posture and worth saying plainly.
3. **The unfair claims catalog** → 626.9541(1)(i), the fourteen-item list
   that 624.155 makes actionable.
4. **The 80 percent total-loss threshold** → 319.30(3): a statutory number
   no other shipped state has (California and Colorado define a total by
   cost against value; Texas has none).
5. **Twenty days to pay a settlement, then 12 percent interest** → 627.4265.
6. **Adjuster ethics with teeth** → Fla. Admin. Code 69B-220.201: the code
   of ethics 626.878 makes binding — (3)(a) no steering for
   consideration, (3)(b)2 adjust strictly per the contract, (2)(b) a
   breach is an unfair claims settlement practice. The 4/21/2025
   amendment's (3)(m) estimate-of-loss rules turned out on capture to
   apply ONLY to residential property coverage (627.4025(1)); the corpus
   states that rather than letting a shop cite it for a vehicle estimate.
7. **The Motor Vehicle Repair Act** → 559.905 (written estimate over $150
   and the check-one disclosure), 559.909 (no charges over the estimate
   without consent; no holding the car for unauthorized charges; parts
   inspection), 559.911 (invoice), 559.920 (unlawful acts), 559.921
   (remedies incl. the customer's civil action and the shop's lien defense
   for a valid claim), 559.917 (bond to release the possessory lien).
8. **Holding and selling the vehicle** → 713.58 (the labor lien), 713.585
   (sale of the vehicle to enforce it: notice, timing, the owner's
   remedies), 713.78 (towing and storage charges and liens, the 35-day
   sale).
9. **Aftermarket crash parts** → 501.32–501.34: identification and
   disclosure on the estimate.
10. **Deceptive practices with a private remedy** → 501.204 and 501.211
    (the CO lesson: capture the section that creates the private action
    alongside the one that lists the practices).
11. **Workers' compensation exposure** → 440.10, 440.38, 440.107 (the
    stop-work order); the 1099-tech question through 440.02's definitions.

## 2. Corpus manifest (46 sections, three domains)

### 2.1 insurance — Fla. Stat. chs. 319, 624, 626, 627; Fla. Admin. Code (12)

- **Ch. 624 (Insurance Code: Administration and General Provisions):**
  624.155 (civil remedy).
- **Ch. 626 pt. VI (Insurance Adjusters):** 626.877 (adjustments made in
  accordance with the contract), 626.878 (rules; the adjuster code of
  ethics).
- **Ch. 626 pt. IX (Unfair Insurance Trade Practices):** 626.9541 (the
  catalog; (1)(i) is the claims list), 626.9743 (motor vehicle claim
  settlement practices).
- **Ch. 627 pt. II (Insurance Contracts):** 627.4265 (payment of
  settlement within 20 days).
- **Ch. 627 pt. X (Property Insurance Contracts):** 627.70131 (acknowledge
  within 7 days; investigation). Captured WITH the caveat that it sits in
  the property-insurance part; its subsection (7) pay-or-deny clock is
  limited to residential and small commercial property claims. The
  motor-vehicle analogs are 626.9541(1)(i)2–3 and 69O-166.024. Stated in
  the tool descriptions, not decided.
- **Ch. 627 pt. XI (Motor Vehicle and Casualty Insurance Contracts):**
  627.7288 (no deductible on motor vehicle glass under comprehensive).
- **Ch. 319 (Title Certificates):** 319.30 (definitions incl. the 80
  percent total-loss test; salvage and certificate of destruction duties).
- **Fla. Admin. Code 69O-166 (Property and Casualty Insurer Practices):**
  69O-166.021 (definitions), 69O-166.024 (failure to acknowledge and act
  promptly; prompt investigation standards). 69O-166.031 is property
  mediation and out of scope.
- **Fla. Admin. Code 69B-220 (Adjusters):** 69B-220.201 (ethical
  requirements for all adjusters). 69B-220.051 is public adjusters only.

### 2.2 repair_law — Fla. Stat. chs. 559, 713, 501 (22)

- **Ch. 559 pt. IX (the Florida Motor Vehicle Repair Act):** 559.901,
  559.902, 559.903, 559.904 (registration), 559.905, 559.907, 559.909,
  559.911, 559.915, 559.916 (signs and notice), 559.917, 559.919, 559.920,
  559.921. Left out: 559.9215 (fee deposits), 559.92201 (rulemaking),
  559.9221 (the advisory council).
- **Ch. 713 pt. I (Liens, Generally) / pt. II (Liens on Personal
  Property):** 713.58, 713.585, 713.78.
- **Ch. 501 pt. I (Nonoriginal Manufacturer's Replacement Crash Parts, ss.
  501.32–501.34):** all three.
- **Ch. 501 pt. II (the Florida Deceptive and Unfair Trade Practices
  Act):** 501.204 (unlawful acts), 501.211 (other individual remedies).

### 2.3 employment — Fla. Stat. chs. 448, 440 (12)

- **Ch. 448 (General Labor Regulations):** 448.01 (legal day's work),
  448.08 (attorney's fees for unpaid wages), 448.095 (employment
  eligibility / E-Verify), 448.101, 448.102, 448.103 (the private
  whistleblower act), 448.110 (state minimum wage).
- **Ch. 440 (Workers' Compensation):** 440.02 (definitions: employee,
  independent contractor), 440.10 (liability for compensation), 440.105
  (prohibited activities), 440.107 (enforcement; stop-work orders), 440.38
  (security for compensation).

### 2.4 Honest caveats and absences (tool-description and annotation content)

- **No anti-steering statute in the California or Texas sense.** 626.9743
  regulates what an insurer that REQUIRES a shop owes (restoration to
  pre-loss condition at no extra cost) and forbids pushing a third-party
  claimant onto their own policy, but does not forbid recommending a shop.
  The regulatory hook is 69B-220.201's ethics rule against steering for
  consideration. Say so.
- **No labor rate statute or survey rule.** Nothing in 69O-175 or 69O-176
  touches physical damage rates; the corpus states the absence.
- **No prompt-payment deadline on an open claim.** 627.4265's 20 days and
  its 12 percent interest run only from a WRITTEN settlement agreement
  (the capture corrected the kickoff draft, which had read it as
  interest-free); on an unsettled claim the consequence of blowing the
  claims-handling standards is 624.155, not interest.
- **627.70131 is a property-insurance section.** Captured because
  subsection (1) reads generally and shops cite it; the Part X placement
  and the residential limits in (5) and (7) are stated.
- **No state OSHA plan.** Federal OSHA governs spray booths and respirators;
  the safety domain is absent, as in MT, CO, and TX.
- **Almost no state wage law.** No final-paycheck statute, no meal or rest
  break statute, no state overtime law beyond 448.01's ten-hour day; the
  minimum wage is 448.110 and the constitution. The corpus states the
  absences and captures what exists.
- **Statutes carry the EDITION, not effective dates.** Florida prints
  session-law history ("s. 9, ch. 2004-370") and no per-section dates;
  citations read "Fla. Stat. 626.9743 (2026)" and the edition pin
  (`FL_STATUTES_EDITION`) makes the yearly rollover fail loudly. FAC
  citations carry real effective dates.

## 3. Capture surfaces — verified on the wire 2026-09-09, and the traps

### 3.1 Statutes — leg.state.fl.us Online Sunshine (official, plain HTML)

- One page per section:
  `https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0600-0699/0626/Sections/0626.9743.html`
  (the range is the chapter's hundred, chapter and file zero-padded to four
  digits). `http://` 302s to `https://`; request https directly. UTF-8,
  fully server-rendered.
- The statute sits inside a SECOND complete HTML document nested in
  `<div id="statutes"><font …>` (a second `<!DOCTYPE>`). The parser slices
  from `<div class="Section">` and never trusts the outer chrome.
- Markup: `span.SectionNumber` (trailing U+2003 em space), `span.Catchline
  > span.CatchlineText` (the catchline IS source text — Florida prints
  them, unlike California), `span.SectionBody` holding nested
  `div.Subsection` / `div.Paragraph` / `div.SubParagraph` /
  `div.SubSubParagraph` blocks each with `span.Number` + `span.Text`, prose
  blocks as `<p class="Flush|Indent|BlockFlush …">`, form blanks as
  `span.HorizontalRule`, then `div.History > span.HistoryText` and an
  optional `div.Note`.
- **Edition marker:** `<h2>The 2026 Florida Statutes` above the content,
  with an empty slot where Online Sunshine has historically printed
  "(including 2025 Special Session C)". The pin captures the whole phrase,
  suffix included, and fails the capture on a mismatch.
- **Absence is HTTP 200** with "The statute you have selected cannot be
  found." and no `div.Section`. Detected by the missing wrapper.
- The whole-chapter view also exists and repeats `span.SectionNumber` and
  `span.Catchline` in a table of contents (`div.IndexItem`, no
  `CatchlineText` span). Not used for capture; it was used once to read
  Part IX's section list.

### 3.2 FAC — flrules.org (official, two-tier)

- Tier 1: `https://www.flrules.org/gateway/ChapterHome.asp?Chapter=69O-166`
  — a table of `tr.results` rows: the Word icon link
  (`/gateway/readFile.asp?sid=0&type=1&tid=<noticeId>&file=<RuleNo>.doc`),
  the rule link (`a.FX_link_ID`), the title, the effective date. One fetch
  per chapter resolves every rule's `tid`.
- Tier 1b: the rule card `ruleNo.asp?id=69B-220.201` states the effective
  date and the full "Rulemaking Authority … Law Implemented … History–New
  6-2-93, Amended …" line in HTML. The history is read from HERE, not from
  the document, and the effective date is cross-checked against the
  chapter row.
- Tier 2: the `.doc` (`application/msword`, Word 97 composite document,
  ~30 KB). `word-extractor` yields the text; whitespace is normalized and
  the trailing "Rulemaking Authority … History …" line is recognized and
  stripped from the body (it is the card's history note). The document's
  own title line is cross-checked against the card so a `tid` can never
  deliver the wrong rule.
- robots.txt blocks ten specific notice URLs, none relevant, no crawl
  delay.
- **Version shortcut:** an unchanged `tid` AND an unchanged manifest
  selection reuse the served text without fetching the document — the CO
  rule, with the same residual (a widened filter is not detectable).

### 3.3 What was checked and not used

- OIR informational memoranda (floir.gov) and DFS informational bulletins
  (myfloridacfo.com): nothing on auto physical damage, steering, parts, or
  total loss. No bulletin analog to CO's B-5.04 or TX's B-0031-10 exists.
- 69O-175 (motor vehicle rates) and 69O-176 (PIP): nothing on physical
  damage claims; 69O-176.022 (mediation of property damage claims) is
  repealed.
- flsenate.gov: identical inner markup, 10 s crawl delay, no extra
  currency information. Cross-check only.

## 4. Identity and citations

- Two codes: `Fla. Stat.` and `Fla. Admin. Code`. Display cites
  "Fla. Stat. 626.9743", "Fla. Admin. Code 69B-220.201".
- Statute cites are chapter.section dotted pairs the shared factory would
  read as chapters (the TX problem), so Florida resolves everything itself.
  **Bare cites resolve by exact number** (`FL_CITE_CODES`, built from the
  manifests; a number claimed twice throws at module load — impossible in
  practice since FAC cites carry a letter prefix, but the guard is free).
  Code-worded forms ("Fla. Stat. § 626.9743", "F.S. 559.905", "s.
  559.905", "Florida Statutes 624.155"), FAC forms ("Fla. Admin. Code R.
  69B-220.201", "F.A.C. 69O-166.024", "Rule 69B-220.201"), id forms, and
  named aliases ("Motor Vehicle Repair Act" → ch. 559 pt. IX listing,
  "FDUTPA", "Unfair Insurance Trade Practices Act" → ch. 626 pt. IX) all
  resolve.
- `chapter` values are unique per code and read after "chapter": "559,
  pt. IX", "626, pt. IX", "627, pt. II", "713, pt. II", "501, pt. I",
  "448", "440", "69O-166", "69B-220".
- Statute citations carry the edition: "Fla. Stat. 626.9743 (2026)". FAC
  citations carry "effective M/D/YYYY". `FL_STATUTES_EDITION` is pinned by
  a test against corpus meta so the rollover to "The 2027 Florida Statutes"
  fails at re-capture.

## 5. Package/app shape, tools, tests, deploy

`packages/state-fl` (schema with the edition in meta and the FAC `tid`
per section, taxonomy, two manifests, two parsers, the `.doc` text module,
two capture pipelines, the profile), `apps/state-fl-server` (same
worker.ts shape; `/health` adds `statutesEdition` + the three-domain
breakdown), registry entry `fl`, `FL-LAW-ATTENTION.txt`, four `fl_*` tools
+ the connector pair.

Demo gauntlet (shop phrasing; annotation vocabulary is the bridge):

1. "insurer says the customer has to use their shop" → 626.9743 first
   (the restoration duty), 69B-220.201 top 3
2. aftermarket parts pushed → 626.9743 first; 501.33 top 3
3. total loss lowball → 626.9743 top 2; "when is it legally a total" →
   319.30 first
4. storage payments cut off → 626.9743 first (the 72-hour notice)
5. carrier won't send the estimate → 626.9743 top 3
6. claim dragging, no acknowledgment → 626.9541 / 69O-166.024 top 3
7. settled but not paid → 627.4265 first
8. "can I sue the insurer for bad faith" → 624.155 first
9. written estimate threshold / disclosure → 559.905 first
10. customer won't pay, can I hold the car → 559.909 / 713.58 / 713.585
    top 3; sell it → 713.585 first
11. towing and storage charges → 713.78 first
12. registration → 559.904 first
13. 1099 tech and comp → 440.02 / 440.10 top 3; stop-work order → 440.107
    first
14. minimum wage → 448.110 first
15. exact cite short-circuit + "Motor Vehicle Repair Act" listing —
    structural

Deploy: `fl.repairmcp.com` custom domain, `workers_dev: false`, burst-test
the zone WAF rule on the new hostname (expect 429s ~20/10s).

## 6. Risks

- **The edition slot.** Online Sunshine prints special-session suffixes in
  the same `<h2>`; the pin captures the whole phrase so a mid-year
  "(including 2026 Special Session A)" fails loudly rather than shipping
  under the wrong currency line. That failure is the human's cue to
  re-pin after reading what changed.
- **The `.doc` reader.** `word-extractor` is a third-party OLE parser; the
  parser cross-checks the document's own title line against the rule card
  and refuses a document that yields no body text. A reader failure fails
  the capture, never the corpus.
- **Length bias.** 626.9541 and 440.02 are long catalogs; the demo suite
  pins the headliners ahead of them and the annotation layer carries the
  routing. Same scorer candidate noted under CO and CA.
- **Florida's own `.cfm` URLs.** Online Sunshine has run the same URL
  shape since the 1990s; the Senate mirror's `/Laws/Statutes/{year}/{sec}`
  form is the fallback if it ever changes.
