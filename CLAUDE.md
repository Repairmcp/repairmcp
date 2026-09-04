# RepairMCP — Claude operational notes

Companion to `docs/ARCHITECTURE.md` (the build spec). This file is the operational manual: where things live, how to build/test, what conventions matter, where we are in the build sequence.

---

## Project shape

Monorepo. pnpm workspaces, Turborepo orchestration, Bun for runtime + test.

```
packages/core/        @repairmcp/core   — vertical-agnostic abstractions
  src/adapter/        SourceAdapter, BaseItem, SearchQuery, etc.
  src/citation/       Citation type + buildCitation (UTC-locked)
  src/server/         RepairMCPServer, tool-builder (4 standard tools)
  test/               citation tests (TZ invariance)

packages/deg/         @repairmcp/deg    — DEG vertical (the first one)
  src/schema.ts       DEGInquiry Zod schema
  src/scraper.ts      Cheerio parser + fetchInquiry + IP classifier
  src/adapter.ts      DEGAdapter (in-memory, fromJsonFile loader)
  src/ports.ts        DegSource — the interface both adapters satisfy
  src/identity.ts     DEG_IDENTITY + formatDegCitation (one producer, both adapters)
  src/filters.ts      parseFilters / inquiryMatchesFilters (shared)
  src/text-match.ts   Search coverage scoring + snippets (shared)
  src/scoring.ts      Killer scoring for find_supporting (bigram + unigram + IP/vehicle/op/recency)
  src/tools.ts        DEG tool builders + registerDegTools(server, adapter)
  src/openai.ts       ChatGPT connector search/fetch + degInquiryToDocument
  src/d1/             D1Like interface, row mapping, FTS5 query building, D1DEGAdapter
  src/worker.ts       Worker-safe barrel → `@repairmcp/deg/worker` (no cheerio, no node:fs)
  test/               scoring (24) + d1-adapter (22) + parity (18) + full-corpus parity (23)

apps/deg-server/      @repairmcp/deg-server — STDIO entry + Cloudflare Worker
  src/stdio.ts        Local STDIO entry for Claude Desktop
  src/worker.ts       Cloudflare Worker: /mcp (stateless Streamable HTTP), /health
  src/cache.ts        Tool-result cache over caches.default
  wrangler.jsonc      Worker + D1 config. workers_dev deliberately false.
  tsconfig.worker.json  Separate program — CF types collide with @types/node
  migrations/0001_schema.sql   base tables + indexes
  migrations/0002_data.sql     GENERATED, 25.5 MB, gitignored
  migrations/0003_fts.sql      FTS5 virtual table + rebuild + sync triggers
  data/sample-inquiries.json        50 hand-curated DEG inquiries
  data/deg-inquiries-full.json      the served corpus — 22,773 records, gitignored
  dist/stdio.js       The path Claude Desktop spawns

packages/nhtsa/       @repairmcp/nhtsa  — NHTSA vertical (live + law corpus hybrid)
  src/client.ts       NhtsaClient — recalls/complaints/vPIC over injected fetchImpl,
                      per-endpoint date parsing, 400→model-vocabulary fallback
  src/urls.ts         every NHTSA URL builder; src/redact.ts VIN redaction choke point
  src/schema.ts       Zod records (recall incl. parkIt/parkOutSide/unitsAffected)
  src/relevance.ts    complaint relevance scorer (keyword/category/severity/recency)
  src/laws/           49 U.S.C. ch. 301 corpus: schema, OLRC parser, search, LawCorpus
  src/identity.ts     NHTSA_IDENTITY + all three citation producers + id namespace
  src/live.ts         live-source freshness: LIVE_SENTENCE, callNhtsa, unavailablePayload
  src/adapter.ts      NhtsaLiveAdapter — composite SourceAdapter (recall:/complaint:/law:)
  src/parse-query.ts  connector free-text vehicle parser (known-makes list)
  src/resolve-vehicle.ts  shared vin-or-YMM input resolution
  src/tools.ts        the seven nhtsa_* tools; src/openai.ts connector search/fetch
  data/uscode-title49-ch301.json  the committed law corpus (47 sections, ~163 KB)
  test/               74 tests

apps/nhtsa-server/    @repairmcp/nhtsa-server — Cloudflare Worker only (no STDIO)
  src/worker.ts       /mcp (stateless Streamable HTTP), /health (live NHTSA probe
                      + law corpus meta); law corpus loaded once per isolate
  src/cache.ts        createCachingFetch — 6h TTL upstream response cache;
                      vPIC and VIN-bearing URLs never cached
  wrangler.jsonc      route nhtsa.repairmcp.com, workers_dev false, no D1

packages/state-wa/    @repairmcp/state-wa — Washington state law vertical (pure corpus)
  src/schema.ts       WaSection/corpus/annotation Zod schemas; four domains
                      (insurance, repair_law, safety, employment)
  src/taxonomy.ts     30 topics + cite-prefix baseline map (longest prefix wins)
  src/sources.ts      the capture manifest + applyFilter (chapter/prefix/sections)
  src/parse.ts        leg.wa.gov chapter-page parser: anchor split (prelude discard
                      IS the repealed filter), anchor/number cross-check tripwire,
                      history-note → effectiveDate (NEWEST effective wins; RCW notes
                      carry no dates — omission is the normal path)
  src/search.ts       coverage scorer (ported from nhtsa/laws) + query stoplist
  src/identity.ts     WA_IDENTITY, wac:/rcw: ids, resolveCitationQuery,
                      formatWaCitation ("WAC 284-30-330, effective 10/30/2016")
  src/corpus.ts       WaCorpus — one ranking for search + find_supporting
                      (0.65 base + 0.25 use-case coverage + 0.1 phrase);
                      constructor enforces annotation-key + excerpt-substring
  src/tools.ts        the four wa_* tools; src/openai.ts connector (freshness PASSED
                      to the builders — pure corpus, the opposite of NHTSA)
  src/capture.ts      the pure half of capture: groupByChapter, assembleSections,
                      diffCorpus — shared by capture-waleg AND check-waleg so the
                      writer and the drift checker cannot disagree about "changed"
  data/wa-law-corpus.json   670 verbatim sections, 1.83 MB, committed
  data/wa-annotations.json  hand-maintained topics/useCases/quote-safe excerpts
  test/               94 tests incl. the six kickoff demo criteria as ranking
                      assertions against the real corpus

apps/state-wa-server/ @repairmcp/state-wa-server — Cloudflare Worker only
  src/worker.ts       /mcp (stateless), /health (corpus meta + domain breakdown);
                      no cache.ts, no upstream — zero outbound requests
  wrangler.jsonc      route wa.repairmcp.com, workers_dev false, no D1

packages/state-law/   @repairmcp/state-law — the shared state-vertical machinery
                      (extracted at state #2, proven byte-identical to pre-
                      extraction WA via the golden panel + wire diffs): generic
                      schemas, the base scorer with parameterized stopwords, the
                      citation identity FACTORY (bare-cite inference is config:
                      hyphens=WAC in WA, hyphens=MCA in MT), StateLawCorpus over
                      a CorpusProfile, the four generic tool builders (field
                      order is wire-visible and preserved), StateLawAdapter,
                      connector registration with freshness, corpus diff, and
                      the CaptureIo/StateCaptureProfile contract the scripts
                      consume. State packages are profile + parsers + data.
                      Added at CO: `CaptureIo.fetchBinary` (optional — WA and
                      MT never needed it), the hook that lets a state's
                      capture profile fetch raw bytes for a PDF document
                      (the CCR rule PDFs, the DOI bulletin) rather than text;
                      state-co is the only package that wires it.

packages/state-mt/    @repairmcp/state-mt — Montana vertical (pure corpus)
  src/parse-mca.ts    mca.legmt.gov section-page parser: edition-marker
                      tripwire ("Montana Code Annotated 2025" — the currency
                      analog of OLRC currentthrough), citation-span cross-check
  src/capture-mca.ts  two-tier crawl (part sections_index.html resolves slot
                      URLs that are NOT derivable from cites, then per-section)
  src/capture-arm.ts  ARM via the SOS public JSON API at rules.mt.gov (the
                      website is a JS SPA; the API is the capture surface):
                      tree walk by sectionId, per-rule ISO effective dates,
                      SHA-256 contentHash recomputed over the fetched document
  src/identity.ts     MCA cites carry the EDITION ("MCA 33-18-224, 2025
                      edition" — statutes state no per-section dates); ARM
                      cites carry real effective dates; MCA_EDITION pin test
                      makes the yearly rollover fail loudly at re-capture
  data/               mt-law-corpus.json (119 sections, 260 KB) + annotations
  test/               59 tests incl. the ten demo criteria and a structural
                      no-dead-topic test (every topic reaches a section)

apps/state-mt-server/ @repairmcp/state-mt-server — Worker, mt.repairmcp.com,
                      same shape as state-wa-server; /health adds mcaEdition

packages/state-co/    @repairmcp/state-co — Colorado vertical (pure corpus,
                      THREE publishers)
  src/parse-crs.ts    OLLS whole-title HTML parser: fetches an entire CRS
                      title in one document, splits on the bold `NN-N-NNN.`
                      section-head text (OLLS titles carry no anchors), filters
                      to the manifest's cites — the currency analog of NHTSA's
                      currentthrough marker is CRS_EDITION (identity.ts),
                      pinned so the yearly rollover fails loudly
  src/parse-ccr.ts    Code of Colorado Regulations parser over the Secretary
                      of State's rule-info + document PDFs
  src/capture-crs.ts  CRS capture: whole-title fetch, section-head-text split
                      (no anchors), manifest filter (sources-crs.ts)
  src/capture-ccr.ts  CCR two-tier crawl: NumericalCCRDocList resolves each
                      rule series' current document version, then the PDF
                      itself is fetched and parsed (io.fetchBinary). The
                      version SHORTCUT (skip the re-fetch when the SOS
                      ruleVersionId is unchanged) also requires the previous
                      cite set still match the CURRENT manifest filter — an
                      unchanged version alone once let a manifest edit
                      (regCite added/removed, prefix narrowed/widened) ship
                      the stale cite set with no signal; a WIDENED prefix
                      still can't be detected this way, so the shortcut's log
                      line names that residual and says to force a refetch
  src/capture-bulletin.ts  DOI Bulletin B-5.04 PDF capture, with the
                      extraction-fidelity tripwire (a page parsing to
                      near-nothing against a populated prior version aborts
                      rather than silently shrinking the corpus)
  src/pdf-text.ts     unpdf wrapper, loaded via dynamic `import()` so the
                      Worker bundle never pulls in the PDF library — nothing
                      the worker statically imports reaches this module
  src/identity.ts     CRS cites carry the EDITION ("CRS 10-4-120, 2026
                      edition" — CRS prints session-law source notes, never
                      effective dates); CCR cites carry real effective dates;
                      the bulletin carries its issue date; CRS_EDITION pin
                      test makes the yearly rollover fail loudly at
                      re-capture; resolveCoCitationQuery handles CRS
                      point-five sections, four-group CCR cites, DOI "Reg"
                      shorthand, COMPS bare-dotted rules, and bulletin cites
                      that the shared factory's splitter cannot express
  src/sources-crs.ts  the CRS capture manifest, incl. the 10-3-1104/-1115/
                      -1116 no-private-right-of-action vs. statutory-remedy
                      distinction captured as a source note
  data/               co-law-corpus.json (55 sections, three domains:
                      insurance 15 / repair_law 32 / employment 8) +
                      annotations
  test/               119 tests incl. the CRS_EDITION pin and the
                      CCR version-shortcut/manifest-filter consistency suite

apps/state-co-server/ @repairmcp/state-co-server — Worker, co.repairmcp.com,
                      same shape as state-wa-server/state-mt-server; /health
                      adds crsEdition + the three-domain breakdown

packages/state-tx/    @repairmcp/state-tx — Texas vertical (pure corpus,
                      THREE publishers, and the first state whose research-
                      by-search said capture was impossible: both the
                      statutes site and the TAC moved to JS-rendered SPAs.
                      Both have clean machine surfaces the SPAs themselves
                      consume — found by watching the apps' own requests)
  src/parse-statutes.ts  parser for the whole-chapter HTML the statutes SPA
                      fetches from tcss.legis.texas.gov/resources/{ABBR}/htm/
                      — bold self-link section heads, history notes with
                      "eff. <date>" (NEWEST eff wins as effectiveDate, both
                      full and abbreviated month forms), "Text of section as
                      amended by" dual-print notes terminate a section
  src/capture-statutes.ts  currency tripwire first (the
                      api/GetProperty/StatutesCurrentMsg sentence, pinned by
                      TX_STATUTES_CURRENCY — the Legislature-rollover analog
                      of MT/CO edition pins), one fetch per chapter, named
                      cites hard-fail when absent or repealed
  src/parse-tac.ts    SAIL-JSON parsers for the SOS Appian portal: ordered
                      walk pairs each §number with the next VIEW_TAC_SUMMARY
                      SafeLink (browse), rule text + Source Note arrive as
                      JSON-in-string richText values (summary); Source Note's
                      newest "effective <date>" is the rule's effectiveDate
  src/capture-tac.ts  two-tier crawl (browse JSON resolves recordIds, then
                      per-rule summary JSON); the summary's own "Rule §…"
                      breadcrumb is cross-checked so a recordId can never
                      deliver the wrong rule. The portal's `_/ui` endpoint
                      answers a plain GET only with the Appian client's own
                      protocol headers (sources-tac.ts, values pinned from
                      the portal JS bundle — a 406 means Appian upgraded;
                      re-derive, the failure is loud by design). This is why
                      CaptureIo.FetchOpts grew `headers` at TX.
  src/capture-bulletins.ts  TDI bulletin HTML pages; pageUrl is PINNED
                      because filename ≠ bulletin number on older bulletins
                      (B-0031-10 is 2010/cc30.html); page must state its own
                      number, and a date mismatch (reissue) hard-fails
  src/identity.ts     eight codes (six statute codes + 28 TAC + TDI
                      Bulletin); statute cites are chapter.section dotted
                      pairs the shared factory would misread as chapters, so
                      TX resolves everything itself; bare cites resolve by
                      CHAPTER lookup (captured chapters are disjoint across
                      all codes — TX_CHAPTER_CODES, tested against the
                      manifest); statutes and TAC citations carry effective
                      dates, bulletins carry issue dates
  data/               tx-law-corpus.json (62 sections, 144 KB: insurance 34 /
                      repair_law 19 / employment 9) + annotations
  test/               58 tests incl. the demo gauntlet (appraisal-first is
                      the Texas headliner), the currency pin, and the
                      full-manifest capture-profile fixtures

apps/state-tx-server/ @repairmcp/state-tx-server — Worker, tx.repairmcp.com,
                      same shape as the other state servers; /health adds
                      statutesCurrentThrough + the three-domain breakdown

apps/site/            @repairmcp/site — the public site at repairmcp.com
  wrangler.jsonc      Assets-only Worker. No "main": nothing runs. Preview route only.
  public/index.html   The whole site. One page: hero, both setups, "What to ask
                      it" (example prompts, each tested against the live corpus
                      before publishing), trust, what's next. Footer links
                      legal.html (terms + privacy) and support@bainbridgeai.ai.
  public/styles.css   One stylesheet. No scripts, no web fonts, no third-party anything.
  public/_headers     Security headers + the LAUNCH GATE noindex line
  public/robots.txt   LAUNCH GATE: Disallow: / while preview-only
  public/img/         Screenshots. Placeholders until real screenshots are shot
  SCREENSHOT_MANIFEST.md  What to capture and how to crop it
  README.md           Deploy notes + the launch runbook, including the DNS surgery

scripts/build-d1-sql.ts          corpus JSON → 0002_data.sql (chunked under D1's limits)
scripts/check-copy.ts            site copy linter — runs as apps/site's `test` task
scripts/make-placeholder-shots.ts  flat PNGs at the exact declared dimensions

ingestion/deg-backfill/   @repairmcp/deg-backfill — the crawler and delta sync
  src/tier1.ts        index fetch (fetchIndex) + metadata upsert (upsertIndexEntries)
  src/tier2.ts        fetchDetail — retry/backoff/soft-404 detection; RATE_DELAY_MS
  src/parser.ts       Cheerio detail-page parser (handles old + new DEG formats)
  src/db.ts           schema + all row accessors and cohort queries
  src/hash.ts         content hashing over served fields; normalize / diffFields
  src/state.ts        sync_state / sync_run / sync_item; high-water; migrations
  src/sync.ts         planSync (pure) + runBatch + checkPlanSanity
  src/cli.ts          original backfill entry
  src/sync-cli.ts     delta sync entry — the one you want now. Also carries
                      --drain (unattended, loops to completion) and --health
                      (corpus report, no network)
  src/drain-summary.ts  machine-readable JSON line --drain prints at every exit
  src/health.ts       health report + health.log / ATTENTION-NEEDED.txt primitives
  src/weekly.ts       runWeekly — decides OK/FAIL from the drain summary and the
                      transform's own output; injectable subprocess runners
  src/push-remote.ts  the automated remote corpus push: build-d1-sql → remote D1
                      import → CORPUS_VERSION bump + Worker deploy → /health
                      readback → site count update + site deploy
  src/weekly-cli.ts   `bun run weekly`, the command Task Scheduler runs
  test/               193 tests

scripts/capture-uscode.ts       OLRC → packages/nhtsa/data JSON (one request, --dry-run,
                                hard-fails without the currentthrough marker)
scripts/state-registry.ts       the StateCaptureProfiles (wa, mt, co, tx) the two scripts drive
scripts/capture-state.ts        capture one state from its official publisher(s):
                                --state wa|mt, --dry-run / --save-raw / --from-dir /
                                --only <chapter> (WA only; merge keeps old meta dates)
scripts/check-state.ts          unattended drift checker for EVERY registered state
                                (Scheduled Task "RepairMCP State Law Check", every 4
                                weeks) — one CSV line per state in
                                C:\degdata\logs\state-law-check.log, per-state
                                <ST>-LAW-ATTENTION.txt on drift; never writes corpus
scripts/capture-waleg.ts        transitional shims delegating to the generic scripts
scripts/check-waleg.ts          with --state wa; delete after one scheduled cycle
scripts/seed-sample.ts          Polite scraper that produces sample-inquiries.json
scripts/transform-deg-sqlite.ts SQLite -> deg-inquiries-full.json, with --dry-run
docs/ARCHITECTURE.md            The build spec — read first for design questions
```

