# Kickoff spec: Texas state vertical (state #4)

> **Status 2026-08-31 (same day): SHIPPED** — `tx.repairmcp.com/mcp` live and
> verified on the wire, 62 sections, all 58 tests green, site card flipped.
> See the CLAUDE.md build-status row. This file remains the record of the
> capture-surface discoveries (§3), which are the part worth rereading when
> a drift check fails.

Written 2026-08-31, ahead of a demo with a Texas shop the following week. Every
capture surface below was verified **on the wire this day** — not from search
results, which for two of the three publishers were wrong in ways that would
have sunk the build (see §3). Pattern follows WA → MT → CO: a state package on
`@repairmcp/state-law`, a Worker at `tx.repairmcp.com`, registration in
`scripts/state-registry.ts` so the 4-week drift checker covers Texas
automatically.

---

## 1. Success criteria

Same bar as CO (kickoff §1): a Texas shop asks a claims question in shop
language and gets verbatim Texas law with a paste-ready citation. The Texas
headliners, in demo order:

1. **Steering** → Tex. Ins. Code 1952.301/.302 (the anti-steering pair) with
   TDI Bulletins B-0031-10 and B-0026-11 backing them ("TDI said it twice").
2. **Appraisal** → Tex. Ins. Code ch. 1813 (SB 458, 2025): the brand-new
   MANDATORY appraisal provision in personal auto policies, applying to
   policies delivered/issued/renewed on or after 1/1/2026. No other shipped
   state has an analog. This is the "adjuster lowballed the estimate and won't
   move" answer.
3. **Prompt payment with teeth** → ch. 542 subch. B: 15-day acknowledgment,
   15-business-day accept/reject, 5-business-day payment, and **claim + 18%
   annual interest + attorney's fees** under 542.060. Sharper than anything in
   WA/MT/CO.
4. **Final paycheck / deductions** → Payday Law 61.014 / 61.018.

## 2. Corpus manifest (~60 sections, three domains)

### 2.1 insurance — Tex. Ins. Code (statutes), 28 TAC, TDI bulletins, Transp. Code

- **IN 1952 subch. G (Repair of Motor Vehicles), whole subchapter:**
  1952.301–.307. Verified section list on the wire; .301 bars limiting
  parts/products/facility choice, .302 the prohibited-acts list (referral
  fees, "must use" statements, unreasonable travel, gag on parts disclosure),
  .305 the notice-of-rights, .307 the rulemaking hook for 28 TAC 5.501.
