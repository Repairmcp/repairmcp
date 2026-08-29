# Kickoff spec: Colorado state vertical (state #3)

Written 2026-08-28, approved the same day. This is the record of the
decisions for the Colorado build, the way `docs/WA-VERTICAL-KICKOFF.md` is for
Washington. Read `docs/ARCHITECTURE.md` for the core abstractions and the
CLAUDE.md state-law sections for what `packages/state-law` already provides —
this file is only what is specific to Colorado.

**Why now:** the DEG's administrator is based in Colorado, and outreach with
the DEG MCP server happens next week; having `co.repairmcp.com` live by then
is a goodwill gesture. Consequence for quality: the first audience is an
estimating and claims expert who will stress-test the insurance domain with
real questions. The claims-handling corpus must be airtight and every absence
stated honestly rather than papered over.

**Scope decision (2026-08-28):** all three optional layers are IN for
v1 — the PUC towing rules subset, DOI Bulletin B-5.04, and DOI Reg 5-2-12 —
on top of the core CRS + DOI regs + COMPS corpus.

---

## 1. Success criteria

- `https://co.repairmcp.com/mcp` live, verified on the wire, before the
  outreach next week.
- The demo gauntlet (§7) passes as ranking assertions against the real corpus.
- Every honest-absence and honest-caveat item (§2.6) is stated in tool
  descriptions or annotations — a wrong answer an expert catches costs more
  than a stated gap.
- WA and MT behavior byte-identical throughout: any `packages/state-law`
  change this build needs must keep the golden panel and all existing state
  tests green with zero edits.

## 2. Corpus manifest

Roughly 50–60 sections across three domains: `insurance`, `repair_law`,
`employment`. No `safety` domain — Colorado has no state OSHA plan (federal
OSHA covers private employers); that absence is stated in tool descriptions,
the MT precedent.

### 2.1 Insurance — CRS Title 10

| Citation | What it is | Why it matters |
|---|---|---|
| CRS 10-4-120 | "Unfair or discriminatory trade practices" — the anti-steering statute. (2)(a)–(i) prohibited insurer acts (requiring a specific shop, misrepresenting that choice affects payment, coercion/incentives, kickback referral arrangements, unreasonable travel distance…); (3)(a)–(g) required acts, incl. disclosure of free shop choice | The centerpiece. (3)(e) — "Assume all reasonable costs sufficient to pay for the beneficiary's or claimant's repairs including materials or parts" — is the CO analog of MT's 33-18-224(iii) demo clause |
| CRS 10-3-1104 | Unfair methods of competition — (1)(h) enumerates the unfair claim settlement practices (misrepresenting policy provisions, failure to promptly/reasonably investigate, no good-faith attempt at prompt fair settlement, …) | The UCSP catalog every dispute letter leans on. **Caveat to annotate: DOI enforcement only, no private right of action** |
| CRS 10-4-639 | "Claims practices for property damage" | Total loss: insurer must pay title/registration/sales tax, must use a fair and consistent valuation method considering the vehicle's unique characteristics, must disclose towing/storage benefits and excess-charge exposure |
| CRS 10-3-1301 … -1306 | The Model Quality Replacement Parts Act, whole part (short) | 10-3-1305: every non-OEM crash part identified on the written estimate with a mandated 10-point-type warranty disclosure. A statute MT does not have |

### 2.2 Insurance — DOI regulations (3 CCR 702-5) and bulletin

| Citation | What it is | Why it matters |
|---|---|---|
| Reg 5-1-14 | "Penalties for Failure to Promptly Address Property and Casualty First Party Claims" | The 60-day decide-or-pay deadline — the supplement-sitting scenario |
| Reg 5-2-15 | "Consumer Protection for Vehicle Valuation and Rental Reimbursement" | The total-loss valuation rule (NOT 5-2-12, which early research guessed) |
| Reg 5-2-12 | "Automobile Insurance Consumer Protections" | Premiums, cancellation/nonrenewal, surcharges — adjacent, cheap to include since 702-5 arrives as one document |
| DOI Bulletin B-5.04 | "Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged Property", reissued 2016-09-19 | The DOI's own compliance guidance on 10-4-120's disclosure/payment duties. **Guidance, not law — tool text and annotations must say so plainly** |

### 2.3 Repair law — CRS