**The live corpus is `C:\degdata\deg.sqlite`** (22,796 raw rows as of
2026-08-27). A stale partial copy that used to sit at
`ingestion/deg-backfill/deg.sqlite` was deleted 2026-08-27; `sync-cli.ts` still
requires `--db` explicitly so a wrong path is always a conscious act. Set
`DEG_DB_PATH` to avoid retyping.

`apps/deg-server/migrations/` from §5 still doesn't exist — it lands when D1 is
wired (post-demo).

---

## Commands

```bash
bun install                               # sync workspace deps
bun run build                             # turbo build all packages → dist/
cd packages/core        && bun test       # 77 tests (citation TZ invariance + OpenAI contract)
cd packages/deg         && bun test       # 106 tests (scoring, D1 adapter, local/remote parity)
cd packages/nhtsa       && bun test       # 74 tests (client, laws, adapter, tools, VIN hygiene)
cd ingestion/deg-backfill && bun test     # 193 tests (sync, hash, parser, openDb, tier1/2)
cd ingestion/deg-backfill && bun run typecheck   # tsc --noEmit, clean since 2026-08-03
bun scripts/seed-sample.ts                # re-scrape DEG into sample-inquiries.json
```

**NHTSA server** — from `apps/nhtsa-server/`. No corpus machinery: recalls,
complaints, and VIN decodes are live against NHTSA at request time; the one
corpus is the law JSON baked into the bundle, so a law refresh IS a deploy.