- **IN 1813 (Appraisal of Disputed Losses), whole chapter:** 1813.001–.004
  (verified: APPLICABILITY / RULES / REQUIRED POLICY PROVISION: APPRAISAL
  PROCESS / EFFECT OF APPRAISAL; all "Added by Acts 2025, 89th Leg., R.S.,
  Ch. 899 (S.B. 458), eff. September 1, 2025"). Annotate the 1/1/2026
  policy-form applicability and the exclusions (commercial auto, TWIA).
- **IN 542 subch. B (Prompt Payment of Claims):** 542.051–.061 less nothing —
  definitions through remedies-not-exclusive, 11 sections. The 542.051
  definition limits the subchapter to FIRST-party claims; that caveat is
  annotation content, not a reason to skip.
- **IN 541 (Unfair Methods of Competition / Unfair or Deceptive Acts):**
  541.003, 541.060 (unfair settlement practices catalog), 541.061
  (misrepresentation of policy), 541.151/.152 (the private action + damages —
  Texas HAS one, unlike CO's 10-3-1104), 541.162 (limitations).
- **28 TAC 5.501** (Notice Requirements to Claimants Regarding Motor Vehicle
  Repairs) — TDI's implementing rule for 1952.305/.307.
- **28 TAC 21.201/21.202?/21.203** — ch. 21 subch. C "Unfair Claims Settlement
  Practices" (rules 21.201–21.205 verified in the portal). Capture 21.203 (the
  catalog rule) plus its scope/definitions neighbors as the captured text
  supports; decide the exact set from the fetched text at capture.
- **TDI Bulletins B-0031-10 (8/2/2010) and B-0026-11 (6/20/2011)**, both
  Re: Automobile Repair Facilities — plain-HTML pages, verified.
- **Transp. Code 501.091** (definitions: "salvage motor vehicle",
  "nonrepairable motor vehicle") — the honest answer to "when is it legally a
  total in Texas": no insurance-code percentage threshold; the salvage-title
  definitions are what govern.

### 2.2 repair_law — Occ. Code 2303, Prop. Code 70, DTPA

- **OC 2303 (Vehicle Storage Facilities):** 2303.002, .151, .152, .153, .154,
  .155 (charges), .156 (payment by lienholder or insurance company), .160
  (release). Annotate the scoping honestly: ch. 2303 governs LICENSED vehicle
  storage facilities; an ordinary body shop holding a car in process is not
  automatically a VSF.
- **PR 70 (possessory liens):** 70.001 (worker's lien), 70.003 (garageman's
  lien), 70.004 (possession), 70.005 (sale), 70.006 (sale/disposal of motor
  vehicle — the abandoned-vehicle path), 70.007 (unclaimed excess), 70.008
  (attorney's fees). Texas gets a real `repair_lien` topic — WA/MT/CO all
  declared lien statutes out of scope; a Texas shop's "customer won't pay"
  question is answerable here.
- **BC 17 (DTPA):** 17.45 (definitions incl. "consumer"), 17.46 (the laundry
  list), 17.50 (relief for consumers), 17.505 (pre-suit notice).

### 2.3 employment — Labor Code 61, 62

- **LA 61 (Payday Law):** 61.011 (paydays), 61.014 (payment after termination:
  discharged → 6th day; quit → next regular payday), 61.015 (commissions and
  bonuses — flag-hour relevance), 61.017 (delivery), 61.018 (deductions
  require written authorization), 61.051 (filing a TWC wage claim).
- **LA 62 (Minimum Wage):** 62.051 (adopts the federal minimum), 62.052
  (tipped employees), 62.151 (person covered by the federal act — the honest
  FLSA bridge).

### 2.4 Honest caveats and absences (annotation/description content)

- **No body-shop licensing in Texas.** TxDMV's own Smart Repairs guide says
  so in as many words. The 2303 VSF license is a storage-business license,
  not a repair license.
- **No state OSHA plan** — federal OSHA (29 CFR) governs spray booths,
  respirators, hazcom. Same posture as CO/MT. No safety domain.
- **No state overtime law and no meal/rest break law.** FLSA only. The
  employment tools say so instead of pretending; no `overtime` or
  `meal_rest_breaks` topics exist (no dead topics — CO convention).
- **542 prompt-payment deadlines are FIRST-party only** (542.051's claim
  definition). A shop chasing a third-party claim cites 541.060 and 1952,
  not 542 deadlines.
- **Third-party claimants have no 541.151 private action** (Allstate v.
  Watson) — the statute text is captured; standing is a question for counsel.
- **Ch. 1813 appraisal applies to policies delivered/issued/renewed on or
  after 1/1/2026** and never to commercial auto or TWIA. Check the policy.
- **No TDI bulletin names OEM repair procedures** — that fight runs through
  541.060/542 and now the 1813 appraisal path. Say so rather than invent.

## 3. Capture surfaces — verified on the wire 2026-08-31, and the traps

Research-by-search said both statute and TAC surfaces were unreachable
(JS-rendered SPAs). Both turned out to have clean machine surfaces the SPAs
themselves consume; both were found by watching the apps' own requests.

### 3.1 Statutes — tcss.legis.texas.gov (the SPA's own backend)

- `statutes.capitol.texas.gov` serves an Angular shell for EVERY path,
  including the old `/Docs/IN/htm/IN.1952.htm` URLs and even robots.txt.
  The app fetches chapter HTML from
  **`https://tcss.legis.texas.gov/resources/{CODE}/htm/{CODE}.{chapter}.htm`**
  — the classic pre-SPA chapter HTML, verbatim, plain-fetchable (verified for
  IN.1813, IN.1952, IN.541, IN.542, LA.61, LA.62, BC.17, PR.70, OC.2303).
  Code abbreviations: IN, LA, BC, PR, OC, TN (Transportation).
- **Currency tripwire:** `https://tcss.legis.texas.gov/api/GetProperty/StatutesCurrentMsg`
  returns the sentence "The statutes available on this website are current
  through the 89th 2nd Called Legislative Session, 2025. …" — pin the session
  phrase like CO pins CRS_EDITION; a Legislature rollover fails loudly.
- **Page shape (verified):** BOM + single-line HTML. Per-section anchor
  `<a name="1952.301"></a>`; the section head is a bold self-link
  `Sec.&nbsp;1952.301.&nbsp;&nbsp;HEADING IN CAPS.` with body text following
  in the same and subsequent `<p>`s; subchapter heads are
  `<p class="center" style="font-weight:bold;">SUBCHAPTER G.  REPAIR OF MOTOR
  VEHICLES</p>`; history notes are `<p>` lines "Added by Acts …, eff. April 1,
  2007." / "Amended by:" followed by one `<p>` per act (bill-number links
  interrupt the text — strip tags before parsing). **Newest `eff.` date wins**
  as effectiveDate (the WA newest-effective rule; dates are month-name form).
- Texas statutes DO carry per-section effective dates via these notes —
  unlike CRS. Citations read "Tex. Ins. Code 1952.301, effective 4/1/2007".

### 3.2 TAC — the SOS Appian portal's `_/ui` endpoint

- The old `texreg.sos.state.tx.us` readtac$ URLs are dead (redirect to
  `texas-sos.appianportalsgov.com`). The portal is Appian; its data endpoint
  answers a **plain stateless GET** once four headers are supplied:

  ```
  Accept: application/vnd.appian.tv.ui+json
  X-Appian-Features: 7ffceebc
  X-Appian-Features-Extended: 3fff779fffdbff7f49dc1fffceebc
  X-Appian-Ui-State: stateful
  x-appian-suppress-www-authenticate: true
  ```

  The two feature values are hex renderings of a BigInt constant in the
  portal's own JS bundle (`E=Object.freeze({Accept:…})` in
  portals-*.cache.js). They are PINNED in sources; if an Appian platform
  upgrade changes them the fetch 406s ("Client not supported") and capture
  hard-fails with instructions to re-derive from the bundle. Verified
  cookie-free via curl with the RepairMCP-Bot UA.