| Citation | What it is | Why it matters |
|---|---|---|
| CRS 42-9-101 … -113 | Motor Vehicle Repair Act, whole article (~16 sections incl. 108.5, 108.7, 109.5) | **Not repealed.** Written estimate/consent (104–105), over-estimate and storage-charge caps (106), used/reconditioned parts disclosure (107), invoice content (108), warranties (108.5/108.7), return of replaced parts (109), airbags (109.5), prohibited acts (111), penalties (112–113) |
| CRS 6-1-105 | Colorado Consumer Protection Act deceptive-practices catalog (one long section) | (1)(e) service misrepresentation, (1)(l) price statements, (1)(n) bait-and-switch, (1)(u) failure to disclose material information, (1)(rrr) catch-all. Case law requires "significant public impact" for private claims — annotation caveat, not statute text |
| CRS 42-4-2103 | Towing without authorization / notification | The statute 4 CCR 723-6 enforces; an unauthorized tow forfeits the right to charge |

### 2.4 Repair law — PUC towing rules (4 CCR 723-6, filtered subset)

The towing-carrier rules only (the 6500-series: PPI tows, storage-charge
caps, 24-hour proration, the 120-day abandoned-vehicle cap). The 723-6 series
document is the whole transportation rulebook and is enormous — the manifest
entry is a hard filter and a corpus test asserts the parent never leaked in,
the same discipline WA applies to WAC 296-62.

### 2.5 Employment

| Citation | What it is | Why it matters |
|---|---|---|
| CRS 8-4-103 | Wage Act: payment of wages, pay statements | Pay period / payday rules |
| CRS 8-4-105 | Payroll deductions permitted | Tool accounts, uniforms, written-agreement deductions; FLSA floor |
| CRS 8-4-109 | Termination — payments required | Final pay on separation; the entrusted-property audit carve-out; 10-day demand-and-cure |
| 7 CCR 1103-1 (COMPS Order #40, filtered subset) | Coverage/exemptions (incl. Rule 2.4.1), overtime, meal periods (30 min > 5 hr), rest periods (paid 10 min per 4 hr) | The painter-breaks and flag-hour questions. 2026 minimum wage $15.16/hr |

### 2.6 Honest caveats and absences (annotation/description content, verbatim intent)

1. **No state OSHA plan** — federal OSHA governs private Colorado shops.
   Stated in tool descriptions.
2. **CRS 10-3-1104 carries no private right of action** — DOI enforcement
   only. Annotated on the section.
3. **The DOI's OEM-procedures position**: in 2018 (the Nylund's Collision
   Center / State Farm dispute, reported by Repairer Driven News) the DOI
   publicly declined to adjudicate whether refusing a specific OEM procedure
   is "unreasonable" under 10-4-120. The statute has teeth; the regulator has
   publicly disclaimed enforcing that specific reading. Annotated on
   10-4-120, not hidden.
4. **COMPS Rule 2.4.1's overtime exemption says "dealers"** — salespersons,
   parts-persons, and mechanics of automobile/truck/farm-implement *dealers*.
   Whether an independent body shop qualifies is an open question the tools
   must surface as open, never answer as settled.
5. **COMPS Order #40 carries amendments effective 2026-02-01** — the capture
   states the version it took.

## 3. Capture surfaces and architecture

`packages/state-co` follows the MT shape: profile + parsers + data, registered
in `scripts/state-registry.ts`, driven by the existing `capture-state.ts` /
`check-state.ts`. Registration alone puts Colorado in the 4-week scheduled
drift check with its own `CO-LAW-ATTENTION.txt`. Politeness is the house
standard via `makeCaptureIo` (2 s delay, `RepairMCP-Bot/1.0` UA). Three
parser families:

### 3.1 CRS — whole-title HTML from the OLLS

- **Source:** `https://olls.info/crs/crs2026-title-NN.htm` (also `.pdf` /
  `.docx`), discovered from the download index at
  `https://content.leg.colorado.gov/agencies/office-legislative-legal-services/2026-crs-titles-download`.
  This is the Office of Legislative Legal Services' own publication — the
  practical official surface. LexisNexis is the contractual publisher but its
  site is sign-in-gated and session-blob-addressed: not a capture surface.
- **Titles fetched:** 6, 8, 10, 42 — four fetches plus the index page.
- **Format:** server-rendered plain HTML, one page per title, no per-section
  anchors. Sections split on the text convention `NN-N-NNN.  Caption.` at
  line starts — the closest existing kin is the OLRC chapter-view parser in
  `scripts/capture-uscode.ts`, not WA/MT's anchor parsing.