```bash
npx tsx ../../scripts/capture-uscode.ts --dry-run   # re-capture 49 U.S.C. ch. 301, report only
npx tsx ../../scripts/capture-uscode.ts             # writes packages/nhtsa/data JSON
wrangler dev                                        # http://127.0.0.1:8787 (live NHTSA upstream)
wrangler deploy                                     # → nhtsa.repairmcp.com
curl -s https://nhtsa.repairmcp.com/health          # worker + upstream probe + law corpus meta
```

**State law servers** — Washington (`apps/state-wa-server/`, 670 WAC/RCW
sections), Montana (`apps/state-mt-server/`, 119 MCA/ARM sections),
Colorado (`apps/state-co-server/`, 55 CRS/CCR/bulletin sections), and
Texas (`apps/state-tx-server/`, 62 statute/TAC/TDI-bulletin sections). Pure
corpus: the data ships in each bundle, so a corpus refresh IS a deploy —
re-run the capture, run the tests (the substring, demo-criteria, and the
currency-pin suites — MT edition, CO CRS_EDITION, TX TX_STATUTES_CURRENCY —
are the acceptance gate), deploy from the state's app.

```bash
bun scripts/capture-state.ts --state wa --dry-run    # re-capture, report only (also: mt, co, tx)
bun scripts/capture-state.ts --state tx              # writes packages/state-tx/data JSON
bun scripts/check-state.ts                           # drift check, ALL states (the Scheduler's command)
wrangler dev                                         # from the state's app dir
wrangler deploy                                      # → wa. / mt. / co. / tx.repairmcp.com
curl -s https://tx.repairmcp.com/health              # corpus meta + domains (+ statutesCurrentThrough)
```

**Drift checking is automated, refresh is not.** The Windows Scheduled Task
"RepairMCP State Law Check" (every 4 weeks, Sunday 4am, network-gated, proven
via Start-ScheduledTask then LastTaskResult 0) runs `check-state.ts` over
every registered state, each in its own try/catch so one state's failure
cannot hide another's drift. Clean → one CSV line per state in
`C:\degdata\logs\state-law-check.log` (the older wa-check.log is frozen
history) and stale flags cleared. Drift or failure →
`C:\degdata\<ST>-LAW-ATTENTION.txt` with the changed cites and that state's
refresh checklist (exit 1 any failure, else 2 any drift). ARM checks ride the
API's own SHA-256 content hashes and skip unchanged documents; MCA re-fetches
its ~110 pages (~5 min, fine at this cadence). The refresh stays a human
action ON PURPOSE: changed law can renumber annotated sections or shift demo
rankings, and the per-state test suite is the gate that needs eyes. No
legislative calendars are modeled anywhere — Montana's biennial sessions and
year-round agency rulemaking get the same answer: poll cheaply, flag loudly.

**Usage telemetry (all six MCP workers)** — since 2026-09-04 every worker
writes one Analytics Engine row per JSON-RPC message on `/mcp` to the ONE
shared dataset `repairmcp_usage`: vertical, event kind, tool or client name,
user agent, country. Blob layout and the never-record-arguments rule live in
`packages/core/src/server/usage.ts`; `initialize` rows carry `clientInfo`,
the only place claude-ai vs Claude Desktop vs Gemini is distinguishable
(hosted clients all arrive from their platform's egress IPs — Anthropic's
160.79.106.x, UA `Claude-User` — so IPs can never attribute a human).
Row counts: dashboard → Storage & databases → Analytics Engine. Real queries
go through the SQL API and need an API token with Account Analytics Read:
`curl -X POST https://api.cloudflare.com/client/v4/accounts/<acct>/analytics_engine/sql -H "Authorization: Bearer <token>" -d "SELECT blob3, count() FROM repairmcp_usage WHERE blob2='tool_call' GROUP BY blob3"`.
Gotcha: the one-time account-level Enable (done) propagates slowly — deploys
kept failing with error 10089 for ~4 minutes after the dashboard said enabled.

**Remote server (Cloudflare)** — from `apps/deg-server/`. Regenerate the SQL
after any corpus change; the migrations are the corpus on the remote side.

```bash
npx tsx ../../scripts/build-d1-sql.ts --dry-run   # statement count + largest statement
npx tsx ../../scripts/build-d1-sql.ts             # writes migrations/0002_data.sql

wrangler d1 execute repairmcp-deg --local --file=migrations/0001_schema.sql   # then 0002 … 0005
wrangler dev                                       # local D1, http://127.0.0.1:8787
wrangler dev --remote                              # real edge + remote D1 — the honest rehearsal

wrangler d1 execute repairmcp-deg --remote -y --file=migrations/0001_schema.sql   # then 0002 … 0005
wrangler d1 execute repairmcp-deg --remote -y --command "SELECT COUNT(*) FROM inquiry_fts"
wrangler deploy
```

Order is always 0001 → 0002 → 0003 → 0004 → 0005. `0001` drops and recreates
`inquiry` (which takes its triggers with it) and `0003` rebuilds the index from
scratch, so a full re-import is idempotent. Building the FTS index before the
rows land would fire 22,652 trigger inserts instead of one `'rebuild'`.

**0004 and 0005 are the freshness pair and are independent of `inquiry`.** After
a routine corpus refresh only 0002 and 0005 change, and 0005 can be applied on
its own — it is `DELETE` + `INSERT`, not `DROP`. Shipping a corrected cutoff
therefore costs two statements rather than a 25.5 MB re-import. Apply them
*before* deploying new code, not after: the code degrades to silence when the
table is missing rather than erroring, so the only cost of the wrong order is a
window where the server answers without stating its cutoff.

**Delta sync** — supervised batches, always dry-run first:

```bash
cd ingestion/deg-backfill
bun run sync --db "C:\degdata\deg.sqlite" --dry-run          # plan only, no writes
bun run sync --db "C:\degdata\deg.sqlite" --batch-size 500   # first batch
bun run sync --db "C:\degdata\deg.sqlite" --resume           # each subsequent batch
```

It stops after every batch and reports. `--resume` drains the existing queue
without re-planning; a crash loses at most the one request in flight. Other
flags: `--refresh-window N` (trailing sweep, default 1000), `--index-diff-only`,
`--force-new`, `--mode nightly`.

**Weekly automated sync** (unattended, for Windows Task Scheduler). Runs Tier-1,
drains Tier-2 to completion, and regenerates the served JSON in one command:

```bash
cd ingestion/deg-backfill
bun run weekly --db "C:\degdata\deg.sqlite"           # what the Scheduler runs
bun run sync --db "C:\degdata\deg.sqlite" --health    # corpus stats, last sync, FAIL flags
```

Internally this runs `sync --drain --refresh-window 0 --mode nightly`: `--drain`
loops batches to completion instead of stopping after one and self-resumes an
interrupted prior run, `--refresh-window 0` skips the 1000-item trailing sweep
so a normal week stays in the tens of fetches rather than about 33 minutes
regardless of what changed. `bun run weekly` itself only ever exits `0` (OK) or `1`
(FAIL, check the attention flag); the inner `sync --drain` it spawns is what carries
the finer-grained exit codes visible in `sync-YYYY-MM-DD.log`: `0` clean, `1` fatal or
misconfigured, `2` circuit breaker tripped, `3` index sanity check failed, `4` did not
drain within 40 batches.

