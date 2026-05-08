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
  data/sample-inquiries.json   50 hand-curated DEG inquiries
  dist/stdio.js       The path Claude Desktop spawns

scripts/seed-sample.ts          Polite scraper that produces sample-inquiries.json
docs/ARCHITECTURE.md            The build spec — read first for design questions
```

`ingestion/` and `apps/deg-server/migrations/` from §5 don't exist yet — they land when D1 is wired (post-demo).

---

## Commands

```bash
bun install                               # sync workspace deps
bun run build                             # turbo build all 3 packages → dist/
cd packages/core && bun test              # 7 tests (citation TZ invariance)
cd packages/deg  && bun test              # 24 tests (scoring + integration)
bun scripts/seed-sample.ts                # re-scrape DEG into sample-inquiries.json
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

---

## Build status — Day 2 in progress

| Block | Status | What landed |
|---|---|---|
| D1 h1–2 Scaffold | ✅ | Monorepo, Turbo, pnpm workspaces, strict TS |
| D1 h3–4 Sample scrape | ✅ | 50 inquiries, scraper handles old + new DEG formats, redirect detection |
| D1 h5–6 Core abstractions | ✅ | `SourceAdapter`, `RepairMCPServer`, `buildCitation`, 4 standard tool builders |
| D1 h7–8 DEG adapter + STDIO | ✅ | `DEGAdapter` (in-memory), `apps/deg-server/dist/stdio.js` ready for Claude Desktop |
| D2 h1–3 Killer scoring | ✅ | `deg_find_supporting` returns 40990 #1 at confidence 0.883 for "blend two-tone refinish". 24 unit tests. |
| D2 h4 Citation UTC polish | ✅ | `fmtDateUtc` + 7 TZ-invariance tests across PT/UTC/Tokyo |
| D2 h5 Tool description rewrites | ✅ | All 4 tools have shop-floor "USE THIS WHEN:" descriptions; `registerDegTools(server, adapter)` helper |
| D2 h6 End-to-end test | ⏳ next | 3 supplement-writing scenarios in Claude Desktop |
| D2 h7 Demo recording + sample top-up | ⏳ | 90-sec Loom; top up to ~70 inquiries with more Mitchell/Audatex |
| D2 h8 Outreach package | ⏳ | One-page PDF + Loom link + email to Danny |

**Test totals:** 31 passing (7 core + 24 deg). 0 failing.

---

## Backlog (deferred until called)

- **Sample top-up to ~70 records before D2 h7.** Iterate more inquiry IDs, append only Mitchell/Audatex classified records until each IP has ~10. Current distribution: CCC 37, Audatex 3, Mitchell 2, unknown 8.
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

---

## Where to look for context

- **Design questions:** `docs/ARCHITECTURE.md` first.
- **What's broken / what changed:** `git log --oneline` — every commit is one hour-block of work. PRs aren't used yet; main is the working branch.
- **What's running on Claude Desktop:** `apps/deg-server/dist/stdio.js`. Restart Claude Desktop after rebuilds.
- **What "good" looks like for a tool description:** `packages/deg/src/tools.ts` constants — those are the gold standard.
- **What "good" looks like for a test:** `packages/core/test/citation.test.ts` — first proves the platform divergence exists, then proves the function is invariant. Pattern Travis explicitly endorsed.

---

## When in doubt

- Prefer simplicity. This is v1. Vector search, OAuth, multi-source unification are deferred for a reason.
- Don't paint into corners — if a v1 shortcut would make v2 painful (hardcoding DEG-specific assumptions into core), stop and refactor before continuing.
- If a change touches `packages/core/`, ask whether it would still make sense for I-CAR or NHTSA verticals. If not, push it down into `packages/deg/`.