- **Currency tripwire:** the download index states its currency in prose
  ("current with the changes made by … the Seventy-fifth General Assembly at
  its Second Regular Session in 2026"). The capture hard-fails if the line is
  missing and warns (with a pinned-constant test, the MCA_EDITION pattern) if
  its session/year changes — the yearly rollover must require a human.
- **robots.txt:** olls.info disallows only `/crs-archive/`; the live `/crs/`
  files are unrestricted. Verified 2026-08-28.

### 3.2 CCR — two-tier SOS crawl, DOCX parse

- **Source:** `https://www.coloradosos.gov/CCR/` — an ASP webforms app,
  server-rendered (not a SPA). Browse path per series:
  `NumericalDeptList.do` → `NumericalCCRDocList.do?deptID=…&agencyID=…` →
  `DisplayRule.do?action=ruleinfo&ruleId=…`. Confirmed: 3 CCR 702-5 is
  `ruleId=2201` under Dept 700 (DORA) / Agency 702 (Division of Insurance);
  723-6 (PUC) and 1103-1 (CDLE) live under their own dept/agency pairs, to be
  resolved at capture and pinned in the sources manifest.
- **Two-tier, like MT's MCA slot URLs:** `DisplayRule.do` yields the current
  `ruleVersionId` — regexed from inline JS (`javascript:void(0)` download
  links), no headless browser needed — plus the version's adopted and
  effective dates and eDocket tracking number.
- **Granularity:** the SOS serves one document per SERIES (3 CCR 702-5 is a
  single ~1.1 MB file holding every Regulation 5-x-x). We fetch the **DOCX**
  (the SOS's stated accessible alternative; the PDF is the official
  rendering) and split it into individual regulations ourselves. LII/Justia
  per-reg pages are their own re-splitting, not an official granularity — not
  a capture source.
- **DOCX parsing** is new machinery: unzip + XML text extraction. The
  dependency lives in the capture scripts / package dev path only — never the
  Worker barrel, which stays pure data + logic.
- **Series captured:** 702-5 (filtered to Regs 5-1-14, 5-2-15, 5-2-12),
  723-6 (filtered to the towing 6500-series), 1103-1 (filtered to the COMPS
  rules in §2.5).
- **Effective dates:** prefer the regulation's own stated effective date from
  its text; else the version effective date the SOS states on
  `DisplayRule.do` (a stated fact, not a guess). Never invent one.
- **Drift:** the cheapest check in the platform — poll `DisplayRule.do` per
  series and compare version/effective date before fetching any document.
- **robots.txt:** disallows `/CCR/KeywordSearch.do`, `/CCR/Rule.do`,
  `/CCR/NumericalSubDocList.do`; the browse-then-download path above is
  clean. Avoid the keyword-search endpoint specifically. Verified 2026-08-28.

### 3.3 Bulletin — one PDF

B-5.04 from the DOI's own site (official landing page to be confirmed at
capture — the researcher verified the document via a mirror; the capture must
come from the DOI). PDF text extraction with a scripts-only dependency;
content-hashed for drift like ARM. If extraction fidelity is poor, that is a
stop-and-decide, not a silent ship.

## 4. Identity and citations

- **Bare hyphenated triples resolve to CRS** (`10-4-120` → CRS) — the
  dominant code, the role bare hyphens play for MCA in Montana. Regulation
  and bulletin queries need a prefix (`3 CCR 702-5-1-14`, `Reg 5-1-14`,
  `COMPS Rule 5.2`, `B-5.04`); COMPS rules are additionally resolvable by
  their dotted rule number alone (`2.4.1`) since dotted cites occur nowhere
  else in this corpus.
- **Display cites** follow practitioner convention: `CRS 10-4-120`,
  `3 CCR 702-5-1-14`, `4 CCR 723-6-6511`, `7 CCR 1103-1-5.2` (citation note
  carries "COMPS Order #40"), `Colorado DOI Bulletin B-5.04`. Exact factory
  config (code segmentation, id namespace) is plan detail; the rendered forms
  above are the contract tests pin.
- **Dates:** CRS citations carry the **edition note** ("2026 edition") — CRS
  prints session-law history, never effective dates; silence over guess, the
  MCA precedent. CCR citations carry real effective dates per §3.2. The
  bulletin carries its reissue date (2016-09-19).
- Colorado is the first state with more than two citation codes. If
  `makeStateIdentity` needs generalizing (multi-word code tokens, keyword
  resolvers), the change lands in `packages/state-law` as config surface —
  and §1's byte-identical constraint applies.

## 5. Package and app shape

```
packages/state-co/        @repairmcp/state-co
  src/schema.ts           CoSection/corpus schemas; code + domain enums
  src/taxonomy.ts         topics + cite-prefix baseline map
  src/identity.ts         CO_IDENTITY, the makeStateIdentity config, CRS edition pin
  src/sources-crs.ts      title manifest + section filters
  src/sources-ccr.ts      series manifest (dept/agency/ruleId) + rule filters
  src/parse-crs.ts        whole-title HTM section splitter + currency tripwire
  src/parse-ccr.ts        DOCX → text → per-regulation splitter
  src/capture-crs.ts      index page + title fetches
  src/capture-ccr.ts      DisplayRule.do walk → ruleVersionId → DOCX
  src/capture-bulletin.ts B-5.04 PDF fetch + extract + hash
  src/capture.ts          CO_CAPTURE_PROFILE composing all three
  src/corpus.ts, tools.ts, adapter.ts, openai.ts, notes.ts   thin MT-shaped wiring
  data/co-law-corpus.json + co-annotations.json
  test/                   parser fixtures, identity, demo gauntlet, structural suites

apps/state-co-server/     Worker only, route co.repairmcp.com, workers_dev false,
                          no cache, zero outbound; /health = corpus meta + domains
                          + crsEdition
```