Logs to `C:\degdata\logs\`: `sync-YYYY-MM-DD.log` (per-run detail, appended if
run more than once the same day), `health.log` (one CSV line per run: date, new
count, corpus total, errors, OK or FAIL), and `ATTENTION-NEEDED.txt` (written on
any FAIL, cleared automatically on the next OK run).

Since 2026-08-27, a clean weekly run also performs **the whole remote push**
(`src/push-remote.ts`): it regenerates migrations 0002/0005, re-imports remote
D1 (0001 → 0005), bumps `CORPUS_VERSION` in `apps/deg-server/wrangler.jsonc`,
deploys the Worker, reads `/health` back and refuses to report OK unless the
edge states the exact records/dates it just pushed, then updates the record
count and "current through <Month Year>" line in `apps/site/public/index.html`,
runs the copy linter, and deploys the site. This is what keeps the delivered
freshness text ("current through 2026-08-27, synced 2026-08-27") moving with
every database update. The push runs even on a zero-change week because Tier-1
stamps `lastSeenAt` on every listed record, which moves `syncedAt`. Pass
`--no-push` to restore the old local-only behaviour; the log then prints the
manual checklist. The push edits `wrangler.jsonc` and `index.html` in the
working tree and deliberately does **not** git-commit them — the log reminds
you to commit when convenient, and an uncommitted value is simply overwritten
by the next run.

**Regenerate the served corpus** after a sync completes:

```bash
npx tsx scripts/transform-deg-sqlite.ts --dry-run   # summary + diff vs served file
npx tsx scripts/transform-deg-sqlite.ts             # writes it
```

After editing source, **always rebuild before Claude Desktop re-spawns** the server — it loads `dist/stdio.js`, not source. Force a re-spawn by killing all `Claude.exe` and relaunching.

**A corpus refresh touches four places, not one — and `bun run weekly` now
touches all four.** The list below is what the push automates (and the manual
checklist for a `--no-push` run or a hand-driven catch-up sync):

1. `scripts/transform-deg-sqlite.ts` — the served JSON
2. `scripts/build-d1-sql.ts` — regenerates `0002_data.sql` **and**
   `0005_meta_data.sql`, the corpus's own statement about how current it is.
   Apply 0005 or the server keeps declaring the previous cutoff.
3. `CORPUS_VERSION` in `apps/deg-server/wrangler.jsonc` — the cache key, and the
   whole invalidation mechanism. Set it to the `syncedAt` the generator prints;
   `/health` answers `corpusVersionStale: true` until you do.
4. the record count hard-coded in `apps/site/public/index.html` — three spots: the
   description meta tag, the hero, and the stat grid. It is a constant because the
   site ships no scripts and has nothing to fetch a live count with. The current
   value is whatever `curl -s https://deg.repairmcp.com/health` reports.

**Public site** — from `apps/site/`:

```bash
bun run test        # copy linter. Also runs from `bun run test` at the root
bun run dev         # wrangler dev, http://127.0.0.1:8787
bun run deploy      # wrangler deploy → preview.repairmcp.com
bun run shots       # regenerate placeholder images, skipping any real screenshot
```

---

## Conventions (vital)

- **Vertical-agnostic core, vertical-specific adapters.** Anything DEG-specific (shop-floor language, IP keywords, scoring weights) lives in `packages/deg/`. `packages/core/` knows nothing about collision repair. The OpenAI `search`/`fetch` builders are in core for exactly this reason — "expose a ChatGPT connector over a SourceAdapter" is as true for I-CAR as for DEG. What core cannot know is how to flatten a domain record into one text blob, so that arrives as the `toDocument` mapper.
- **Two adapters, one set of answers.** `DEGAdapter` (JSON, STDIO) and `D1DEGAdapter` (D1, Worker) both satisfy `DegSource`. Every behaviour they share lives in a module they both import — `identity.ts` for citations, `filters.ts` for filter parsing, `text-match.ts` for search scoring, `scoring.ts` for the killer scorer and its ranking comparator. Nothing is duplicated "because it's only five lines"; that is precisely how a shop ends up with two different citations for the same query. `d1-parity*.test.ts` is what enforces it.
- **Never let user text reach FTS5 raw.** It goes through `buildMatchExpression`, which runs the scorer's own `tokenize` — leaving only `[a-z0-9]+` — then quotes each token. An FTS5 syntax error or an injected `NEAR`/`OR`/`*` is structurally impossible, not merely unlikely. Zero usable tokens returns `null`, and callers must treat that as no results: an empty MATCH string is a syntax error, and "match everything" would be a lie.
- **The corpus states its own cutoff; nothing hardcodes it.** `deriveCorpusMeta`
  (`packages/deg/src/freshness.ts`) is the one producer of both dates —
  `currentThrough` from `COALESCE(resolvedAt, submittedAt)`, `syncedAt` from
  `metadata.lastSeenAt` (the index sighting, *not* `bodyFetchedAt`, which runs a
  day later and would overstate currency). The in-memory adapter derives it, the
  SQL generator writes it into `corpus_meta`, the D1 adapter reads it back, and
  the test fake seeds it — all from that function, so the two servers cannot
  disagree. It reaches the model three times: appended to every tool description,
  as `corpusCurrentThrough` in every payload, and as `corpusNote` when the query
  implied recency. This exists because a ChatGPT session claimed coverage
  "through August 12" over a corpus ending July 31. If freshness is ever
  unknown, every layer degrades to silence — never to a guess.
- **Cache results, never the JSON-RPC envelope.** A response embeds the id of the request that produced it. Replaying a cached HTTP response hands a client someone else's id. `src/cache.ts` caches raw D1 rows — pure JSON, no Dates to lose — and the Worker rebuilds the envelope every time. Invalidation is the `CORPUS_VERSION` var, which is part of the cache key: bump it on every corpus refresh.
- **Tool descriptions matter as much as code.** They are the AI's primary signal for routing. Always follow the "USE THIS WHEN: / INPUT: / OUTPUT:" pattern from §7.3. Shop-floor vocabulary improves accuracy: *supplement, short-pay, denial, blueprinting, DRP, non-included, P-pages, MOTOR GTE, DBRM, Qapter*.
- **Citation discipline.** All dates render via `fmtDateUtc` (`packages/core/src/citation/formatter.ts`) — `toLocaleDateString('en-US', { timeZone: 'UTC' })`. Never inline `.toLocaleDateString` elsewhere; if you need date formatting, route through that helper or add a sibling. AI clients are instructed to drop `citation.shortForm` verbatim — never reformat.
- **STDIO transport: stdout is the JSON-RPC channel.** All logging in `apps/deg-server/src/stdio.ts` goes to stderr. `console.log` corrupts the protocol.
- **Polite scraping.** 1 req / 2 s, exponential backoff on 429/5xx, User-Agent `RepairMCP-Bot/1.0 (+https://repairmcp.org)`, follow-redirect detection (DEG soft-redirects unknown IDs to `/deg-database/` with HTTP 200 — treat as not-found).
- **`noUncheckedIndexedAccess: true`** in `tsconfig.base.json`. Array access returns `T | undefined`. Use `??` defaults or non-null `!` only after a length check.
- **`verbatimModuleSyntax: true`.** Type-only imports must use `import type {...}`. Re-exports of types use `export type {...}`.
- **The index is the source of truth for status; the detail page for content.** Every
  field has exactly one producer. `resolution_status` once had two — tier-1 derived it
  from the index status, tier-2 from the page's Resolution cell — and the two disagree
  on every inquiry DEG marks Resolved with a blank Resolution, so the column flipped
  twice per run and logged a phantom change each time. If you add a field, decide which
  side owns it.
- **`lastUpdated` never reflects when we crawled.** It derives from `resolution_date`,
  falling back to the submission date. `last_seen_at` and `body_fetched_at` are crawl
  artifacts that move on every sync; routing a citation date through them made all
  22,425 records claim the same day. They stay in `metadata` for audit only.
- **Refresh writes overwrite; they do not COALESCE.** The page is current truth, so a
  correction upstream must land. Null-preservation happens one level up in
  `mergeParsedBody`, which means the value hashed is exactly the value stored. Two
  guards sit in front of it: `isSuspectParse` (a page parsing to nothing against a
  populated row) and `isImplausibleMake` (DEG's free-text Make cell is junk on `Other`
  inquiries — one page supplied the entire vehicle string, with typos, as the make).
- **Site copy is linted, not remembered.** The writing rules for `apps/site` are
  narrow and easy to break six months from now, so `scripts/check-copy.ts` enforces
  them: no em dashes or en dashes anywhere, no hype or AI-industry jargon, the
  acronym MCP exactly once and expanded, every `<img>` carrying `alt`/`width`/`height`,
  and nothing the site's own Content-Security-Policy would silently kill (`<script>`,
  `<form>`, inline `style=`, plain `http://`). Say "your AI assistant", never "MCP
  client". If a banned word is genuinely the right one, change the list and say why
  in the commit; do not route around it.
- **The site ships nothing to the browser but HTML and CSS.** No scripts, no web
  fonts, no icon library, no analytics, no cookies, no third-party requests at all.
  That is what lets the CSP be `default-src 'none'`, and the CSP is what makes the
  "it does not see your data" claim on the page true rather than aspirational. Adding
  one script tag breaks the header, the linter, and the promise, in that order.

---

## Build status

