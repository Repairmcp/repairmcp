# Kickoff spec: Illinois state vertical (state #10)

> **Status 2026-09-15: SHIPPED** — `https://il.repairmcp.com/mcp` (version
> `e0662f48-7d2f-498b-97bc-656c03a5d197`, deployed 2026-09-15T21:19:50Z)
> live and verified on the wire; see the IL row in CLAUDE.md's build status.
> The project owner approved all four decisions below as written the same
> day ("Yes to all four") and every one held. `/health` reports 88 sections,
> captured 2026-09-15, newestEffectiveDate 2026-07-01, captureSources act 50
> / article 15 / part 23, headingSources section 68 / manifest 20, ten
> undated sections, the three dual-printed sections resolved as §The four
> decisions item 4 predicted, domains insurance 16 / repair_law 37 /
> employment 23 / safety 12. Wire probes: the paint-and-materials query →
> `215 ILCS 5/154.6, effective 7/1/2022` first with the (j) excerpt; the
> twenty-hours query → `50 Ill. Adm. Code 919.80, effective 7/22/2002` first
> with the (d)(6) excerpts; `il_get_authority` on "770 ILCS 45/1.5" →
> `770 ILCS 45/1.5, effective 11/23/2017`; the connector `search` on "tech
> quit friday when do I have to pay him" → `ilcs:820-115/5` first. WAF burst
> 19/30 passed, 11 blocked — the rule fired on il. What the real pages
> corrected in this plan: (1) the fetch plan is 23 units, not 21 (§3.3 below
> counted the two lien acts as one); (2) ilga.gov serves only its leaf
> certificate — Bun's fetch cannot build the chain, and the capture runs
> with `NODE_EXTRA_CA_CERTS=C:\degdata\ilga-intermediate.pem` (the Sectigo
> OV R40 intermediate, fetched from the leaf's own AIA URL); (3) a section
> table nests its outline items as inner `width="100%"` tables and a
> `<center>`-set form (770 ILCS 45/2) glues its Source note to the last
> line — both handled in `parse-ilcs.ts`; (4) 154.7 also prints no
> catchline, so 20 sections carry manifest headings, not 19; (5) the shared
> corpus and adapter assumed a display cite of `${code} ${cite}` in their
> lookup key — now the profile's `displayCite`, byte-identical for every
> prior state (nine suites re-run green) and necessary for a cite that
> carries its code inside it. The whole-Part page's SUBPART heading
> documents and appendix/table heads were the two Administrative Code
> surface shapes the kickoff had not seen.

Written 2026-09-15. Pattern follows WA → MT → CO → TX → CA → FL → NY → PA →
OH: a state package on `@repairmcp/state-law`, a Worker at
`il.repairmcp.com`, registration in `scripts/state-registry.ts` so the
4-week drift checker covers Illinois automatically. Every capture surface
below was verified **on the wire this day** before a line of code was
written: every act page and article range the manifest names was fetched
and its section list read back, every Administrative Code Part was fetched
whole, and the effective date, text length, and dual-print status of all 88
manifest sections were tabulated from the saved pages (not from memory or
from research summaries). The Department of Insurance's bulletin index was
read in full (158 bulletins across ten data tables) and the three
automobile bulletins it holds were downloaded and read.

Illinois is #5 of Tier 1 (FL, NY, PA, OH, **IL**, MI, NC), per the project
owner's "Remaining states ordering" decision recorded in
`docs/PA-VERTICAL-KICKOFF.md`. Michigan follows.

## The four decisions for the project owner (policy, not code)

1. **One publisher, and for once no robots fight.** The General Assembly's
   `ilga.gov` serves the Illinois Compiled Statutes AND, through the Joint
   Committee on Administrative Rules, the Illinois Administrative Code. Its
   `robots.txt` **allows** everything the capture touches (it disallows only
   `/account`, `/admin`, `/search`, `/api`, and names eight SEO bots) and
   asks for `Crawl-delay: 10` from every agent. Proposed: capture at a
   10-second per-fetch floor (`FetchOpts.minDelayMs`, the CA/PA/OH pace),
   23 requests, about 4 minutes, roughly 9 MB. This is the first state
   since Montana where the capture is unambiguously invited rather than
   tolerated, and /legal can say so.
2. **No bulletin source.** The Department of Insurance publishes Company
   Bulletins behind a JavaScript table whose JSON feed is open (ten
   `datatablecontentfragment.json` endpoints, read in full). Of 158
   bulletins, three are addressed to automobile insurers: CB 2022-08
   (uninsured-motorist property damage offerings under 215 ILCS 5/143a),
   CB 2022-11 (rental reimbursement must cover comprehensive AND collision
   losses), CB 2021-14 (a $4-per-car-year data fee). None touches
   physical-damage claim handling, steering, parts, storage, or total loss.
   Proposed: the corpus states one publisher and the tool descriptions say
   the bulletin index was searched and holds nothing shop-facing — the
   Ohio pattern, with the difference that Illinois's index is machine-
   readable and the statement is checkable by anyone.
3. **Four domains, with a county-limited safety layer.** Illinois OSHA
   (820 ILCS 219) reaches **public employers only** (§ 15 says so in one
   sentence); federal OSHA governs private shops. The one Illinois-specific
   layer that binds a body shop's booth is the Pollution Control Board's
   motor vehicle refinishing rule, adopted twice: 35 Ill. Adm. Code 218
   Subpart HH for the Chicago area (Cook, DuPage, Kane, Lake, McHenry, Will,
   plus Aux Sable and Goose Lake Townships in Grundy and Oswego Township in
   Kendall) and 35 Ill. Adm. Code 219 Subpart HH for the Metro East
   (Madison, Monroe, St. Clair). VOM limits per coating category, HVLP or
   electrostatic guns, enclosed gun cleaners, surface-prep limits, closed
   containers. Proposed: capture both Subparts (five rule sections plus the
   applicability section each, twelve sections), name the counties in every
   description, and state that a shop outside them has no state refinish
   rule. The alternative is three domains and an honest absence; Ohio's
   precedent (thin BWC/EPA safety) argues for four.
4. **Dual-printed sections.** The ILCS database prints a section in two
   or more complete versions when an amendment is pending or when two
   Public Acts amended it without a revisory merge: `(Text of Section
   before amendment by P.A. 104-457)` / `(Text of Section after amendment
   by P.A. 104-457)`, and `(Text of Section from P.A. 104-480)` / `(Text of
   Section from P.A. 104-525)`. Three manifest sections are dual-printed
   today: 820 ILCS 115/9 (deductions — the after-text's P.A. 104-457 took
   effect 6/1/2026, so the AFTER version is the law), 820 ILCS 105/3
   (Minimum Wage Law definitions — two "from" versions, P.A. 104-480 eff.
   7/1/2026 and P.A. 104-525 eff. 6/26/2026, both in force), 820 ILCS 305/4
   (workers' compensation insurance — two "from" sets, both in force since
   2024). Proposed rule, applied in code with a test per shape:
   before/after pairs resolve by DATE (the after-text when its Public Act's
   effective date is at or before the capture date, else the before-text);
   "from" sets resolve to the version whose source note carries the newest
   effective date at or before the capture date (ties → the higher Public
   Act number), and the section records a `versionNote` naming every
   printed version so the payload never hides that the Legislature printed
   two. A section whose only printed version has a FUTURE effective date is
   captured as printed with `futureEffective: true` and a capture warning —
   the site's own banner says this happens ("statutory changes are
   sometimes included in the statute database before they take effect").

---

## 1. Success criteria

Same bar as OH (kickoff §1): an Illinois shop asks a claims or shop
question in shop language and gets verbatim Illinois law with a paste-ready
citation. The Illinois headliners, in demo order:

1. **The paint-and-materials cap is an improper claims practice by
   statute.** 215 ILCS 5/154.6(j): "Attempting to settle a claim for less
   than the amount to which a reasonable person would believe the claimant
   was entitled, by reference to written or printed advertising material
   accompanying or made part of an application or establishing unreasonable
   caps or limits on paint or materials when estimating vehicle repairs."
   California's 758.6 says "no capping"; Illinois says a cap is an improper
   claims practice under the Insurance Code. No other shipped state has
   both. Enforcement is the Director's (154.7, 154.8: cease and desist, up
   to a six-month suspension, a civil penalty up to $250,000), and 424(4)
   makes 154.5–154.8 conduct an unfair method of competition.
