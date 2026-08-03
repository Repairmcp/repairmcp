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
  src/scoring.ts      Killer scoring for find_supporting (bigram + unigram + IP/vehicle/op/recency)
  src/tools.ts        DEG tool builders + registerDegTools(server, adapter)
  test/               scoring unit tests (24)

apps/deg-server/      @repairmcp/deg-server — Cloudflare Worker (currently STDIO only)
  src/stdio.ts        Local STDIO entry for Claude Desktop
  data/sample-inquiries.json        50 hand-curated DEG inquiries
  data/deg-inquiries-full.json      the served corpus — 22,652 records, gitignored
  dist/stdio.js       The path Claude Desktop spawns

ingestion/deg-backfill/   @repairmcp/deg-backfill — the crawler and delta sync
  src/tier1.ts        index fetch (fetchIndex) + metadata upsert (upsertIndexEntries)
  src/tier2.ts        fetchDetail — retry/backoff/soft-404 detection; RATE_DELAY_MS
  src/parser.ts       Cheerio detail-page parser (handles old + new DEG formats)
  src/db.ts           schema + all row accessors and cohort queries
  src/hash.ts         content hashing over served fields; normalize / diffFields
  src/state.ts        sync_state / sync_run / sync_item; high-water; migrations
  src/sync.ts         planSync (pure) + runBatch + checkPlanSanity
  src/cli.ts          original backfill entry
  src/sync-cli.ts     delta sync entry — the one you want now
  test/               135 tests

scripts/seed-sample.ts          Polite scraper that produces sample-inquiries.json
scripts/transform-deg-sqlite.ts SQLite -> deg-inquiries-full.json, with --dry-run
docs/ARCHITECTURE.md            The build spec — read first for design questions
```

**Two DEG databases exist and only one is real.** The live corpus is
`C:\degdata\deg.sqlite` (22,662 rows). `ingestion/deg-backfill/deg.sqlite` is a
stale partial from 2026-06-26 with 22,122 bodies unfetched — pointing the sync
at it would re-crawl 22k pages. `sync-cli.ts` requires `--db` explicitly for
this reason; set `DEG_DB_PATH` to avoid retyping. The stale file should be
deleted.

`apps/deg-server/migrations/` from §5 still doesn't exist — it lands when D1 is
wired (post-demo).

---

## Commands

```bash
bun install                               # sync workspace deps
bun run build                             # turbo build all 3 packages → dist/
cd packages/core        && bun test       # 7 tests (citation TZ invariance)
cd packages/deg         && bun test       # 24 tests (scoring + integration)
cd ingestion/deg-backfill && bun test     # 135 tests (sync, hash, parser, tier1/2)
bun scripts/seed-sample.ts                # re-scrape DEG into sample-inquiries.json
```

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

**Regenerate the served corpus** after a sync completes:

```bash
npx tsx scripts/transform-deg-sqlite.ts --dry-run   # summary + diff vs served file
npx tsx scripts/transform-deg-sqlite.ts             # writes it
```

After editing source, **always rebuild before Claude Desktop re-spawns** the server — it loads `dist/stdio.js`, not source. Force a re-spawn by killing all `Claude.exe` and relaunching.

---

## Conventions (vital)

- **Vertical-agnostic core, vertical-specific adapters.** Anything DEG-specific (shop-floor language, IP keywords, scoring weights) lives in `packages/deg/`. `packages/core/` knows nothing about collision repair.
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
| D2 h8 Outreach package | ⏳ | One-page PDF + Loom link + email to Danny |

**Test totals:** 166 passing (7 core + 24 deg + 135 ingestion). 0 failing.

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
- **Nightly unattended sync.** `--mode nightly` is recorded on the run but the
  operational design doesn't exist: no scheduling, no failure alerting, no rule for
  who regenerates the JSON and restarts the server. The script is parametrized and
  resumable; the surrounding automation is not designed.
- **Audatex coverage is collapsing.** Zero new Audatex inquiries in the five weeks to
  2026-08-02; the newest in the whole corpus is 41424 (2026-06-18). Audatex is 8.4% of
  the corpus historically but 1.3% of the last 1,000 ids. Kills any plan to balance IP
  distribution by pulling recent inquiries.
- **Make normalization.** 101 rows say `Mercedes` where others say `Mercedes Benz` /
  `MERCEDES`; `Ford`/`FORD`/`ford` throughout. Distinct from the truncation bug, which
  is fixed. Belongs at query time, not ingest — source fidelity is the convention.
- **`openDb` creates on open**, so a mistyped `--db` yields an empty corpus rather than
  an error. `--db` being required is the main protection; refusing to open a database
  with no `inquiry` table would close it.
- **Cloudflare Workers transport research before any deploy.** SDK 1.29.0 has `StreamableHTTPServerTransport` (Node-only) but not the `WebStandardStreamableHTTPServerTransport` mentioned in researcher findings. Need 15-min report on three options: (a) bump SDK, (b) custom fetch-handler wrapper that creates a fresh `McpServer`+transport per request, (c) Cloudflare's `agents/mcp` `createMcpHandler`. Report and recommend before implementing.
- **`deg_get_estimating_tip` (5th tool).** Spec includes it; deferred post-demo. Needs separate scrape path, schema, parser, sample data. Demo doesn't need it.
- **D1 schema migration + cron refresh.** Whole `apps/deg-server/migrations/` and `cron.ts` deferred until D1 wiring (post-demo).

---

## Known gotchas

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
- **Bun's `Statement.all<T>()` type args don't typecheck** against the installed
  `bun-types`, and `ingestion/deg-backfill/tsconfig.json` sets `rootDir: ./src` while
  including `test/**/*`. Both predate this work; `tsc` has never been clean on that
  package. `bun test` is the real gate.

---

## Where to look for context

- **Design questions:** `docs/ARCHITECTURE.md` first.
- **What's broken / what changed:** `git log --oneline` — every commit is one hour-block of work. PRs aren't used yet; main is the working branch.
- **What's running on Claude Desktop:** `apps/deg-server/dist/stdio.js`. Restart Claude Desktop after rebuilds.
- **What "good" looks like for a tool description:** `packages/deg/src/tools.ts` constants — those are the gold standard.
- **What "good" looks like for a test:** `packages/core/test/citation.test.ts` — first proves the platform divergence exists, then proves the function is invariant. Pattern Travis explicitly endorsed.
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