| Block | Status | What landed |
|---|---|---|
| D1 h1–2 Scaffold | ✅ | Monorepo, Turbo, pnpm workspaces, strict TS |
| D1 h3–4 Sample scrape | ✅ | 50 inquiries, scraper handles old + new DEG formats, redirect detection |
| D1 h5–6 Core abstractions | ✅ | `SourceAdapter`, `RepairMCPServer`, `buildCitation`, 4 standard tool builders |
| D1 h7–8 DEG adapter + STDIO | ✅ | `DEGAdapter` (in-memory), `apps/deg-server/dist/stdio.js` ready for Claude Desktop |
| D2 h1–3 Killer scoring | ✅ | `deg_find_supporting` returns 40990 #1 at confidence 0.883 for "blend two-tone refinish". 24 unit tests. |
| D2 h4 Citation UTC polish | ✅ | `fmtDateUtc` + 7 TZ-invariance tests across PT/UTC/Tokyo |
| D2 h5 Tool description rewrites | ✅ | All 4 tools have shop-floor "USE THIS WHEN:" descriptions; `registerDegTools(server, adapter)` helper |
| Full corpus backfill | ✅ | 22,425 inquiries wired to the MCP server (2f00d60) |
| Catch-up delta sync | ✅ | 2026-08-02. See below. |
| D2 h6 End-to-end test | ⏳ next | 3 supplement-writing scenarios in Claude Desktop |
| D2 h7 Demo recording | ⏳ | 90-sec Loom |
| D2 h8 Outreach package | ⏳ | One-page PDF + Loom link + outreach email |
| Phase 2 remote server | ✅ live | Zone active. `https://deg.repairmcp.com/mcp` verified on the wire; both the Claude and ChatGPT connector gates passed with real supplement scenarios. |
| Phase 3 public site | ✅ live | Launched 2026-08-27: `https://repairmcp.com` serves the site, indexable, full security headers. `www` 301s to the apex via a zone Redirect Rule; `preview.repairmcp.com` retired. Real screenshots and og-image in place. |
| Corpus freshness | ✅ live | `corpus_meta` in D1 (0004 + 0005), stated in all six tool descriptions, every payload, and `/health`. As of 2026-08-27 the edge serves 22,786 records, current through 2026-08-27, synced 2026-08-27, `corpusVersionStale: false` — verified on the wire. |
| Weekly automated sync | ✅ live | 2026-08-25, extended 2026-08-27 with the automated remote push (`push-remote.ts`): a clean weekly run now lands D1 + Worker + site in the same pass and verifies `/health` on the wire. Registered as the Windows Scheduled Task "RepairMCP DEG Weekly Sync" (Sunday 3am, network-gated), proven through the Scheduler itself (`LastTaskResult: 0`). See below. |
| NHTSA vertical | ✅ live | 2026-08-27: `https://nhtsa.repairmcp.com/mcp` deployed and verified on the wire (9 recalls for the 2020 Transit, §30122 quoted verbatim, WAF 429s confirmed). Seven `nhtsa_*` tools + connector search/fetch over a composite live+corpus adapter; 49 U.S.C. ch. 301 captured from OLRC (47 sections, current through 2026-04-30 / P.L. 119-87). Site card flipped, /legal updated for VIN passthrough. Built from the May branch (`codex/washington-binding-authority`): client/schema/relevance/tests ported, everything else rewritten to current conventions. Open: connector gates in Claude and ChatGPT clients. |

| WA vertical | ✅ live | 2026-08-27: `https://wa.repairmcp.com/mcp` deployed and verified on the wire (steering → WAC 284-30-390 with the verbatim good-faith excerpt, painter breaks → 296-126-092, storage denial → 284-30-394, WAF 429s confirmed on the new hostname). 670 verbatim sections across four domains captured from leg.wa.gov by `scripts/capture-waleg.ts` (645 at launch; RCW 51.16 verified and folded in the same day); hand-annotation layer with test-enforced substring excerpts; four `wa_*` tools + connector search/fetch with freshness passed. Site card flipped, /legal updated. Kickoff decisions held except two live-probe corrections (newest-effective-wins; chapter-page-only capture). Open: connector gates in Claude and ChatGPT clients. |

| state-law extraction | ✅ | 2026-08-27: the shared machinery extracted from state-wa into `packages/state-law` at state #2, per the standing decision. Parity proven, not asserted: zero edits to the 101 pre-existing WA tests, a golden-ranking panel (pinned scores/breakdowns + one byte-exact payload) green throughout, the WA worker compiled with zero changes, and all four saved wire responses byte-identical after the refactor. Deployed to wa.repairmcp.com before Montana began. |
| MT vertical | ✅ live | 2026-08-27: `https://mt.repairmcp.com/mcp` deployed and verified on the wire (killer demo: "adjuster is deleting operations from the estimating system we both use" → MCA 33-18-224 first, whose (iii) clause prohibits exactly that; WDEA → 39-2-904; WAF 429s at exactly 20). 119 verbatim sections from TWO publishers — MCA (two-tier slot-URL crawl, edition-marker tripwire) and ARM (SOS public JSON API, ISO effective dates, SHA-256 content hashes). Honest absences stated in tool descriptions (no aftermarket-disclosure law, no adult break statute, federal-OSHA safety). Site sells four sources, one setup. Open: connector gates in the project owner's clients. |

| CO vertical | ✅ live | 2026-08-31: `https://co.repairmcp.com/mcp` deployed (deployment `b00e811d`) and verified on the wire — `/health` reports 55 sections, current through 2026-08-31, "Colorado Revised Statutes 2026" edition, domains insurance 15 / repair_law 32 / employment 8; steering query → CRS 10-4-120 first; an OEM-procedure short-pay query also lands CRS 10-4-120 first with the verbatim (3)(e) reasonable-costs excerpt in `quoteSafeExcerpts`; an adjuster-gone-silent supplement query → 3 CCR 702-5-1-14 first; DOI Bulletin B-5.04 fetches in full with `shortForm` "Colorado DOI Bulletin B-5.04, issued 9/19/2016"; WAF 429s confirmed on the hostname, onset at request 22 — jitter vs the rule's 20, rule active. 55 verbatim sections from THREE publishers — the Office of Legislative Legal Services (whole-title HTML, CRS_EDITION pin), the Secretary of State (CCR PDFs via the two-tier rule-version crawl), and the Division of Insurance (the one bulletin PDF, guidance not law). Honest absences stated in tool descriptions and the site card: no Colorado OSHA plan (federal OSHA governs spray booth/respirator duties), CRS 10-3-1104 carries no private right of action on its own (10-3-1115/-1116 provide the statutory delay/denial remedy), the COMPS "dealer" overtime exemption's application to an independent body shop is an open question the corpus states rather than answers. Site flips to five sources, one setup; /legal names the three CO publishers. Open: connector gates in the project owner's clients. |

| TX vertical | ✅ live | 2026-08-31: `https://tx.repairmcp.com/mcp` deployed (version `dc199094`) and verified on the wire — `/health` reports 62 sections, current through 2026-08-31, statutes current through the 89th 2nd Called Legislative Session, 2025, domains insurance 34 / repair_law 19 / employment 9; steering query → Tex. Ins. Code 1952.302 first; "invoke appraisal on a lowball estimate" → 1813.003 first with shortForm "Tex. Ins. Code 1813.003, effective 9/1/2025" (SB 458's brand-new mandatory appraisal chapter — no other shipped state has an analog); 542.060 fetches with the verbatim 18-percent-interest text; "reimbursement rates artificially low" → TDI Bulletin B-0031-10 first at 0.681; WAF confirmed on the hostname, exactly 20 pass then 429s. 62 verbatim sections from THREE publishers — the Legislature's statutes backend (tcss.legis.texas.gov, found by watching the Angular SPA's own requests after every classic URL turned out to serve an app shell), the SOS Appian rules portal (stateless `_/ui` GETs with the client's own pinned protocol headers), and TDI bulletin HTML. Honest absences in tool descriptions and the site card: no body shop licensing, no state OSHA plan, no state overtime or break law, 542 deadlines first-party only, 541.060(b) bars third-party actions in its own text, ch. 1813 applies to policies issued/renewed on/after 1/1/2026 only. Site flips to six sources; /legal names the three TX publishers. Demo with a Texas shop scheduled the following week — the gauntlet's shop-phrasing queries are the demo script. Open: connector gates in the project owner's clients. |

**Test totals:** 817 passing (77 core + 106 deg + 74 nhtsa + 18 state-law + 112 state-wa + 59 state-mt + 120 state-co + 58 state-tx + 193 ingestion). 0 failing.
Plus the site copy linter, which is a gate rather than a test count.

### Remote push automated + pre-launch audit, 2026-08-27

A catch-up sync brought the corpus to **22,786 served records** (13 new, 18
refreshed, 0 errors; raw table 22,796, max db_id ~41893), and the whole remote
push is now automated: `src/push-remote.ts` + 19 tests, wired into
`bun run weekly` (see Commands). The catch-up was pushed the same day — the edge
now states "current through 2026-08-27, synced 2026-08-27" in every tool
description, payload, and `/health`.

The re-import surfaced a real retrieval bug the parity panel was built to
catch: the D1 recency arm took the newest 500 matches *outright*, but the
scorer gives no recency credit to records dated after `now`, so on a saturated
query the true winner is the newest match **at or before** `now`. Identical
with a live clock; divergent under the panel's pinned 2026-05-07 clock the
moment the corpus grew 500 matching records past it — which this refresh was
the first to do. The arm now carries a `<= now` cutoff at day granularity
(cache-key stable). `d1-parity-full.test.ts` is green again at 20/20 and the
fix is deployed.

Also that day, from the pre-launch audit: the WAF rate limit verified live on
the wire (exactly 20 requests pass per 10 s, then 429s), git history clean of
secret patterns, no tracked env files, the stale
`ingestion/deg-backfill/deg.sqlite` deleted, and the placeholder
`og-image.png` replaced with a real 1200x630 card (headless Chrome render,
48 KB). `bun audit` reports CVEs in `hono`/`fast-uri` — transitive deps of the
MCP SDK whose affected middleware this Worker never uses; bump with
`bun update` + full test run when convenient.

### Phase 2 — remote MCP server, 2026-08-03

Not public yet, deliberately. The Worker is deployed and verified against real
D1; its route is `deg.repairmcp.com` and it goes live when that zone is active.
There is no workers.dev fallback and there will not be one: a zone-scoped WAF
rate limit rule cannot cover a workers.dev hostname, and an open unauthenticated
corpus should have exactly one door — the one the rate limit protects.

**Everything serves on `.com`.** `repairmcp.org` appears only in the scraper's
User-Agent, which is left alone until the site launches. Do not "fix" it to match
the serving hostname without checking that decision first.

- **D1** `repairmcp-deg`, region WNAM, `c0a4f4f0-aec8-4d1e-b947-647353033448`.
  22,652 rows in `inquiry` and `inquiry_fts`, 48.6 MB of a 500 MB Free ceiling.
- **Six tools.** The four `deg_*` tools unchanged, plus `search` and `fetch`
  implementing OpenAI's connector contract exactly (one string argument each,
  declared output schema, payload in both `structuredContent` and a JSON string
  in `content[0].text`).