2. **"I can't repair it for the insurer's number"** → 50 Ill. Adm. Code
   919.80(d)(6): the company's estimate "shall be reasonable … and of an
   amount which will allow for repairs to be made in a workmanlike
   manner"; if the insured's own written estimate exceeds it, "the company
   shall review and respond promptly to the insured and provide the insured
   with the name of a repair shop that will make the repairs in a
   workmanlike manner. Failure of the company to so inform the insured of
   the name of such a repair shop shall require the company to provide
   written notice to the insured that any and all reasonable costs incurred
   for repair or replacement related to the partial loss in excess of the
   company's estimate will be reimbursed by the company." The Ohio (H)(1)
   duty, one step stronger: name a shop or put the reimbursement promise in
   writing.
3. **Steering** → 919.80(d)(1)(B): "The company shall not require the
   insured or claimant to travel unreasonably either to obtain a repair
   estimate or to have the vehicle repaired at a specific repair shop that
   is recommended by the company." Stated honestly: Illinois has **no
   statutory steering ban** — the rule limits unreasonable travel and
   nothing bars a recommendation. What Illinois does have that no other
   shipped state has: **154.6(p) and (q)** — an insurer must verify that a
   repairer it designates is licensed under 625 ILCS 5/5-301, and every
   insurer estimate must carry a notice that Illinois law requires vehicle
   repairers to be licensed. Illinois **licenses repairers** (5-301(a):
   "No person in this State shall … carry on or conduct the business of …
   a repairer … unless licensed to do so in writing by the Secretary of
   State"), the first shipped state with body-shop licensing.
4. **Storage and towing** → 919.80(d)(3): reasonable notice to the insured
   before storage payments stop, "sufficient notice to the insured to allow
   them to remove the vehicle from storage prior to the termination of
   payment," documented in the file; all reasonable towing charges paid
   unless the company named its own tower first; no advance charge
   deductions unless the insured caused excessive charges. 919.90(e): no
   insurer "shall abandon the salvage of a motor vehicle to a towing
   service and/or storage yard service in lieu of the towing and storage
   charges, without the agreed permission" of that yard — the
   dump-the-salvage-on-the-shop move is an improper practice by name.
5. **Betterment** → 919.80(d)(4): only a measurable decrease in market
   value from prior condition or damage; wear and tear, missing parts, and
   rust capped at **$500**; itemized and documented; and the company may
   not require the insured to supply parts. Exhibit A tells the consumer
   the same in plain words.
6. **Total loss** → 919.80(c) and Exhibit A: the replacement-vehicle method
   (same manufacturer, same year, similar body style, options and price,
   through a licensed dealer, warranted if the current or three prior model
   years), the cash-settlement methods (a bimonthly guide, a computerized
   source meeting the 85-percent / 15-model-year / 1.5-million-vehicle
   test, or two currently available or recently sold dealer vehicles within
   50 miles, else two written dealer quotes), the **30-day right of
   recourse** (cannot buy a comparable → reopen, locate, pay the difference,
   replace, or appraise), sales tax and title/transfer fees within 30 days
   (33 to document), "dealer prep" deductions prohibited, and Exhibit A
   handed to the insured within 7 days of the determination. The statute
   behind the tax rule: 215 ILCS 5/154.9 (policies issued or renewed on or
   after 7/1/2022, third-party claimants included). **154.10** (policies on
   or after 7/1/2025): the insurer must give the insured "a brief
   description of how that determination was made, including any available
   repair estimate, estimated vehicle salvage value, assessed market value,
   and other costs and calculations used." Then 625 ILCS 5/3-117.1(b)(1):
   the insurer that pays a total loss "shall be deemed to be the owner" and
   applies for the salvage certificate within 20 days — except hail-only
   damage or a vehicle **9 model years or older**, which the owner may keep
   by agreement. Stated honestly: **no statutory total-loss percentage**;
   the trigger is the insurer's determination.
7. **Claim deadlines** → 919.50(a): affirm or deny within a reasonable
   time, pay within 30 days of affirming liability, written explanation of
   any lower offer or denial within 30 days citing the policy provision,
   with the Notice of Availability of the Department; 919.40's "Prompt
   Investigation": a bona fide effort to communicate within **21 working
   days** of notice of loss; 919.80(b): a first-party collision claim
   unresolved for **40 days** requires a written explanation for the delay
   (60 days for a property-damage liability claim); 154.6(b), (c), (d),
   (h), (i), (n) are the statutory catalog behind them.
8. **Bad faith** → 215 ILCS 5/155: for a "vexatious and unreasonable" delay
   or denial the court may award attorney fees, costs, and up to the
   greater of 60 percent of the recovery, $60,000, or the excess over the
   pre-suit offer. Stated honestly: **no common-law bad faith tort and no
   private action under 154.6** (Cramer v. Insurance Exchange Agency, 174
   Ill. 2d 513 (1996) — Section 155 is the extra-contractual remedy);
   third-party claimants have no 155 claim. Say so.
9. **Aftermarket crash parts** → 215 ILCS 5/155.29(d): "No insurer shall
   specify the use of non-OEM aftermarket crash parts in the repair of an
   insured's motor vehicle, nor shall any repair facility or installer use
   non-OEM aftermarket crash parts to repair a vehicle unless the customer
   is advised of that fact in writing"; the insurer's estimate must identify
   each part and carry the disclosure sentence; (c) the maker's name or logo
   on the part, visible after installation where practicable. The rule
   beside it, 919.80(d)(5)(C): no insurer may require a replacement crash
   part "unless the replacement crash part is at least equal in like kind
   and quality to the original part in terms of fit, quality and
   performance," and the insurer must consider the cost of modifications.
10. **The shop's own act** → 815 ILCS 308, the **Automotive Collision
    Repair Act** (the Automotive Repair Act, 815 ILCS 306, expressly does
    NOT apply to collision facilities — 306/83 — and 308/80 returns the
    favor): no work over $100 without authorization after disclosure
    (308/15(a)); a written estimate or price limit, not exceeded by more
    than 10 percent without oral or written consent, including storage and
    administrative fees (308/15(b)); parts designated new, used,
    rebuilt/reconditioned, or aftermarket (308/15(c)); the flat-rate manual
    disclosure, by sign if the shop prefers (308/15(d)); teardown cost
    stated on the estimate if the consumer walks (308/15(e)); the
    three-signature consumer-rights statement (308/20); consent before
    exceeding the estimate, with the phone-authorization notation (308/25);
    return in a disassembled state within 3 working days, with the removed
    parts (308/30); the after-hours drop-off rule (308/35); the invoice
    with VIN and each major part identified by category (308/40); the
    written warranty (308/45); the posted sign in 1.5-inch letters
    (308/50); two years of records (308/55); what a consumer must pay to
    take the car, including posted storage and administrative charges
    (308/60); **the lien is barred** for unauthorized parts or labor if the
    shop skipped any of these (308/65); the eleven unlawful acts including
    "a pattern or practice of preparing written estimates underestimating
    the final costs of repairs" (308/70(11)); and a knowing, persistent
    pattern is a Consumer Fraud Act violation with the AG's remedies
    (308/75). The private remedy behind it: 815 ILCS 505/10a (actual
    damages, injunctive relief, fees to the prevailing party; three-year
    limitations).
11. **Holding the car and the lienholder trap** → 770 ILCS 45/1 (the
    Labor and Storage Lien Act: a lien for labor, skill, materials, or
    storage at the contract price, surviving release of the car for one
    year), 45/2 (the lien notice filed with the recorder within 60 days
    of delivery), 770 ILCS 50/1–3 (the Small Amount Act, $2,000 or less:
    enforce by commercially reasonable sale after 90 days on 30 days'
    published and mailed notice). The trap no other shipped state has:
    **45/1.5 and 50/1.5** — anyone "seeking to impose fees in connection
    with the furnishing of storage for a vehicle" must send certified
    notice with the daily rate to the lienholder of record BEFORE the fees
    start accruing, "regardless of whether it enforces a lien under this
    Act"; skip it and "storage fees shall not be assessed and collected"
    and the lienholder takes the car free of storage. Then 625 ILCS
    5/4-201(b) (abandonment on private property is unlawful except on the
    bailee's own property — so the shop cannot report its own customer's
    car as abandoned to force a tow) and 4-214(b) (after a police tow the
    last registered owner owes towing and storage, capped at 30 days'
    storage).
12. **Wage rules with teeth** → 820 ILCS 115/3 and /4 (semi-monthly, paid
    within 13 days of the period's end; weekly within 7), 115/5 (final
    compensation by the next regular payday, earned vacation included, no
    forfeiture), 115/9 (deductions only as required by law, for the
    employee's benefit, under a wage assignment, or "with the express
    written consent of the employee, given freely at the time the deduction
    is made") with 56 Ill. Adm. Code 300.720 (a standing deduction
    agreement is valid for at most six months), 300.820 ("A financial loss
    suffered by an employer due to damage to his/her property or to that of
    a customer or client shall not be deducted from an employee's pay
    unless the employee's expressed written consent is given freely at the
    time the deduction is made" — the comeback-chargeback answer),
    300.850 (same for required equipment — the tool-purchase answer),
    115/9.5 (reimbursement of necessary expenses — the tools-and-supplies
    other half), 115/14 (5 percent per month damages, the $250–$1,000
    administrative fee, a 20 percent penalty, misdemeanor to felony for
    willful refusal), 105/4 ($15 an hour since 1/1/2025), 105/4a (time and
    a half over 40; the (2)(A) mechanic exemption reaches only a
    "nonmanufacturing establishment primarily engaged in the business of
    selling such vehicles" — a dealership, not an independent shop; say
    so), 105/12 (treble damages plus 5 percent a month plus fees), 105/3
    (the "employee" definition and its exclusions), 56 Ill. Adm. Code
    210.440 (no daily overtime; overtime only over forty).
13. **Breaks and leave, which Illinois has and Ohio does not** → 820 ILCS
    140/3 (a 20-minute meal period within the first 5 hours of a 7½-hour
    shift, another 20 minutes for each additional 4½), 140/2 (24
    consecutive hours of rest every seven days), 140/7 (per-employee,
    per-day civil penalties and damages, doubled for employers of 25 or
    more); 820 ILCS 192/15 (the Paid Leave for All Workers Act: 40 hours a
    year at one hour per 40 worked, for any reason, since 1/1/2024); 820
    ILCS 90/10 (no non-compete under $75,000 a year — $80,000 from 2027 —
    and no non-solicit under $45,000; a signed one is void).
14. **1099 techs** → 820 ILCS 305/4 (every employer insures its entire
    liability, self-insures with Commission approval, or faces the (d)
    penalties: a stop-work order, $500 a day with a $10,000 minimum, and a
    Class 4 felony for a knowing failure); 105/3's employee definition;
    stated honestly: the **Employee Classification Act (820 ILCS 185) is
    construction-only** — its ABC test does not reach a body shop.

## 2. Corpus manifest (88 sections, four domains, two codes)

Dates below are the newest `eff.` date in the section's source note (ILCS)
or the Source line (Administrative Code), as printed on 2026-09-15. "(no
date)" means the source note names Public Acts without an effective date —
the silence path for the citation, with the Public Acts recorded.

### 2.1 insurance — 215 ILCS 5; 50 Ill. Adm. Code 919 (16)

- **215 ILCS 5/143.13** (definitions for 143.11–143.24, incl. "policy of
  automobile insurance" — the scope 919.40 borrows; eff. 6/28/2001, 5.5
  KB), **154.5** (improper claims practices, knowingly or with frequency;
  no date, P.A. 80-926), **154.6** (the catalog, (j) paint and materials,
  (p)/(q) repairer licensing, (r) the tax; eff. 7/1/2022), **154.7**
  (statement of charges; no date), **154.8** (cease and desist, suspension,
  $250,000; eff. 7/12/2019), **154.9** (tax, title, and transfer fees on a
  total loss; eff. 7/1/2022), **154.10** (description of the total-loss
  determination; eff. 1/1/2025), **155** (attorney fees; eff. 1/1/2004),
  **155.29** (aftermarket crash parts; no date, P.A. 86-1234; 86-1475),
  **424** (unfair methods of competition, (4) incorporates 154.5–154.8;
  eff. 1/1/2026).
- **50 Ill. Adm. Code 919.40** (definitions: Days, Documentation, Notice of
  Availability, Prompt Investigation = 21 working days; eff. 1/17/2025),
  **919.50** (required practices for all companies: 30 days; eff.
  7/1/2004), **919.60** (improper practices for all companies; eff.
  1/11/1989), **919.80** (private passenger automobile: (b) delays, (c)
  total loss, (d) travel, loss of use, storage/towing, betterment, crash
  parts, repairs; eff. 7/22/2002, 19 KB — the corpus headliner), **919.90**
  (improper practices, P&C: (e) abandoning salvage to a storage yard; eff.
  1/11/1989), **919.EXHIBIT A** (Total Loss Automobile Claims, the
  consumer notice; eff. 1/17/2025, 8 KB).

### 2.2 repair_law — 815 ILCS 308, 306, 505; 625 ILCS 5; 770 ILCS 45, 50 (37)

- **815 ILCS 308/5** (purpose), **308/10** (definitions, eff. 7/1/2023),
  **308/15** (estimates), **308/20** (the consumer-rights statement),
  **308/25** (estimate insufficient), **308/30** (authorization; return of
  parts, eff. 7/1/2023), **308/35** (after-hours drop-off), **308/40**
  (invoices), **308/45** (warranties), **308/50** (the sign, eff.
  8/21/2007), **308/55** (records), **308/60** (removal from the facility),
  **308/65** (lien barred), **308/70** (unlawful acts), **308/75**
  (violations → CFA), **308/80** (exemption for 306 facilities). All eff.
  1/1/2004 unless noted.
- **815 ILCS 306/10** (definitions), **306/15** (estimates), **306/70**
  (removal), **306/75** (lien barred), **306/80** (unlawful acts),
  **306/83** (does not apply to collision facilities; eff. 1/1/2004),
  **306/85** (violations). Eff. 1/1/1998 unless noted. Captured for the
  mechanical side of a shop's work and so the 306/83 ↔ 308/80 boundary is
  stated in the law's own words.
- **815 ILCS 505/2** (unfair or deceptive acts; no date, P.A. 78-904),
  **505/10a** (private action; eff. 1/1/2000, 7.3 KB).
- **625 ILCS 5/1-171.3** ("Repairer"; eff. 1/1/1998), **5-301** (repairers
  must be licensed; eff. 1/1/2022, 11.3 KB), **3-117.1** (salvage
  certificates; eff. 5/13/2022, 13.5 KB), **4-201** (abandonment
  prohibited; eff. 8/8/1997), **4-214** (owner's liability after a tow,
  30-day storage cap; eff. 12/15/1995).
- **770 ILCS 45/1** (the lien; no date, Laws 1921), **45/1.5** (storage
  fees; notice to lienholder; eff. 11/23/2017), **45/2** (the 60-day lien
  notice; no date, P.A. 83-358); **770 ILCS 50/1** ($2,000 or less; no
  date, P.A. 85-1283), **50/1.5** (same notice rule; eff. 11/23/2017),
  **50/2** (90 days, then sale), **50/3** (30 days' notice, the form; no
  date, P.A. 87-206).

### 2.3 employment — 820 ILCS 115, 105, 140, 192, 90, 305, 219; 56 Ill. Adm. Code 300, 210 (23)

- **820 ILCS 115/2** (definitions; eff. 1/1/2025), **115/3** (semi-monthly;
  eff. 1/1/2024), **115/4** (13 days / 7 days; eff. 1/1/2015), **115/5**
  (final compensation, vacation; no date, P.A. 83-199), **115/9**
  (deductions; DUAL-PRINTED, after-text eff. 6/1/2026 governs, 16.9 KB),
  **115/9.5** (expense reimbursement; eff. 1/1/2019), **115/14**
  (penalties; eff. 8/1/2025).
- **820 ILCS 105/3** (definitions; DUAL-PRINTED "from" P.A. 104-480 eff.
  7/1/2026 and P.A. 104-525 eff. 6/26/2026, 10.9 KB), **105/4** (the rate
  schedule; eff. 2/19/2019, 8 KB — the $15 line is the only one that
  matters and the annotation excerpt is scoped to it), **105/4a**
  (overtime; eff. 1/1/2016), **105/12** (remedies; eff. 7/1/2024).
- **820 ILCS 140/2** (day of rest; eff. 6/30/2023), **140/3** (meal
  periods; eff. 1/1/2023), **140/7** (civil offense; eff. 3/21/2025).
- **820 ILCS 192/15** (paid leave; eff. 8/15/2025, 11.6 KB).
- **820 ILCS 90/10** (non-compete thresholds; eff. 8/15/2025).
- **820 ILCS 305/4** (insurance, self-insurance, penalties; DUAL-PRINTED
  "from" sets, eff. 6/5/2024, **62 KB** — the longest section in the
  corpus; captured whole because sections are the addressable unit, with
  the annotation's excerpts scoped to (a)(3) and (d)).
- **820 ILCS 219/15** (Illinois OSHA applies to public employers; eff.
  1/1/2015) — captured so the absence is stated in the law's own words.
- **56 Ill. Adm. Code 300.600** (payment of wages, the receipt; eff.
  8/22/2014), **300.720** (written deduction agreements; eff. 3/31/2023),
  **300.820** (damaged property; eff. 9/1/1992), **300.850** (required
  equipment; eff. 9/1/1992); **56 Ill. Adm. Code 210.440** (overtime,
  general; NO section Source line — date inherited from Part 210's
  adoption, 5/2/1995, `dateSource: "part"`).

### 2.4 safety — 35 Ill. Adm. Code 218 Subpart HH, 219 Subpart HH (12)

- **218.103** (applicability: the Chicago-area counties and townships;
  eff. 9/27/1993), **218.780** (VOM limits per coating category; eff.
  5/9/1995, 4.8 KB — the topcoat equations print as IMAGES on the site and
  are absent from the text; the variable definitions survive and the
  description says the formula images are not captured), **218.782**
  (90-percent control alternative), **218.784** (HVLP/electrostatic guns
  and enclosed gun cleaners, 20-gallon-a-year floor; eff. 1/28/2013),
  **218.786** (surface preparation VOM limits), **218.787** (work
  practices: closed containers).
- **219.103** (applicability: Madison, Monroe, St. Clair; NO section Source
  line — inherited from Part 219's adoption), **219.780**, **219.782**,
  **219.784**, **219.786**, **219.787** — the Metro East twins, same dates.

### 2.5 Honest caveats and absences (tool-description and annotation content)

- No private right of action under 154.5/154.6; no common-law bad faith
  tort (Cramer). Section 155 is the remedy, first-party only, capped.
- No statutory steering ban. 919.80(d)(1)(B) limits unreasonable travel to
  a recommended shop; nothing bars a recommendation. 154.6(p)/(q) are the
  licensing-verification duties.
- No labor rate rule. The paint-and-materials protection is 154.6(j).
- No statutory total-loss percentage; 3-117.1(b)(1) triggers on the
  insurer's payment; the 9-model-year / hail-only retention rule.
- The Automotive Repair Act (306) does not apply to a collision facility;
  the Automotive Collision Repair Act (308) does. A shop doing both is
  covered by both, act by act.
- The storage-fee lienholder notice (45/1.5, 50/1.5) forfeits storage if
  skipped — a shop-facing trap, not an absence.
- No state OSHA plan for private employers (219/15). The refinishing VOM
  rules apply only in the Chicago-area and Metro East counties named in
  218.103 and 219.103; a shop elsewhere in Illinois has no state refinish
  rule and federal rules (40 CFR 63 Subpart HHHHHH) govern.
- No adult flat-rate or piece-rate statute; the 105/4a(2)(A) mechanic
  exemption is dealership-only.
- The Employee Classification Act (185) is construction-only; a 1099 tech
  question is answered by 305/4 and 105/3, and the ABC test is persuasive,
  not binding.
- No Department of Insurance bulletin on physical-damage claims (decision
  2 above).
- The ILCS database states no currency ("Updating the database … is an
  ongoing process") and warns that not-yet-effective amendments may be
  printed; the corpus records `capturedAt`, the newest effective date, and
  the dual-print resolution per section (decision 4).

## 3. Capture surfaces — ilga.gov, verified on the wire 2026-09-15, and the traps

### 3.1 Statutes: two page shapes, one section block

- **Act pages** (`/Legislation/ILCS/Articles?ActID=N&ChapterID=N&Chapter=…&MajorTopic=…`):
  for an act with no article structure, the whole act's text; for a code
  with articles (the Insurance Code, the Vehicle Code), a listing of
  article ranges. `ActID` is the key (306 → 2324, 308 → 2500, 505 → 2356,
  215 ILCS 5 → 1249, 625 ILCS 5 → 1815, 770 ILCS 45 → 2251, 50 → 2252,
  820 ILCS 115 → 2402, 105 → 2400, 140 → 2407, 192 → 4351, 90 → 3737,
  305 → 2430, 219 → 3572); the other query parameters are display text.
  The chapter listing (`/Legislation/ILCS/Acts?ChapterID=…`) resolves
  ActIDs and is the drift-check tripwire for a renumbered act.
- **Article-range pages** (`/legislation/ILCS/details?…&ActID=N&SeqStart=A&SeqEnd=B`):
  the sections of one article in the same block markup. Ranges come from
  the act page's own links: Insurance Code Article IX = 51000000–67200000
  (915 KB, 154.x/155.x), Article XXVI = 132300000–133900000; Vehicle Code
  Chapter 1 = 100000–34800000 (609 KB, definitions), Chapter 3 Article I =
  38600000–42200000, Chapter 4 Article II = 75500000–77700000, Chapter 5
  Article III = 81500000–81800000. The manifest pins the ranges and the
  capture re-reads them from the act page each run, failing loudly if a
  range moved.
- **The section block**, identical on both shapes: one
  `<table width="500">` per section inside `div.billtext-scale`, text in
  `<code><font size="2" face="Courier New">…</font></code>` runs separated
  by `<br>`, paragraph indents as `<code>&nbsp;&nbsp;&nbsp;&nbsp;</code>`,
  the cite marker `(815 ILCS 308/15)` first (on the codes, followed by the
  former cite `(from Ch. 73, par. 766.6)`, recorded as `formerCite` and
  dropped from the text), then `Sec. 15.` and the catchline — in TWO
  markup variants (older sections put the catchline in its own font run
  after an empty run; newer sections print `Sec. 10. Definitions. As used
  …` in one run) — then the body, then `(Source: P.A. 93-565, eff.
  1-1-04.)`. No anchors, no ids, no per-section URL: the fetch unit is the
  act or the article range and the cite marker is the split key.
- **Line wraps are typesetting.** The Courier text is hard-wrapped at
  narrow widths mid-sentence ("the repair of\ncollision-damaged"); a
  newline that is not followed by an indent marker or a `<br>` paragraph
  break is a soft wrap and joins with one space. Continuation indents
  inside outline items print as runs of NBSP mid-line; internal whitespace
  runs collapse to one space. A corpus test asserts no double spaces and
  no line ending mid-sentence.
- **Source notes**: `(Source: P.A. 90-426, eff. 1-1-98.)`, `(Source: P.A.
  102-69, eff. 7-1-22.)`, `(Source: P.A. 101-81, eff. 7-12-19; 102-550,
  eff. 8-20-21.)`, `(Source: P.A. 80-926.)`, `(Source: Laws 1921, p.
  508.)`. The newest `eff.` wins (two-digit years, pivot at 50; a
  four-digit form is accepted); `publicActs` records every act named; no
  `eff.` → no date on the citation.
- **Dual-printed sections** — decision 4. The markers `(Text of Section
  before amendment by P.A. N)`, `(Text of Section after amendment by P.A.
  N)`, `(Text of Section from P.A. N[, N and N])` open a version; each
  version carries its own source note; the cite marker prints once.
- **Absence is HTTP 200** with `div.billtext-scale` present and EMPTY (no
  tables, no cite markers) — verified with `ActID=999999`. Detected by the
  missing block AND by the manifest's named cites (a named cite absent
  from its page hard-fails).
- **Boilerplate inside the page**: the two-paragraph ILCS disclaimer above
  the text and the site footer/scripts below it are outside
  `div.billtext-scale`; the parser scopes to that div and never sees them.
  The text is UTF-8 with straight quotes; `&nbsp;` and `&quot;` decode
  through the shared `decodeEntities`.
- **A `Print=True` view** exists and is the same block markup with less
  chrome; not used, so the capture URL matches what a human sees.

### 3.2 Administrative Code: the whole-Part page

- **`/agencies/JCAR/EntirePart?titlepart=TTTPPPPP`** (`05000919`,
  `05600300`, `05600210`, `03500218`, `03500219`): the entire Part as
  UTF-8 HTML inside the same `div.billtext-scale` wrapper, opening with
  the Part's `AUTHORITY:` and `SOURCE:` block ("Adopted at 19 Ill. Reg.
  6576, effective May 2, 1995; amended at …"), then `SUBPART X:` headings
  and `Section 919.80 Required Claim Practices – …` heads, then the body,
  then `(Source: Amended at 26 Ill. Reg. 11915, effective July 22, 2002)`.
  Exhibits are `Section 919.EXHIBIT A …` and parse as sections. Parts 218
  and 219 are 2.5 MB each (536 sections); the parser must split without
  quadratic string work (the PA act parser is the precedent).
- **Per-section pages** (`/commission/jcar/admincode/050/050009190000800R.html`)
  exist but are **windows-1252** Word-exported HTML (`<p class=MsoNormal>`,
  `&#150;` en dashes) — the CO/PA encoding trap, one surface further. The
  whole-Part page is UTF-8 and carries the Part-level SOURCE the
  inheritance rule needs, so it is the ONE capture surface; the per-section
  page is documented as the fallback and the shared `decodeFetched` already
  handles its charset if ever needed.
- **Sections with no Source line** (210.440, 219.103): never amended since
  the Part's adoption; the effective date is the Part's own `Adopted …
  effective` date and the section records `dateSource: "part"` (the PA
  chapter-adoption rule).
- **Equation images**: 218.780(d)/219.780(d) print their formulas as
  `<img>`; the text keeps the "Where:" variable definitions. Recorded in
  the description; not a parser failure.
- **Absence is a real 404** on the per-section URL (verified); on the
  whole-Part page a named section missing from the Part hard-fails.

### 3.3 The fetch plan — 23 requests at a 10 s floor, about 4 minutes, ~9 MB

- Act pages (12): 815 ILCS 306, 308, 505 (674 KB for two sections); 770
  ILCS 45, 50; 820 ILCS 115, 105, 140, 192, 90, 305 (708 KB), 219.
- Article-range pages (6): 215 ILCS 5 Art. IX, Art. XXVI; 625 ILCS 5 Ch.
  1, Ch. 3 Art. I, Ch. 4 Art. II, Ch. 5 Art. III.
- Whole-Part pages (5): 50-919, 56-300, 56-210, 35-218, 35-219.
- The two listing pages (chapter 815 acts, Title 50 parts) are fetched
  by the drift checker only, as the renumbering tripwire.
- `captureSource` per section: `act`, `article`, or `part`; `/health`
  reports all three counts.
- robots.txt: allowed, `Crawl-delay: 10` — decision 1.

### 3.4 What was checked and not used

- `idoi.illinois.gov` Company Bulletins — read in full via the JSON feed;
  no shop-facing bulletin (decision 2). CB 2022-11 (rental reimbursement
  must cover comprehensive and collision) is coverage-form guidance, not
  claim handling; noted, not captured.
- 625 ILCS 5/4-216 — the storage-fee lienholder notice for commercial
  relocators and private towing services, the towing twin of 45/1.5; not
  shop-facing. 4-202, 4-208 — police-tow and municipal disposal.
- 625 ILCS 5 Chapter 18a — the Commercial Relocation of Trespassing
  Vehicles Law; rates are the Commerce Commission's, for relocators.
- 215 ILCS 5/143a (UM property damage), 143.10d (the data fee), 143.16,
  143.22, 143.29 (dual-printed cancellation/renewal sections — checked as
  parser fixtures, not captured).
- 820 ILCS 185 (construction-only), 820 ILCS 175 (day and temporary
  labor), 56 Ill. Adm. Code 300.900 (overpayment) — not captured; the
  first two are stated as absences.
- 35 Ill. Adm. Code 218.788/.789 and 219.788/.789 (testing, monitoring for
  control devices) — compliance procedure, not a shop's own duty.

## 4. Identity and citations

- Two codes: `ILCS` and `Ill. Adm. Code`. Display cites "815 ILCS 308/15",
  "215 ILCS 5/154.6", "625 ILCS 5/3-117.1", "770 ILCS 45/1.5", "50 Ill.
  Adm. Code 919.80", "50 Ill. Adm. Code 919.EXHIBIT A", "35 Ill. Adm. Code
  218.780". Ids `ilcs:815-308/15`, `ilcs:215-5/154.6`, `iac:50-919.80`,
  `iac:35-218.780`.
- The shared factory's bare-cite splitter cannot express `NNN ILCS
  NNN/NNN` (three parts) or `NN Ill. Adm. Code NNN.NNN`; Illinois resolves
  cites itself (the TX/FL/PA pattern) — settle by reading the factory
  first, as OH did.
- Input forms that resolve: "815 ILCS 308/15", "815 ILCS 308/15(b)"
  (subsection stripped — see the Backlog's cross-state item), "308/15"
  (act-qualified: unique when the act number is unique across captured
  chapters; "5/154.6" is NOT, because 215 ILCS 5 and 625 ILCS 5 are both
  captured, so a bare "5/…" resolves by the section token), "Section
  154.6 of the Insurance Code", "154.6", "Sec. 154.6", "919.80", "50 IAC
  919.80", "50 Ill. Admin. Code 919.80", "Part 919", "Exhibit A", "Section
  9 of the Wage Payment and Collection Act", id forms, and named aliases
  ("Automotive Collision Repair Act" → the 308 listing, "Automotive Repair
  Act" → 306, "Consumer Fraud Act" / "CFA" → 505, "improper claims
  practice" → 154.6 + Part 919, "unfair claims" → 154.6, "aftermarket
  crash parts" → 155.29, "total loss" → 919.80 + Exhibit A + 154.9 +
  154.10, "Section 155" / "vexatious" → 155, "repairer license" → 5-301,
  "Labor and Storage Lien Act" → 770/45, "Small Amount Act" → 770/50,
  "IWPCA" / "Wage Payment and Collection Act" → 115, "Minimum Wage Law" →
  105, "ODRISA" / "One Day Rest in Seven" → 140, "PLAWA" / "Paid Leave for
  All Workers" → 192, "Freedom to Work Act" → 90, "Workers' Compensation
  Act" → 305/4, "refinishing rule" / "VOM" → the 218/219 HH listing).
- **Bare section tokens resolve by EXACT match across the manifest**
  (`IL_CITE_TOKENS` built from the manifest); a token claimed by two
  sections resolves to null by design — "15" (306/15, 308/15, 192/15),
  "10" (306/10, 308/10, 90/10), "2" (505/2, 115/2, 140/2, 45/2, 50/2), "3"
  (115/3, 105/3, 140/3, 50/3), "4" (115/4, 105/4, 305/4), "1" (45/1, 50/1),
  "1.5" (45/1.5, 50/1.5) all collide and need the act; a structural test
  lists the collisions so adding a section that creates a new one is
  visible.
- `chapter` values: the act name for ILCS sections ("Automotive Collision
  Repair Act", "Illinois Insurance Code", "Illinois Vehicle Code"), the
  Part title for rules ("Part 919 Improper Claims Practice").
- Citations: "815 ILCS 308/15, effective 1/1/2004", "215 ILCS 5/154.6,
  effective 7/1/2022", "215 ILCS 5/155.29" (no date — P.A. 86-1234;
  86-1475 recorded), "770 ILCS 45/1" (no date — Laws 1921), "50 Ill. Adm.
  Code 919.80, effective 7/22/2002", "56 Ill. Adm. Code 210.440, effective
  5/2/1995" (dateSource part). Every date through `fmtDateUtc`. The silence
  path exists (eleven of 88 sections carry no printed effective date) and
  is the normal case for pre-1990s Public Acts, not a parser gap.
- Per-section extras: `publicActs` (ILCS), `formerCite` (ILCS codes),
  `versionNote` + `printedVersions` (dual-printed), `futureEffective`,
  `illRegCite` (Administrative Code, "26 Ill. Reg. 11915"), `dateSource`
  (`section` | `part`), `captureSource` (`act` | `article` | `part`).
- No edition pin, no currency pin (the OH/CA/PA pattern). Drift is text
  drift; a dual-print resolution that flips (the after-text's date
  arriving) is drift and the checker flags it.

## 5. Package/app shape, tools, tests, deploy

`packages/state-il` (schema with the extras above, four domains, two
codes; taxonomy; one manifest `sources.ts` naming every cite with its
code, domain, fetch unit, and — for the codes — the article range; one
statute parser `parse-ilcs.ts` for the section block with the two
catchline variants, the soft-wrap join, the source-note date rule, and the
dual-print version selector; one rule parser `parse-iac.ts` for the
whole-Part page with the Part SOURCE inheritance; one capture pipeline
`capture.ts` with the 10 s floor and the hard-fails (missing named cite,
empty block, a named cite whose only version is future-effective without
the flag, a moved article range); identity; four `il_*` tools + the
connector pair with freshness passed), `apps/state-il-server` (same
worker.ts shape; `/health` adds `captureSources` {act, article, part},
`dualPrinted` (the cites resolved by decision 4 and which version won),
and the four-domain breakdown; no currency pin field), registry entry
`il`, `IL-LAW-ATTENTION.txt`.

No PDF or Word reader: every surface is HTML. Nothing new lands in
`packages/state-law` unless the identity factory needs the `NNN/NNN` shape
(it will not — Illinois resolves itself) or the dual-print selector proves
reusable (Michigan's legislature.mi.gov does not dual-print; leave it in
state-il).

Demo gauntlet (shop phrasing; the annotation vocabulary is the bridge):

1. "insurer says they only pay $X an hour for paint and materials" → 215
   ILCS 5/154.6 first, with the (j) excerpt in `quoteSafeExcerpts`
2. "insurer wrote it for 20 hours and I can't repair it for that" → 50
   Ill. Adm. Code 919.80 first, with the (d)(6) name-a-shop-or-reimburse
   excerpt
3. "the adjuster told my customer to take it to their DRP shop" → 919.80
   first ((d)(1)(B)), with the no-statutory-ban note; 154.6 top 3 ((p)/(q))
4. "insurer cut off storage on the total loss with no notice" → 919.80
   first ((d)(3)); "insurer wants to leave the salvage here for the
   storage bill" → 919.90 first ((e))
5. "betterment on tires and a battery" → 919.80 first ((d)(4), the $500
   cap)
6. "they lowballed the total loss value" → 919.80 first ((c)(2)); "customer
   can't find a car for that money" → 919.80 first ((c)(2)(F)); "does the
   insurer owe the sales tax" → 154.9 first; "customer wants to know how
   they came up with the number" → 154.10 first; "does it need a salvage
   title / can the customer keep the car" → 625 ILCS 5/3-117.1 first
7. "insurer hasn't done anything in three weeks" → 919.40 or 919.50 first;
   "40 days and no decision" → 919.80 first ((b)(2)); "denied with no
   reason given" → 919.50 first ((a)(1))
8. "can I sue the insurer for bad faith" → 155 top 3 with the
   no-tort/first-party-only note
9. "aftermarket parts on the estimate and the customer never knew" → 155.29
   first; 919.80 top 3 ((d)(5)(C))
10. "do I need written authorization before I start" → 815 ILCS 308/15
    first; "job ran ten percent over the estimate" → 308/15 or 308/25 first;
    "customer wants his old parts back" → 308/30 first; "can I charge for
    teardown if they don't approve the repair" → 308/15 first ((e)); "what
    has to be on the final invoice" → 308/40 first; "what sign do I have
    to post" → 308/50 first; "does the Automotive Repair Act apply to my
    body shop" → 306/83 or 308/80 first
11. "customer never picked the car up, it's been a month" → 770 ILCS
    45/1.5 or 50/1.5 first (the lienholder notice), 45/1 and 50/2 top 3;
    "can I sell the car for the bill" → 50/2 first (under $2,000), 45/2 or
    45/6 top 3; "can I have it towed as abandoned" → 625 ILCS 5/4-201 first
    with the bailee exception stated
12. "do I need a license to run a body shop in Illinois" → 625 ILCS 5/5-301
    first; 1-171.3 top 3; "insurer's estimate says repairers must be
    licensed" → 154.6 first ((q))
13. "tech quit Friday, when do I have to pay him" → 820 ILCS 115/5 first;
    "wages are late" → 115/4 first; 115/14 top 3
14. "deducting a comeback or a broken tool from a tech's pay" → 56 Ill.
    Adm. Code 300.820 or 820 ILCS 115/9 first; 300.850 and 300.720 top 3
15. "overtime for a flat-rate tech" → 820 ILCS 105/4a first with the
    dealership-only exemption note; 210.440 top 3; "what's minimum wage
    this year" → 105/4 first
16. "do I have to give the painter a lunch break" → 820 ILCS 140/3 first;
    "can I make a tech work seven days" → 140/2 first; "how much paid time
    off do I owe" → 192/15 first; "can I make a tech sign a non-compete" →
    90/10 first
17. "1099 tech, no comp policy" → 820 ILCS 305/4 first with the
    construction-only ABC note; "do I have to follow Illinois OSHA" →
    219/15 first
18. "VOC limits on refinish coatings in Chicago" → 218.780 first with the
    county note; "do I need HVLP guns" → 218.784 or 219.784 first; "I'm in
    Belleville" → 219.780 first; "I'm in Peoria" → the description's
    no-state-rule statement
19. exact cite short-circuits ("815 ILCS 308/15", "Section 154.6 of the
    Insurance Code", "50 IAC 919.80", "Exhibit A", "770 ILCS 45/1.5");
    "Automotive Collision Repair Act", "Part 919", "IWPCA" listings; the
    structural collision test; the three dual-print fixtures (before/after
    by date, "from" by newest date, future-effective flag); the Part
    SOURCE inheritance test (210.440, 219.103); the soft-wrap join test;
    the formerCite strip test.

Deploy: `il.repairmcp.com` custom domain, `workers_dev: false`, burst-test
the zone WAF rule on the new hostname (the Backlog's first entry: it fired
on pa. and oh., not on fl./ca./deg./ny.). Site flips to twelve sources, one
setup; /legal names the General Assembly and the Joint Committee on
Administrative Rules and says the site's robots.txt invites the crawl at
its stated delay.

## 6. Risks

- **Dual-printed sections are live in the manifest today** (115/9, 105/3,
  305/4), so decision 4's rule is exercised on the first capture, not
  someday. 105/3's two "from" versions differ in text; the payload's
  `versionNote` is what keeps a shop from quoting the version the site
  happens to print first.
- **The ILCS database can print a not-yet-effective amendment as the
  only version.** The site says so. `futureEffective` and the capture
  warning are the mitigation; a future-dated named cite is a review item,
  not a silent capture.
- **Length bias.** 305/4 (62 KB), 919.80 (19 KB), 115/9 (16.9 KB),
  3-117.1 (13.5 KB), 192/15 (11.6 KB), 5-301 (11.3 KB), 105/3 (10.9 KB)
  are long; the demo suite pins the headliners and the annotation layer
  carries the routing. Same cross-state scorer candidate noted under CO,
  CA, FL, NY, PA, OH — now with ten corpora.
- **Whole-Part pages of 2.5 MB** for Parts 218 and 219, fetched for six
  sections each. The per-section windows-1252 pages are the documented
  fallback if the size ever matters; today it is 5 MB every four weeks.
- **The article ranges are opaque sequence numbers.** A re-sequenced
  Insurance Code moves 154.6 out of 51000000–67200000; the capture
  re-reads the ranges from the act page each run and hard-fails on a
  named cite missing from its range rather than silently capturing an
  adjacent article.
- **The mechanic overtime exemption will be misread.** 105/4a(2)(A) is
  dealership-only; every payload for 4a carries that note, because a shop
  quoting it for an independent body shop's flat-rate techs is wrong.
- **Two "5/" acts.** 215 ILCS 5 and 625 ILCS 5 are both captured; the
  identity tests pin that "5/154.6" and "5/3-117.1" resolve by section
  token and that a bare "5" resolves to nothing.