## 6. Tools, server, deploy

- Four `co_*` tools (`co_search_authority`, `co_get_authority`,
  `co_find_supporting_authority`, `co_build_rebuttal_packet`) + connector
  `search`/`fetch` — all from the state-law generic builders, freshness
  passed. No new tool code expected.
- Deploy runbook: DNS + custom domain for `co.repairmcp.com`, `wrangler
  deploy`, `/health` readback, then verify the zone WAF rate limit live on
  the new hostname (expect 429s at exactly 20/10 s — the wa/mt pattern).
- Site: flips from four sources to five; example prompts tested against the
  live corpus before publishing; copy linter is the gate. `/legal` reviewed
  for anything Colorado-specific (expected: nothing — pure corpus, zero
  outbound, like WA/MT).
- CLAUDE.md: build-status row, commands, gotchas learned during capture.

## 7. Demo criteria (the expert gauntlet)

Ranking assertions against the real corpus, the MT pattern. The scenario
phrasing is shop-floor language, not statute language:

1. "Adjuster says I have to use their network shop" → CRS 10-4-120 first.
2. "Insurer won't pay for the OEM procedure / short-paying the repair" →
   CRS 10-4-120 with the (3)(e) verbatim excerpt (and the §2.6.3 caveat
   surfaced).
3. "Estimate has non-OEM parts and nobody told the customer" → CRS 10-3-1305.
4. "Supplement has been sitting for two months" → Reg 5-1-14 (60 days).
5. "Total loss — do they owe sales tax and registration?" → CRS 10-4-639.
6. "Customer never authorized the extra work / bill over the estimate" →
   CRS 42-9-104/-106.
7. "Storage charges after a tow" → CRS 42-9-106 + the 723-6 towing rules.
8. "Do my painters get breaks?" → COMPS rest/meal rules.
9. "Are my flag-hour techs overtime-exempt?" → COMPS 2.4.1 **with the
   "dealers" caveat surfaced, not settled**.
10. "Tech quit and still has my tools — his last check?" → CRS 8-4-109.

Plus the structural suites every state gets: no-dead-topic (every topic
reaches a section), annotation-key enforcement, excerpt-substring
enforcement, the CRS edition pin, and giant-series leak tests for 723-6 and
1103-1.

## 8. Testing

- Parser tests run from saved fixtures (`--save-raw` / `--from-dir`), no
  live fetches in CI — the house pattern.
- The demo gauntlet (§7) as ranking assertions against the committed corpus.
- Identity round-trips for every code form and bare-cite ambiguity case.
- If `packages/state-law` changes: golden panel + all WA/MT tests green with
  zero edits, wire responses byte-identical — the extraction-day standard.

## 9. Risks

1. **Title 8 PDF-only supplement.** Titles 8, 14, 30, 39 keep SOME sections
   in `crsYYYY-statute-pdfs.zip` rather than the title HTM. Whether
   8-4-103/-105/-109 are affected is verified at first capture; worst case
   those three sections parse from the supplement PDF.
2. **CCR DOCX internals unseen.** The split convention inside the 702-5
   document (how "Regulation 5-1-14" headers render in the XML) is unknown
   until first fetch. Budget parser iteration; `--save-raw` from fetch one.
3. **B-5.04's official landing page unconfirmed** — the DOI hosts documents
   awkwardly at times. Capture must come from the DOI, not a mirror.
4. **723-6 is enormous.** The filter is load-bearing; the leak test is the
   backstop.
5. **Research provenance.** §2's citations were verified at mixed strength
   (official fetches, mirror fetches, search snippets). The capture itself is
   the final verification: every section's text comes from the official
   surface at capture time, and a manifest entry that doesn't parse cleanly
   is a stop-and-look, not a skip.

## 10. Out of scope / deferred

- Other DOI bulletins (B-5.26 on appraisal disputes is the first candidate
  when bulletins earn a second slot).
- PUC rules beyond the towing subset; CCPA beyond 6-1-105.
- Any STDIO entry (Worker only, like WA/MT).
- Case-law annotations beyond the two caveats in §2.6 (no case-law corpus —
  statutes and regs only, the platform line).