- **Retrieval is two-armed.** FTS5 bm25 alone agreed with the in-memory adapter
  on only 13/20 of the agreement panel, and more bm25 depth plateaued at 17/20 —
  the records it misses are not deep in the ranking, they are recent records bm25
  ranks poorly and the scorer ranks first. Adding a second arm ordered by the
  tie-break's own date, plus length-gated prefix matching to close the
  substring-vs-token gap ("measurements", "aiming"), reached 20/20 on both top-1
  and top-5. See `d1-parity-full.test.ts` — the panel is the fixture.
- **Search score is term coverage, ordering is bm25.** Not normalized bm25:
  measured, a deliberate nonsense query's top hit scores bm25-raw 15.25 while a
  real one tops out at 16.87, because bm25 magnitude tracks query length and term
  rarity rather than relevance. Coverage is the same number the local server
  reports, so the two agree.
- **Rate limiting is live**, and not at the shape originally specced. The Free plan
  locks both the counting window and the mitigation duration to **10 seconds**, so
  the recommended 60 requests / 60 s could not be entered as written. Deployed as
  **20 requests / 10 s, by IP, Block**, matching on `/mcp`. Same intent rescaled:
  1 req/s sustained becomes 2 req/s sustained, but a burst is caught six times
  faster. Free allows exactly one rate limiting rule and this uses it — a second
  rule means Pro.
- **The demo query is `labor allowance for cargo van side panel extension
  replacement`.** See below.
- **Open:** connect Claude and ChatGPT, run the three supplement scenarios.

### The demo query, chosen with data 2026-08-04

`deg_find_supporting("labor allowance for cargo van side panel extension replacement")`

```
41715  0.950  CCC       Welded Panel Operations: Quarter Panel
14187  0.775  Audatex   Welded Panel Operations
39325  0.725  CCC       Welded Panel Operations: Cab
31902  0.675  CCC       Welded Panel Operations: Body Shell
19240  0.675  Mitchell  Welded Panel Operations: Pillars, Rocker...
```

Picked against two criteria, not one. **Separation:** a unique winner at 0.950 with
a 0.175 drop to #2 and 0.275 to #5 — a visible ranking rather than the wall of
1.000s that "blend two-tone refinish" produces (30 records tie there, so recency
picks the winner, not relevance). **Payoff:** DEG #41715 is the best story in the
corpus — CCC allowed 1.0 hour for a welded structural extension, the shop
documented ~20 factory spot welds and asked for 3.5, and MOTOR's resolution reads
"the estimated work time applied to the Extension has been updated to 3.5 hours
from 1.0 hours." A 2.5-hour win, resolved 2026-07-30.

Runner-up: `structural adhesive and anti-flutter foam on roof replacement` →
#16628 at 0.967 with the widest drop in the corpus (0.443 to #5); MOTOR raised
roof replacement 18.5 → 20.0 hours. Older (2020) and a smaller delta, but the
confidence curve is even cleaner.

**1,429 inquiries** carry a resolution matching `updated to X hours from Y` where
X > Y — a documented labor increase. That is the pool worth mining for any future
demo or site copy, not the corpus at large. The largest are startling: #17025
went 19 → 44.9 hours, #20868 went 8 → 29.5.

### Delta sync, 2026-08-02

Corpus 22,426 → **22,662** rows (max db_id 41481 → 41745); served JSON 22,425 →
**22,652**. Run 1 fetched 1,315 pages across four supervised batches: 236 new
inquiries, 1,079 refreshed. Zero transient failures, breaker never tripped.

What it caught, in rough order of importance:

- **A truncated index would have destroyed the corpus.** Delisting is "held but
  absent from the live index". That evening `/grid/get/all` began returning 200
  rows instead of 22,661 — one non-dry-run invocation would have delisted ~22,460
  records. `checkPlanSanity` now aborts on it (see gotchas).
- **`resolution_status` oscillated** between tier-1 and tier-2: 78 phantom writes
  in batch 1, none of them real. Fixed; batch 2 then wrote 0 across 500 pages.
- **195 vehicle makes were truncated** at the first space (`Land` / `Rover
  Defender`) because the index ships one vehicle string. Fixed at the parser and
  repaired in place; validated 33/33 against live detail pages.
- **Index-diff earned its place as the primary selector** — 3 of the 12 resolution
  updates sat 3,800–4,500 ids behind the high-water mark, where no trailing window
  would have found them.
- 38906 delisted; 38943 and 41179 confirmed dead (page gone, still index-listed).

**Index status:** recovered 2026-08-03 — the truncation was a transient throttle (see
Backlog). Verified offline against the saved response: 100% coverage, 0 delistings,
0 new records, guard passes. The corpus is current; there was nothing new upstream
overnight, so no sync was run.

**Open:** rebuild + restart Claude Desktop. Until that happens the server is still
serving the old 22,425 from the previously loaded `dist/stdio.js`.

### Weekly automation live, 2026-08-25

Corpus 22,662 → **22,783** raw rows (max db_id 41745 → 41886); served JSON 22,652 →
**22,773**. A 23-day-idle catch-up (`--drain`, default refresh window) fetched 1,201
pages in one supervised run: 119 new inquiries, 135 written, 0 skipped, breaker never
tripped. Then `bun run weekly` shipped: `--drain` loops the existing batch/plan/sanity
machinery to completion instead of stopping after one batch and waiting for `--resume`;
`--health` prints a corpus report and exits before any network call; `weekly-cli.ts`
wraps both plus the served-JSON transform into one command, writing
`C:\degdata\logs\health.log` (one CSV line per run), `sync-YYYY-MM-DD.log` (per-run
detail, appended across same-day runs), and `ATTENTION-NEEDED.txt` (written on FAIL,
cleared automatically on the next OK). Registered as the Windows Scheduled Task
"RepairMCP DEG Weekly Sync", Sunday 3am, network-gated, catches up if the machine was
off, and proven through the Scheduler itself (`Start-ScheduledTask` then
`LastTaskResult: 0`), not just the command line.

Weekly mode runs with `--refresh-window 0`, deliberately skipping the 1000-item
trailing sweep the manual catch-up above used. That sweep exists to catch silent
content edits with no status/resolution_date change; running it every week forever
would be ~1000 fetches (~33 min) regardless of what actually changed, against a stated
volume goal of "tens per week, minutes of runtime." New, index-diff-changed,
unresolved, resolved-blank, and suspected-dead cohorts are unaffected; only that
narrower class of silent edit still needs an occasional manual `bun run sync` catch-up.

The build's own final review caught a real bug before it shipped: an auto-resumed
drain (a crash, a Task Scheduler kill, or a machine sleep leaving a prior run
`interrupted` with items still queued) skipped `fetchIndex` and `checkPlanSanity`
entirely, then reported full success and cleared the attention flag on a clean drain,
the monitor silently lying about the one thing it exists to report. Fixed with an
`indexSynced` field on the drain summary that `runWeekly` treats as an immediate
failure; the run still marks itself `completed`, so the following week self-heals by
planning fresh against the live index. Six other Important findings, a toast that
never actually fired because its child process was killed by `process.exit` two
statements early, a 20% error-rate threshold with no minimum sample (which the
`--refresh-window 0` volume cut made trip on noise), hardcoded zeros in the two
failure-summary paths that matter most, the transform's own schema-validation-error
count going unchecked, and the served-JSON transform reading a hardcoded path `--db`
didn't actually control, were caught the same way and fixed in the same pass. See
commit `cccac17` for the full list.