- **Two-tier crawl (CO's shape):** browse JSON
  `_/ui?interface=VIEW_TAC&title=28&part=1&chapter=5&subchapter=A&division=6`
  lists rules with `recordId=` links; rule JSON
  `_/ui?interface=VIEW_TAC_SUMMARY&recordId=127595&queryAsDate=MM%2FDD%2FYYYY&$locale=en_US`
  carries the rule text as HTML fragments plus the **Source Note** ("The
  provisions of this §5.501 adopted to be effective July 12, 1998, 23 TexReg
  6962; amended to be effective October 12, 2006, 31 TexReg 8372.") — newest
  "effective" date is the rule's effectiveDate, and the note is the
  historyNote verbatim.
- sourceUrl for a rule is the human deep link
  `…/rules-and-meetings?recordId=…&interface=VIEW_TAC_SUMMARY`.

### 3.3 TDI bulletins — plain HTML, but resolved from the index

- Topic index `https://www.tdi.texas.gov/bulletins/Auto.html`; bulletin pages
  are plain HTML with "Commissioner's Bulletin # B-0031-10" + a plain-English
  date line. **Filename ≠ bulletin number** on older bulletins (B-0031-10 is
  `2010/cc30.html`, B-0026-11 is `2011/cc25.html`) — the manifest pins the
  verified URLs; a drift re-capture must confirm the page still states its own
  bulletin number (mustContain tripwire, like CO's).

## 4. Identity and citations

- Codes: `Tex. Ins. Code`, `Tex. Lab. Code`, `Tex. Occ. Code`,
  `Tex. Prop. Code`, `Tex. Bus. & Com. Code`, `Tex. Transp. Code`, `28 TAC`,
  `TDI Bulletin`. displayCite = "Tex. Ins. Code 1952.301", "28 TAC 5.501",
  "TDI Bulletin B-0031-10".
- The shared factory's 2–3-group resolver reads "1952.301" as two groups =
  chapter, so Texas needs its own resolver (the CO pattern): statute cites are
  `chapter.section` dotted pairs; the captured chapter numbers are DISJOINT
  across codes (17, 61, 62, 70, 501, 541, 542, 1813, 1952, 2303 — and TAC
  chapters 5/21 collide with none of them), so a bare "1952.301" or "5.501"
  resolves by chapter lookup. "Sec. 542.058", "§ 5.501", "Tex. Ins. Code
  §1952.301", "Insurance Code 1952.301", bulletin forms "B-0031-10" /
  "Bulletin B-31-10 (normalized)" all resolve. Bare chapter number ("542",
  "1952") → chapter listing.
- Citation notes: statutes and TAC carry `effective M/D/YYYY`; bulletins carry
  `issued M/D/YYYY`. Meta carries the pinned statutes currency sentence
  (`txStatutesCurrencyNote`) with a pin test (`TX_STATUTES_CURRENCY`), the
  rollover analog of MT's edition pin.

## 5. Package/app shape, tools, tests, deploy

Identical to CO: `packages/state-tx` (profile + parsers + data + annotations),
`apps/state-tx-server` (same worker.ts shape; /health adds
`statutesCurrentThrough` + domain breakdown), registry entry `tx`,
`TX-LAW-ATTENTION.txt`, four `tx_*` tools + connector pair, taxonomy with a
Texas-specific `appraisal` topic and a real `repair_lien` topic, no dead
topics. Demo gauntlet (shop phrasing, annotation vocabulary is the bridge):

1. steering/network shop → 1952.301 or 1952.302 first
2. lowball + "invoke appraisal" → 1813.003 in top 3 (target: first)
3. supplement sitting unanswered → 542.055/.058 top 3
4. "interest and attorney fees for slow pay" → 542.060 top 3
5. aftermarket parts pushed without disclosure → 1952.301/5.501 top 3
6. storage charges after total loss → 2303.155/.156 top 3
7. customer won't pay, car abandoned → 70.001/70.006 top 3
8. tech quit, final check → 61.014 first
9. charging a tech for a comeback → 61.018 top 3
10. exact cite short-circuit + chapter listing (1952) — structural

Deploy: `tx.repairmcp.com` custom domain, `workers_dev: false`, burst-test the
zone WAF rule on the new hostname (expect 429s ~20/10s).

## 6. Risks

- **The Appian feature-header pin** is the fragile joint. Mitigation: 406 →
  hard fail naming the bundle re-derivation procedure; the drift checker
  surfaces it as a capture failure, never silent staleness.
- **tcss.legis.texas.gov is an undocumented backend host.** It is the
  statutes site's own data source, so it moves only if the SPA moves; the
  currency-endpoint check fails loudly if the shape changes.
- **SB 458 rules**: TDI's implementing rulemaking for 1813 was still in
  proposal in 2026 (right-to-appraisal notice at renewal). Capture the rule
  when adopted; the statute text ships now.