**`bun run weekly` only performs the first of the four corpus-refresh steps
documented under Commands** ("A corpus refresh touches four places, not one"), the
served JSON, not `build-d1-sql.ts`, not `CORPUS_VERSION`, not the site's record count.
It prints a "NEXT (manual)" reminder in its own log whenever the corpus grows, but the
D1 push itself stays a human decision, on purpose (see Backlog).

---

## Backlog (deferred until called)

- ~~Resolve the `/grid/get/all` 200-row response.~~ **Resolved 2026-08-03**: transient
  throttle, not an endpoint change. One polite fetch that morning returned 5,777,228
  bytes, `count: 22674`, 22,661 unique db_ids, max 41745 — fully recovered. No
  pagination work needed; `fetchIndex` stays as is. The guard stays permanently: the
  failure is recurrable and nothing in a degraded response identifies it as partial.
  Both of our diagnoses at the time were wrong — the max being 41734 rather than 41745,
  and the 200 rows spanning db_id 33→41734 rather than forming a contiguous slice, both
  read as an endpoint change. A degraded response simply isn't obliged to be a clean
  prefix of the real one. Don't infer structure from the shape of a partial payload.
- **Watch for index degradation late in a large run.** The 200-row response appeared
  after roughly 1,300 detail fetches in one day — the exact shape of a full catch-up.
  If that correlation is real, expect the index to degrade toward the end of any run of
  that size. `checkPlanSanity` makes it safe rather than corpus-fatal, but note the
  consequence: a *subsequent* invocation may abort at planning even though the batch
  before it completed cleanly. That is the guard working, not a regression. Wait and
  re-check the index rather than reaching for a workaround.
- ~~**Nightly unattended sync.**~~ **Resolved 2026-08-25**: `bun run weekly` runs
  Tier-1, drains Tier-2 to completion via `--drain --refresh-window 0 --mode nightly`,
  regenerates the served JSON, and writes health.log / ATTENTION-NEEDED.txt. Registered
  as the Windows Scheduled Task "RepairMCP DEG Weekly Sync" and verified through the
  Scheduler itself, not just the command line. See "Weekly automation live" above.
- ~~The weekly sync creates ongoing local/D1 drift, on purpose.~~ **Resolved
  2026-08-27**, by reversing the decision at the project owner's direction: the delivered
  freshness text must move with every database update, so a clean weekly run now
  performs the full remote push (see Commands and `push-remote.ts`). The
  safeguards that made unattended pushes scary are what made this reversible:
  the push only runs after the sync itself reports OK, every step failure writes
  ATTENTION-NEEDED.txt, and the run refuses to report OK unless `/health` on the
  wire states the exact records/dates it pushed. Local and D1 were reconciled
  the same day (both at 22,786, current through 2026-08-27).
- **Audatex coverage is collapsing.** Zero new Audatex inquiries in the five weeks to
  2026-08-02; the newest in the whole corpus is 41424 (2026-06-18). Audatex is 8.4% of
  the corpus historically but 1.3% of the last 1,000 ids. Kills any plan to balance IP
  distribution by pulling recent inquiries.
- **Confidence saturates on common queries.** `deg_find_supporting` returns 1.000 for
  30 different inquiries on "blend two-tone refinish", and does the same on any query
  whose words are all common in the corpus. Once that happens the score stops
  discriminating and the ranking is decided entirely by the tie-break — recency, then
  id. Two consequences. First, the documented "40990 #1 at 0.883" benchmark is a
  *sample-corpus* result and does not hold on the full 22,652 records, where 40990 sits
  at rank 31; the demo script needs re-checking against real output. Second, a shop
  reading "confidence 1.000" on thirty different citations is being told nothing.
  The scorer needs finer separation at the top — IDF-style weighting so a rare term
  counts for more than a common one, or a length normalization so a long record
  cannot cover a short query by accident. Not urgent: the ordering is still sensible
  and parity between local and remote is exact. But the number is doing less work than
  it appears to. Do not "fix" it by rescaling — the components are calibrated and
  documented; the missing piece is term weighting.
- **Make normalization.** 101 rows say `Mercedes` where others say `Mercedes Benz` /
  `MERCEDES`; `Ford`/`FORD`/`ford` throughout. Distinct from the truncation bug, which
  is fixed. Belongs at query time, not ingest — source fidelity is the convention.
- ~~`openDb` creates on open.~~ **Fixed 2026-08-03**: a bare `openDb` now refuses a
  path that does not exist or that holds no `inquiry` table, naming the path. Creating
  one is explicit — `--create`, or `openDb(path, { create: true })`. In-memory
  databases are exempt; they cannot be a typo.
- ~~Cloudflare Workers transport research before any deploy.~~ **Answered 2026-08-03
  by looking.** SDK 1.29.0 *does* ship
  `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`, and its doc comment
  contains a Cloudflare Workers usage example. No SDK bump, no custom fetch wrapper,
  no `agents/mcp`. The backlog entry had been carrying a claim nobody had checked
  against `node_modules`.
- ~~Take `deg.repairmcp.com` live.~~ **Done.** The zone is active and the endpoint
  serves. Both connector gates passed with real supplement scenarios. `workers_dev`
  stays false on every worker in this repo: a second hostname the WAF rule does not
  cover is a second door into the same open corpus. If a soft launch on workers.dev is
  ever wanted, the only real mitigation there is Cloudflare's in-Worker rate limiting
  binding (`unsafe.bindings`, type `ratelimit`), roughly 15 lines.
- ~~Take `repairmcp.com` live.~~ **Done 2026-08-27.** Parking A record on the apex
  deleted, www's parking CNAME repointed at the apex (proxied) plus a zone
  Redirect Rule (www 301 → apex, path and query preserved), apex custom domain
  attached, both LAUNCH GATE markers opened (`X-Robots-Tag` removed, robots.txt
  `Allow: /`), preview retired (Cloudflare auto-removed its DNS record with the
  route). The five `MX` records and the SPF `TXT` — live Namecheap email
  forwarding — were left untouched, verified still present after the launch.
  Verified on the wire: apex 200 + security headers + no x-robots-tag, www 301,
  `deg` unaffected.
- **The result cache is thinner on the edge than it looks locally.** Warm/cold was
  64 ms / 247 ms against local D1 but 349 ms / 401 ms against the real edge:
  `caches.default` is per-colo and a preview session never accumulates hits. Do not
  size the D1 read budget assuming the cache absorbs repeats until real traffic shows
  it does. A `find_supporting` call reads on the order of 1,000 rows against a Free
  ceiling of 5M/day.
- ~~NHTSA vertical.~~ **Shipped 2026-08-27** — see the Build status row. Pushed to
  GitHub and the stale worktree registration pruned the same day (the blocker was a
  ReadOnly attribute on its `logs`/`refs` dirs, not ACLs — `attrib -r` fixed it, no
  elevation needed). What remains from that launch: the connector gates (add the URL
  in the project owner's Claude and ChatGPT clients and run the three scenarios). The
  **Washington vertical shipped 2026-08-27** (see the build-status row);
  `docs/WA-VERTICAL-KICKOFF.md` remains the record of the decisions. Two of them the
  build corrected on live evidence: history notes list amendments NEWEST-first (an
  effective date is the current text's date — 284-30-330 is 10/30/2016, not the
  kickoff's 9/1/1978 example), and single-section URLs render without anchors, so
  ALL capture goes through chapter pages with anchor filters (bare 296-24-370 is an
  empty part-head; the spray rules are its -37001..-37027 family).
- ~~Re-run `capture-waleg` after each WA legislative session, or quarterly.~~
  **Automated 2026-08-27** as the Scheduled Task "RepairMCP WA Law Check" — see the
  Washington server section under Commands. The check is automated; the refresh
  stays human (capture + tests + deploy, the checklist is in the attention file).
  When a check flags drift, treat the test suite as the gate: a renumbered or
  reworded annotated section fails loudly and needs judgment, not automation.
  State #2 folds in here too — the extraction decision (kickoff §4.1) was
  copy-once-more, extract at state #2.
- **`deg_get_estimating_tip` (5th tool).** Spec includes it; deferred post-demo. Needs separate scrape path, schema, parser, sample data. Demo doesn't need it.
- **D1 schema migration + cron refresh.** Whole `apps/deg-server/migrations/` and `cron.ts` deferred until D1 wiring (post-demo).
- ~~CO vertical.~~ **Shipped 2026-08-31** — see the Build status row. What remains:
  the connector gates (add `https://co.repairmcp.com/mcp` in the project owner's
  Claude and ChatGPT clients and run the demo scenarios, same as WA/MT/NHTSA).
  Three candidates surfaced during the build that are future corpus/scorer work,
  not blockers:
  - **CRS 6-1-113, the Colorado Consumer Protection Act private-action section**, is
    not in the CO corpus (6-1-105's unfair-practices catalog is; the section that
    actually creates the private right of action to sue under it is not). A
    future corpus-refresh candidate if a shop-facing CCPA private-action scenario
    comes up — add it to `sources-crs.ts`'s manifest the same way 10-3-1115/-1116
    were added alongside 10-3-1104.
  - **Scorer length bias** (noted independently in DEG's saturation backlog entry
    above) is a cross-state candidate now that three state corpora share the same
    base scorer in `packages/state-law`: a long section can out-cover a short,
    more on-point one by accident. Worth a length-normalization pass across all
    three states at once rather than three separate tunings.
  - **An optional serialized `note`/`scopeNote` annotation field** on `StateSection`
    (or a sibling) was discussed but not built — CO's `sources-crs.ts` currently
    carries capture-manifest notes as source comments (e.g. the 10-3-1104 vs.
    10-3-1115/-1116 distinction) rather than as corpus-queryable data. Worth
    revisiting if a future state's honest-absences story gets too big for a tool
    description to carry alone.

---

## Known gotchas

- **leg.wa.gov chapter pages contain empty part-head anchors** (296-24-370,
  296-901-140, two dozen more): the capture prints the skip LIST every run — a
  nonempty list is normal, a growing one is the signal. WAC 296-62 is ~3.5 MB and
  must never be captured whole; its manifest entries are prefix/section filters and
  a corpus test asserts the parent never leaked in.
- **NHTSA's two APIs disagree about date order.** Recall dates arrive DD/MM/YYYY
  (`16/12/2021`), complaint dates MM/DD/YYYY (`07/29/2026`) — verified on the wire
  2026-08-27. `normalizeDateString(value, 'dmy'|'mdy')` in `packages/nhtsa/src/client.ts`
  is per-endpoint on purpose, and the ambiguous-date tests exist so a future
  "simplification" to one parser fails loudly instead of silently swapping months.
- **NHTSA answers an unrecognized make/model with HTTP 400, not an empty 200.**
  "Transit 250" → 400. That is NHTSA answering, not NHTSA down: the client retries
  once with the nearest name from NHTSA's own model vocabulary (`products/vehicle/models`,
  exact > query-is-prefix > name-is-prefix), and a 400 that survives becomes a
  `vehicleNotRecognized` diagnosis with `knownModels` — never an `unavailable` payload.
- **govinfo per-section USC URLs soft-404** (redirect to `/error` with HTTP 200), and
  the govinfo edition lags years behind. The law corpus captures from OLRC
  (uscode.house.gov), whose chapter view returns the whole chapter in one document and
  embeds its own `currentthrough:YYYYMMDD_PL` marker — `capture-uscode.ts` hard-fails
  if that marker is missing rather than writing a corpus that cannot state its currency.
- **`/health` reads `corpus_meta` uncached, and must keep doing so.** Every other
  D1 read on the Worker goes through the result cache, whose namespace is
  `CORPUS_VERSION`. That is correct for tools and useless for `/health`: the one
  question it answers is whether `CORPUS_VERSION` was bumped to match the data,
  and if the var was *not* bumped then the stale rows are still cached under the
  unchanged key. A cached read then agrees with the stale var and reports
  `corpusVersionStale: false` for an hour, starting at the exact moment you would
  check. Found by dropping the table under a running `wrangler dev` and watching
  /health cheerfully keep reporting the dates.
- **Closing the MCP server after `handleRequest` returns an empty 200.** In the Worker,
  `transport.handleRequest()` resolves as soon as the response *stream* exists — the
  JSON-RPC payload is written into it later, when the server finishes handling the
  message. A `ctx.waitUntil(server.close())` after it tears the transport down first,
  and the client gets HTTP 200 with correct SSE headers and a completely empty body,
  which reads as a hung server rather than an error. Do not add teardown: everything
  in the handler is per-request and collected with the isolate.
- **`wrangler d1 execute` rejects a file over the phrase in a comment.** The check is
  `sql.includes("BEGIN TRANSACTION")` on raw text — no comment stripping, no
  string-literal awareness — and its one-shot `.replace()` cannot remove a second
  occurrence. A comment *saying* the file contains no such statement is enough to be
  refused. `build-d1-sql.ts` now hard-fails at generation time if the phrase appears
  anywhere in the output, including inside a quoted inquiry, because at import time
  the error names nothing.
- **`wrangler d1 execute --file` does not stream the file through `execute`.** It
  routes a large file through D1's dedicated import path automatically. The 25.5 MB /
  338-statement corpus imported in 6.9 s on the first attempt. Don't pre-chunk.
- **A deployed Worker with no route is not reachable, and says so unhelpfully.** With
  no workers.dev subdomain registered on the account, the printed
  `*.workers.dev` URL resolves in DNS (wildcard) but fails the TLS handshake, which
  looks like a broken deploy. It is not: `wrangler deploy` reports "No targets
  deployed". Verify with `wrangler dev --remote`, which runs the real Worker on the
  edge against remote D1 without any public hostname.
- **Bun + OneDrive `mkdirSync(..., { recursive: true })` throws EEXIST** even with `recursive: true` on already-existing dirs. Pattern: `if (!existsSync(dir)) mkdirSync(dir, { recursive: true })`. Caught in `scripts/seed-sample.ts`.
- **DEG soft-404s.** Unknown/private inquiry IDs redirect to `/deg-database/` with HTTP 200, not 404. `fetchInquiry` checks `res.url.includes('/inquiries/{id}/')` and skips on mismatch.
- **DEG inquiry formats vary by year.** Pre-2020 inquiries embed `Issue Summary` / `Suggested Action` / `Area of Vehicle` inside a single `Description` field with `Section6_*` and `Section3_*` markers. `parseDescriptionField` in `scraper.ts` handles the fallback.
- **DEG vehicle make casing is dirty at the source.** "Ford" / "FORD" / "ford" / "mazda" all appear; we preserve source fidelity. Normalization happens at search/citation time, not at ingest.
- **MCP SDK duplicate-name registration throws.** Use `RepairMCPServer.registerStandardTools({ skip: ['find_supporting'] })` to avoid collision when registering a custom replacement under the same tool name. Or just use `registerDegTools(server, adapter)` which handles all 4.
- **`process.env.TZ` mutation** takes effect mid-process on bun (calls `tzset()`). The TZ-invariance citation test relies on this — it isn't a tautology.
- **The DEG index can come back truncated, and that is corpus-fatal.** `/grid/get/all`
  returned 22,661 rows all day on 2026-08-02 and 200 that evening — HTTP 200, valid
  JSON, `count: 200` declared, reproducible across fetches, recovered by the next
  morning. Nothing about the response says it is partial; the server states the short
  count as fact. `checkPlanSanity` aborts (exit 3) when the index covers under 90% of
  non-delisted rows or a run would delist more than 50. Deliberately no override flag.
  Transient is the dangerous case, not the reassuring one — it means this recurs.
- **Three ways a DEG record can be unservable, and they are not the same.**
  `delisted_at` = gone from the index. `dead_at` = still indexed, detail page 404s
  (needs two sightings to confirm; any success clears it). "Skipped" = no usable text
  at all. Only the first is observable from the index alone.
- **DEG's index and detail page disagree about status.** 83 inquiries are `Resolved`
  in the index with an empty Resolution cell; 30 of the 61 `Submitted to IP` rows carry
  a resolution date anyway. Neither is a bug on our side — don't "fix" it by forcing
  agreement.
- **`getChangedFieldHistogram` is scoped to the run, not the batch.** The report says
  "run to date" and means it. After a fix lands mid-run the counts stop growing rather
  than resetting — easily misread as the fix not working.
- **The high-water mark falls back to `MAX(db_id)` when unrecorded**, so it appears to
  advance on its own as rows land. Use `getHighWaterInfo` and check `source`; the plain
  `getHighWater` cannot tell "never recorded" from "recorded".
- **Statement generics go on `prepare`, not on `all`/`get`.** bun-types declares
  `prepare<ReturnType, ParamsType>(sql)`; `.all()` and `.get()` take none. Writing
  `.all<T>()` compiles to `unknown` and was the source of ~100 errors. Use
  `db.prepare<{ db_id: number }, SQLQueryBindings[]>(sql).all()`.
- **Inject `FetchLike`, not `typeof fetch`.** bun's lib type carries `preconnect`, so
  every test double had to be cast to satisfy a method nothing calls. `FetchLike`
  (`tier2.ts`) is the minimal shape this package actually uses.

---

## Where to look for context

- **Design questions:** `docs/ARCHITECTURE.md` first.
- **What's broken / what changed:** `git log --oneline` — every commit is one hour-block of work. PRs aren't used yet; main is the working branch.
- **What's running on Claude Desktop:** `apps/deg-server/dist/stdio.js`. Restart Claude Desktop after rebuilds.
- **What "good" looks like for a tool description:** `packages/deg/src/tools.ts` constants — those are the gold standard.
- **What "good" looks like for a test:** `packages/core/test/citation.test.ts` — first proves the platform divergence exists, then proves the function is invariant. Pattern the project owner explicitly endorsed.
- **What the sync actually did:** `sync_run` and `sync_item` in `C:\degdata\deg.sqlite`.
  Every item carries its outcome, HTTP status, and which fields changed. Faster than
  re-reading logs.
- **Why a sync rule exists:** the doc comment above it. Each one names the db_ids and
  the date that forced it, so a rule that looks arbitrary can be traced to real data.

---

## When in doubt

- Prefer simplicity. This is v1. Vector search, OAuth, multi-source unification are deferred for a reason.
- Don't paint into corners — if a v1 shortcut would make v2 painful (hardcoding DEG-specific assumptions into core), stop and refactor before continuing.
- If a change touches `packages/core/`, ask whether it would still make sense for I-CAR or NHTSA verticals. If not, push it down into `packages/deg/`.
