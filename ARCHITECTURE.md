# RepairMCP — Architecture & Build Specification

> **Version:** 1.0
> **Status:** v1 build spec (DEG MCP, the first vertical)
> **License:** Apache 2.0
> **Repository:** [github.com/Repairmcp/repairmcp](https://github.com/Repairmcp/repairmcp)

---

## Table of contents

1. [Overview](#1-overview)
2. [Goals & constraints](#2-goals--constraints)
3. [System architecture](#3-system-architecture)
4. [Tech stack](#4-tech-stack)
5. [Repository structure](#5-repository-structure)
6. [Core abstractions](#6-core-abstractions)
7. [DEG vertical implementation](#7-deg-vertical-implementation)
8. [Database schema](#8-database-schema)
9. [Scraping strategy](#9-scraping-strategy)
10. [Deployment topology](#10-deployment-topology)
11. [Two-day build sequence](#11-two-day-build-sequence)
12. [Adding a future vertical](#12-adding-a-future-vertical-the-duplication-recipe)
13. [What's deferred from v1](#13-whats-deferred-from-v1)
14. [Setup commands appendix](#14-setup-commands-appendix)
15. [Acceptance criteria](#15-acceptance-criteria)
16. [References](#16-references)

---

## 1. Overview

RepairMCP is an open-source family of [Model Context Protocol](https://modelcontextprotocol.io) servers that expose authoritative shop-side data sources in the vehicle repair industry directly to AI tools (Claude, ChatGPT, Cursor, Copilot, and any other MCP-compatible client).

The first vertical is **DEG** — the Database Enhancement Gateway. Once shipped, the same architecture supports I-CAR RTS, NHTSA, OEM service bulletins, and other shop-side data sources with minimal additional code per vertical.

This document is the build specification. It is intended to be executed against by Claude Code or any developer following the build sequence in §11.

---

## 2. Goals & constraints

### Functional goals

- **Demo in 2 focused build days**: working DEG MCP, callable from Claude Desktop, returning real DEG inquiry data with citations
- **Production foundation**: demo code must become v1 production code with minimal rework
- **Vertical-agnostic core**: ~80% of code must be reused when adding the next vertical
- **Citation-grade outputs**: every tool result includes inquiry ID, source name, dates, and source URL — formatted to drop directly into AI-generated supplements

### Non-functional constraints

- **Apache 2.0 open source from day one** — no proprietary code, no closed dependencies
- **Operational cost**: target $0–10/month at launch (Cloudflare free tier)
- **Polite scraping**: respect `robots.txt`, rate-limited, identifiable User-Agent
- **No PII**: v1 handles only public, attributable data
- **No write operations to source sites in v1** — read-only only

### Strategic constraints

- All RepairMCP code lives under `github.com/Repairmcp/`. No code leaks into BainbridgeAI or personal repos.
- Foundation governance is the eventual destination — keep maintainership clean and contributor-friendly.

---

## 3. System architecture

```
┌──────────────────┐
│  degweb.org      │  Source site (public web)
└────────┬─────────┘
         │ daily scrape, rate-limited
         ▼
┌──────────────────┐
│  Ingestion       │  Cloudflare Worker (Cron Trigger)
│  Worker          │  Schedule: 1x/day at 03:00 UTC
└────────┬─────────┘
         │ writes (upsert)
         ▼
┌──────────────────┐
│  Cloudflare D1   │  SQLite-at-edge primary store
│  + FTS5 index    │  Full-text search built-in
└────────┬─────────┘
         │ reads
         ▼
┌──────────────────┐    ┌──────────────────┐
│  Cloudflare KV   │◄───│  MCP Server      │
│  (hot cache)     │    │  Worker          │
└──────────────────┘    │  HTTPS endpoint  │
                        │  + STDIO (local) │
                        └────────┬─────────┘
                                 │ MCP tool calls
                                 ▼
                        ┌──────────────────┐
                        │  AI Clients      │
                        │  Claude / GPT /  │
                        │  Cursor / etc.   │
                        └──────────────────┘
```

**Two Cloudflare Workers, one D1 database, one KV namespace.** That's the entire production footprint.

---

## 4. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety, ecosystem, Travis's existing stack |
| Runtime (dev) | Bun | Fast, modern, matches `cyanheads/mcp-ts-template` defaults |
| Runtime (prod) | Cloudflare Workers | Edge, free tier, built-in cron + D1 + KV |
| Base template | [`cyanheads/mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template) | Apache 2.0, production-grade, recently updated |
| MCP SDK | [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | Official Anthropic SDK |
| Validation | Zod | Bundled with template, ecosystem standard |
| Storage (primary) | Cloudflare D1 | SQLite at edge, FTS5 built-in, free tier |
| Storage (cache) | Cloudflare KV | Hot lookup acceleration |
| Storage (vector, v2) | Cloudflare Vectorize | Defer until v2 |
| HTTP client | `undici` (or built-in `fetch`) | Standard, performant |
| HTML parsing | `cheerio` | Static HTML — no Playwright needed for DEG |
| Build orchestration | Turborepo + pnpm workspaces | Clean monorepo, parallel builds |
| Deploy | Wrangler CLI | Cloudflare standard tooling |
| Testing | Vitest | Already in template |
| Lint / Format | ESLint + Prettier | Standard |

---

## 5. Repository structure

This is a monorepo. Single GitHub repo (`Repairmcp/repairmcp`), pnpm workspaces, Turborepo orchestration.

```
repairmcp/
├── packages/
│   ├── core/                           # @repairmcp/core (publishable npm pkg)
│   │   ├── src/
│   │   │   ├── adapter/
│   │   │   │   ├── source-adapter.ts   # SourceAdapter interface
│   │   │   │   └── types.ts            # BaseItem, SearchQuery, etc.
│   │   │   ├── citation/
│   │   │   │   ├── formatter.ts        # Citation builder helpers
│   │   │   │   └── schema.ts           # Citation type
│   │   │   ├── cache/
│   │   │   │   ├── strategy.ts         # CacheStrategy interface
│   │   │   │   ├── kv-cache.ts         # Cloudflare KV impl
│   │   │   │   └── memory-cache.ts     # In-memory (dev/test)
│   │   │   ├── search/
│   │   │   │   ├── fts.ts              # SQLite FTS5 wrapper
│   │   │   │   └── ranker.ts           # Scoring/ranking logic
│   │   │   ├── ingestion/
│   │   │   │   ├── scraper-base.ts     # Generic scraping helpers
│   │   │   │   └── refresher.ts        # Periodic refresh orchestration
│   │   │   ├── server/
│   │   │   │   ├── mcp-server.ts       # RepairMCPServer base class
│   │   │   │   └── tool-builder.ts     # Auto-generates standard tools
│   │   │   └── index.ts                # Barrel exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── deg/                            # @repairmcp/deg (DEG vertical)
│       ├── src/
│       │   ├── adapter.ts              # DEGAdapter implements SourceAdapter
│       │   ├── scraper.ts              # DEG-specific HTML parsing
│       │   ├── schema.ts               # DEGInquiry shape + Zod schema
│       │   ├── citation.ts             # DEG citation formatter
│       │   ├── tools.ts                # 5 tool definitions
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── deg-server/                     # Deployable Cloudflare Worker
│       ├── src/
│       │   ├── index.ts                # Worker entry (HTTP MCP transport)
│       │   ├── stdio.ts                # Local STDIO entry (for Claude Desktop)
│       │   └── cron.ts                 # Scheduled refresh handler
│       ├── data/
│       │   └── sample-inquiries.json   # Day 1 seed data
│       ├── wrangler.toml               # Cloudflare config
│       ├── package.json
│       └── tsconfig.json
│
├── ingestion/
│   └── deg-backfill/                   # One-time historical scrape CLI
│       ├── src/
│       │   └── backfill.ts             # CLI entry
│       └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md                 # This document
│   ├── ADDING-A-VERTICAL.md            # How to ship a new MCP
│   ├── DEPLOYMENT.md                   # Cloudflare setup walkthrough
│   ├── GOVERNANCE.md                   # Project governance (placeholder)
│   └── CONTRIBUTING.md                 # Contribution guide (placeholder)
│
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Lint + test on PR
│       └── deploy.yml                  # Deploy on main merge
│
├── scripts/
│   ├── seed-sample.ts                  # Generate sample-inquiries.json
│   └── verify-citations.ts             # Spot-check citation accuracy
│
├── package.json                        # Root, pnpm workspace config
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── README.md                           # Main repo README (different from org profile)
├── LICENSE                             # Apache 2.0
└── CONTRIBUTING.md
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "ingestion/*"
```

### `turbo.json` (minimal v1)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## 6. Core abstractions

The `@repairmcp/core` package contains everything that's vertical-agnostic. New verticals (I-CAR, NHTSA, OEM bulletins) implement against these interfaces and get the standard MCP server scaffolding for free.

### 6.1 Base types

`packages/core/src/adapter/types.ts`:

```typescript
import { z } from 'zod';

/**
 * Common base for any item type returned by a SourceAdapter.
 * Verticals extend this with their domain-specific fields.
 */
export interface BaseItem {
  id: string;                           // Stable unique ID within source
  title: string;
  url: string;                          // Permalink to original
  lastUpdated: Date;
  metadata: Record<string, unknown>;
}

/**
 * Standard citation format returned alongside every item.
 * AIs are instructed to use shortForm or longForm verbatim.
 */
export interface Citation {
  shortForm: string;                    // e.g. "DEG #14732 (3/14/2025)"
  longForm: string;                     // Full attribution sentence
  sourceId: string;                     // e.g. "deg"
  sourceName: string;                   // e.g. "Database Enhancement Gateway"
  itemId: string;                       // e.g. "14732"
  url: string;
  retrievedAt: Date;
  publishedAt?: Date;
  resolvedAt?: Date;
}

export const SearchQuerySchema = z.object({
  text: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0)
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export interface SearchResult<T extends BaseItem> {
  item: T;
  score: number;                        // Relevance 0–1
  snippet?: string;                     // Highlighted match text
  citation: Citation;
}

export interface ListRecentOpts {
  since?: Date;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface RefreshResult {
  scanned: number;
  added: number;
  updated: number;
  errors: number;
  durationMs: number;
}
```

### 6.2 SourceAdapter interface

`packages/core/src/adapter/source-adapter.ts`:

```typescript
import type {
  BaseItem,
  Citation,
  SearchQuery,
  SearchResult,
  ListRecentOpts,
  RefreshResult
} from './types';

/**
 * The contract every vertical must implement.
 * Implementing this gives you the 4 standard MCP tools for free.
 */
export interface SourceAdapter<TItem extends BaseItem> {
  // Identity
  readonly sourceId: string;            // e.g. "deg"
  readonly sourceName: string;          // e.g. "Database Enhancement Gateway"
  readonly sourceUrl: string;           // e.g. "https://degweb.org"
  readonly description: string;         // 1–2 sentence description for tool docs

  // Discovery
  search(query: SearchQuery): Promise<SearchResult<TItem>[]>;
  getById(id: string): Promise<TItem | null>;
  listRecent(opts: ListRecentOpts): Promise<TItem[]>;

  // Citation
  formatCitation(item: TItem): Citation;

  // Refresh (called by ingestion layer)
  refresh(opts?: { since?: Date }): Promise<RefreshResult>;
}
```

### 6.3 Citation formatter

`packages/core/src/citation/formatter.ts`:

```typescript
import type { Citation } from '../adapter/types';

export interface CitationInput {
  sourceId: string;
  sourceName: string;
  sourceShortName: string;              // e.g. "DEG" for short form
  itemId: string;
  url: string;
  publishedAt?: Date;
  resolvedAt?: Date;
}

export function buildCitation(input: CitationInput): Citation {
  const dateForShort = input.resolvedAt ?? input.publishedAt;
  const dateStr = dateForShort
    ? dateForShort.toLocaleDateString('en-US')
    : 'date unknown';

  const shortForm = `${input.sourceShortName} #${input.itemId} (${dateStr})`;

  const longForm = input.resolvedAt
    ? `${input.sourceName} inquiry #${input.itemId}, resolved ${input.resolvedAt.toLocaleDateString('en-US')}, ${input.url}`
    : `${input.sourceName} entry #${input.itemId}, ${input.url}`;

  return {
    shortForm,
    longForm,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    itemId: input.itemId,
    url: input.url,
    retrievedAt: new Date(),
    publishedAt: input.publishedAt,
    resolvedAt: input.resolvedAt
  };
}
```

### 6.4 RepairMCPServer base class

`packages/core/src/server/mcp-server.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { SourceAdapter } from '../adapter/source-adapter';
import type { BaseItem } from '../adapter/types';
import { buildSearchTool, buildGetByIdTool, buildListRecentTool, buildFindSupportingTool } from './tool-builder';

export interface ServerOpts {
  name: string;                         // Server name (e.g. "repairmcp-deg")
  version: string;
}

export class RepairMCPServer<TItem extends BaseItem> {
  private mcpServer: Server;
  private customTools: Tool[] = [];

  constructor(
    private adapter: SourceAdapter<TItem>,
    private opts: ServerOpts
  ) {
    this.mcpServer = new Server(
      { name: opts.name, version: opts.version },
      { capabilities: { tools: {} } }
    );
  }

  /**
   * Register the 4 standard tools auto-generated from the adapter.
   * Tool names are prefixed with the source ID (e.g. deg_search).
   */
  registerStandardTools(): this {
    const tools = [
      buildSearchTool(this.adapter),
      buildGetByIdTool(this.adapter),
      buildListRecentTool(this.adapter),
      buildFindSupportingTool(this.adapter)
    ];
    tools.forEach(t => this.registerTool(t));
    return this;
  }

  /**
   * Register a vertical-specific custom tool (e.g. deg_get_estimating_tip).
   */
  registerCustomTool(tool: Tool): this {
    this.customTools.push(tool);
    this.registerTool(tool);
    return this;
  }

  private registerTool(tool: Tool): void {
    // Wire tool into MCP server using SDK's setRequestHandler pattern.
    // (Implementation detail — see SDK docs.)
  }

  getServer(): Server {
    return this.mcpServer;
  }
}
```

> **Note for Claude Code:** The exact MCP SDK wiring depends on the SDK version. Reference the cyanheads template's tool registration pattern when implementing `registerTool`. Don't hand-roll JSON-RPC.

---

## 7. DEG vertical implementation

The `@repairmcp/deg` package is the first concrete vertical adapter. It implements `SourceAdapter<DEGInquiry>` and adds one custom tool (`deg_get_estimating_tip`).

### 7.1 DEGInquiry schema

`packages/deg/src/schema.ts`:

```typescript
import { z } from 'zod';

export const InformationProviderSchema = z.enum(['CCC', 'Mitchell', 'Audatex']);
export type InformationProvider = z.infer<typeof InformationProviderSchema>;

export const InquiryStatusSchema = z.enum(['pending', 'resolved', 'closed']);
export type InquiryStatus = z.infer<typeof InquiryStatusSchema>;

export const LaborTypeSchema = z.enum([
  'body', 'paint', 'mechanical', 'frame', 'refinish', 'other'
]);
export type LaborType = z.infer<typeof LaborTypeSchema>;

export const DEGInquirySchema = z.object({
  // BaseItem fields
  id: z.string(),                       // DEG inquiry number, e.g. "14732"
  title: z.string(),                    // Auto-generated summary
  url: z.string().url(),
  lastUpdated: z.coerce.date(),
  metadata: z.record(z.unknown()),

  // DEG-specific fields
  inquiryNumber: z.string(),
  ip: InformationProviderSchema,
  vehicleYear: z.number().int().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  operation: z.string(),
  laborType: LaborTypeSchema.optional(),
  inquiryText: z.string(),
  ipResponse: z.string().optional(),
  status: InquiryStatusSchema,
  submittedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().optional()
});

export type DEGInquiry = z.infer<typeof DEGInquirySchema>;
```

### 7.2 Tools exposed by the DEG MCP

| Tool name | Purpose | Inputs | Output |
|---|---|---|---|
| `deg_search_inquiries` | Text + filter search | `query`, `vehicle?`, `ip?`, `status?`, `since?`, `limit?` | Ranked `SearchResult<DEGInquiry>[]` |
| `deg_get_inquiry` | Full inquiry by ID | `id` | `DEGInquiry` + citation |
| `deg_list_recent` | What's new | `since?`, `ip?`, `limit?` | `DEGInquiry[]` newest first |
| `deg_find_supporting` | Match line item to inquiries | `lineItemText`, `vehicle?` | Ranked supporting inquiries with confidence scores |
| `deg_get_estimating_tip` | Weekly tip retrieval | `week?`, `category?` | Tip with citation |

### 7.3 Tool description style

**This is critical for AI tool-call quality.** The prose description tells the AI exactly *when* to call the tool. Generic descriptions cause tools to be missed or misapplied.

Pattern to follow:

```typescript
{
  name: 'deg_find_supporting',
  description: `Find DEG inquiries that support charging or denying a specific labor operation.

USE THIS WHEN:
- Writing a supplement and need DEG citations to justify a line item
- An insurer denied an operation and you need precedent
- Wondering if "not-included" status has been challenged on a similar operation
- A line item appears on an estimate and you want to verify whether it's
  established practice in DEG resolutions

INPUT: The line item description in plain language (e.g. "R&I rear bumper
for refinish on adjacent panel"), and optionally vehicle year/make/model.

OUTPUT: Ranked list of relevant inquiries with confidence scores and
ready-to-cite formatted citations. Use citation.shortForm verbatim
when referencing in your response (e.g. "DEG #14732 (3/14/2025)").`,
  inputSchema: { /* Zod schema */ }
}
```

Every tool gets this treatment. Tool descriptions are the AI's primary signal for routing decisions — invest the words.

### 7.4 DEGAdapter

`packages/deg/src/adapter.ts` (skeleton — Claude Code fills in):

```typescript
import type { SourceAdapter } from '@repairmcp/core';
import type { DEGInquiry } from './schema';
import { buildCitation } from '@repairmcp/core/citation';
import { scrapeInquiryListing, scrapeInquiryDetail } from './scraper';

export class DEGAdapter implements SourceAdapter<DEGInquiry> {
  readonly sourceId = 'deg';
  readonly sourceName = 'Database Enhancement Gateway';
  readonly sourceUrl = 'https://degweb.org';
  readonly description = 'Industry-funded inquiry resolution system for collision estimating database accuracy.';

  constructor(private db: D1Database) {}

  async search(query: SearchQuery): Promise<SearchResult<DEGInquiry>[]> { /* FTS5 query */ }
  async getById(id: string): Promise<DEGInquiry | null> { /* D1 lookup */ }
  async listRecent(opts: ListRecentOpts): Promise<DEGInquiry[]> { /* D1 query by date */ }

  formatCitation(item: DEGInquiry) {
    return buildCitation({
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceShortName: 'DEG',
      itemId: item.inquiryNumber,
      url: item.url,
      publishedAt: item.submittedAt,
      resolvedAt: item.resolvedAt
    });
  }

  async refresh(opts) { /* scrape + upsert */ }
}
```

---

## 8. Database schema (Cloudflare D1)

```sql
-- Primary inquiry table
CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,                  -- DEG inquiry number
  ip TEXT NOT NULL,                     -- 'CCC' | 'Mitchell' | 'Audatex'
  vehicle_year INTEGER,
  vehicle_make TEXT,
  vehicle_model TEXT,
  operation TEXT NOT NULL,
  labor_type TEXT,
  inquiry_text TEXT NOT NULL,
  ip_response TEXT,
  status TEXT NOT NULL,                 -- 'pending' | 'resolved' | 'closed'
  submitted_at INTEGER NOT NULL,        -- Unix timestamp (ms)
  resolved_at INTEGER,
  url TEXT NOT NULL,
  scraped_at INTEGER NOT NULL,
  raw_html TEXT                         -- Keep original for re-parsing
);

CREATE INDEX idx_inquiries_ip ON inquiries(ip);
CREATE INDEX idx_inquiries_status ON inquiries(status);
CREATE INDEX idx_inquiries_vehicle
  ON inquiries(vehicle_year, vehicle_make, vehicle_model);
CREATE INDEX idx_inquiries_resolved_at ON inquiries(resolved_at DESC);
CREATE INDEX idx_inquiries_submitted_at ON inquiries(submitted_at DESC);

-- Full-text search virtual table (FTS5)
CREATE VIRTUAL TABLE inquiries_fts USING fts5(
  id UNINDEXED,
  operation,
  inquiry_text,
  ip_response,
  vehicle_make,
  vehicle_model,
  content=inquiries,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER inquiries_ai AFTER INSERT ON inquiries BEGIN
  INSERT INTO inquiries_fts(id, operation, inquiry_text, ip_response, vehicle_make, vehicle_model)
  VALUES (new.id, new.operation, new.inquiry_text, new.ip_response, new.vehicle_make, new.vehicle_model);
END;

CREATE TRIGGER inquiries_ad AFTER DELETE ON inquiries BEGIN
  DELETE FROM inquiries_fts WHERE id = old.id;
END;

CREATE TRIGGER inquiries_au AFTER UPDATE ON inquiries BEGIN
  DELETE FROM inquiries_fts WHERE id = old.id;
  INSERT INTO inquiries_fts(id, operation, inquiry_text, ip_response, vehicle_make, vehicle_model)
  VALUES (new.id, new.operation, new.inquiry_text, new.ip_response, new.vehicle_make, new.vehicle_model);
END;

-- Estimating tips
CREATE TABLE estimating_tips (
  id TEXT PRIMARY KEY,
  week_of INTEGER NOT NULL,             -- Unix timestamp of Monday of that week
  ip TEXT,
  category TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  scraped_at INTEGER NOT NULL
);

CREATE INDEX idx_tips_week ON estimating_tips(week_of DESC);

-- Refresh log for observability
CREATE TABLE refresh_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  scanned INTEGER,
  added INTEGER,
  updated INTEGER,
  errors INTEGER,
  error_detail TEXT
);
```

### Migration files

Store as `apps/deg-server/migrations/0001_init.sql`. Apply with:

```bash
pnpm --filter deg-server wrangler d1 execute repairmcp_deg --file=migrations/0001_init.sql
```

---

## 9. Scraping strategy

### Site characteristics (verified)

- WordPress-based, mostly static HTML
- Public inquiry detail pages with stable URL structure
- No login required for browsing resolved inquiries
- Estimating tips published weekly
- Pagination follows standard `?page=N` pattern

### Scrape approach

1. **Fetch index pages** of resolved inquiries (paginated)
2. **Parse listing rows** for inquiry IDs and metadata snippets
3. **Fetch each inquiry detail page** (rate-limited, polite)
4. **Parse with Cheerio** into normalized `DEGInquiry`
5. **Diff against existing D1 records** — only insert new or changed
6. **Store raw HTML** (`raw_html` column) for re-parsing if schema evolves

### Polite scraping rules

- **Rate limit**: 1 request per 2 seconds, max
- **Respect** `robots.txt`
- **User-Agent**: `RepairMCP-Bot/1.0 (+https://repairmcp.org)`
- **Backoff**: exponential on 429 / 5xx (start 5s, double, cap 5min)
- **Identifiable**: inquiry traffic should be obvious to DEG admin if they look at logs — that's intentional

### Initial backfill

- Run via `ingestion/deg-backfill` CLI script (Bun)
- Estimated 10–20K inquiries × 2s = 6–12 hours
- Run overnight, output to local SQLite first, bulk-import to D1
- Save `raw_html` for every scrape so we can re-parse later without re-fetching

### Daily refresh (Cloudflare Cron)

- Runs at 03:00 UTC daily
- Fetch only the most recent ~3 listing pages
- Anything new or changed in last 7 days → upsert
- Log result to `refresh_log` table

---

## 10. Deployment topology

### Domains

- `repairmcp.org` → main website (Cloudflare Pages, future)
- `repairmcp.com` → 301 redirect to `.org`
- `deg.repairmcp.org` → DEG MCP server endpoint *(Cloudflare Worker route)*

### Cloudflare resources (free tier)

- 1× Worker — `repairmcp-deg` (HTTP MCP endpoint + cron handler)
- 1× D1 database — `repairmcp_deg`
- 1× KV namespace — `repairmcp_cache`
- 1× Cron Trigger — daily refresh

### `apps/deg-server/wrangler.toml`

```toml
name = "repairmcp-deg"
main = "src/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = false

[[d1_databases]]
binding = "DB"
database_name = "repairmcp_deg"
database_id = "REPLACE_WITH_REAL_ID"

[[kv_namespaces]]
binding = "CACHE"
id = "REPLACE_WITH_REAL_ID"

[triggers]
crons = ["0 3 * * *"]

[routes]
pattern = "deg.repairmcp.org/*"
zone_name = "repairmcp.org"

[vars]
LOG_LEVEL = "info"
RATE_LIMIT_RPS = "0.5"
USER_AGENT = "RepairMCP-Bot/1.0 (+https://repairmcp.org)"
```

### Environment variables

No secrets required for v1 — all data is public read-only. (When inquiry submission lands in v3, OAuth secrets will be needed.)

---

## 11. Two-day build sequence

### Day 1 — End-to-end working slice with sample data

| Block | Tasks | Acceptance |
|---|---|---|
| **Hour 1–2: Scaffold** | Clone `cyanheads/mcp-ts-template` content into `Repairmcp/repairmcp` (don't fork — copy clean). Set up pnpm workspace. Create `packages/core`, `packages/deg`, `apps/deg-server` skeletons. Wire Turborepo. | `bun install && bun run build` succeeds across all workspaces |
| **Hour 3–4: Sample scrape** | Manually curate ~50 DEG inquiries across CCC/Mitchell/Audatex. Save as `apps/deg-server/data/sample-inquiries.json`. Hand-verify each inquiry's fields parse correctly. | JSON file exists with 50 valid `DEGInquiry` records (Zod-validated) |
| **Hour 5–6: Core abstractions** | Implement `SourceAdapter`, `BaseItem`, `Citation`, `SearchQuery` types in `packages/core`. Build `RepairMCPServer` base class. Build `tool-builder` for the 4 standard tools. | Types compile, no `any`, all exports declared |
| **Hour 7–8: DEG adapter (in-memory)** | Implement `DEGAdapter` reading from JSON file (no D1 yet). Implement `deg_search_inquiries` and `deg_get_inquiry`. Wire into MCP server. Add to Claude Desktop via STDIO. | Claude Desktop calls tools and returns valid responses with citations |

**End of Day 1 deliverable:** Claude Desktop can call `deg_search_inquiries("rear bumper R&I")` and get back real DEG data with proper citations.

### Day 2 — Polish + the demo moment

| Block | Tasks | Acceptance |
|---|---|---|
| **Hour 1–3: Killer tool** | Implement `deg_find_supporting`. Use keyword + bigram + vehicle-match scoring for v1 (no embeddings). Confidence score = match strength normalized 0–1. | Calling `deg_find_supporting("R&I bumper for refinish on adjacent panel")` returns ranked relevant inquiries |
| **Hour 4: Citation polish** | Format every output with drop-in `shortForm` and `longForm` strings. Test that Claude embeds them verbatim in responses. Iterate format until it lands cleanly in supplement narratives. | Generated supplement text contains correctly formatted DEG citations |
| **Hour 5: Tool descriptions** | Rewrite each tool description with explicit "USE THIS WHEN:" guidance. Include input examples in description. | Claude correctly routes between tools without explicit hints from user |
| **Hour 6: End-to-end test** | Walk through 3 real supplement-writing scenarios in Claude Desktop. Note any rough edges. Fix the worst ones. | All 3 scenarios produce usable supplement narratives with valid citations |
| **Hour 7: Demo recording** | Record 90-second Loom: open Claude → start writing supplement → AI calls DEG MCP → cites real inquiry → drops it into output. Clean visuals, minimal narration. | Loom renders cleanly, total length ≤ 90s, no awkward pauses |
| **Hour 8: Outreach package** | One-page summary PDF + Loom link + GitHub repo link. Update Danny email draft with Loom link. Ready to send. | Email + Loom + repo link all queued in send-ready state |

**End of Day 2 deliverable:** Demo asset that closes the meeting with Danny on the spot.

---

## 12. Adding a future vertical (the duplication recipe)

This is the section that proves RepairMCP is a protocol, not a project. Documented in `docs/ADDING-A-VERTICAL.md`. Recipe:

1. Create `packages/{vertical}/` directory (copy `packages/deg` as template)
2. Define `{Vertical}Item` schema with Zod (extends `BaseItem`)
3. Implement `{Vertical}Adapter implements SourceAdapter<{Vertical}Item>`
4. Override `formatCitation` for vertical-specific citation style
5. Register custom tools beyond the 4 standard ones (if needed)
6. Create `apps/{vertical}-server/` Cloudflare Worker (copy from `deg-server`)
7. Add migration SQL for vertical-specific schema
8. Update `docs/ARCHITECTURE.md` with new vertical entry
9. Deploy to `{vertical}.repairmcp.org`

**Time to add a new vertical with a stable source: 1–2 days once core is solid.**

### Verticals on the roadmap

| Vertical | Source | Notes |
|---|---|---|
| I-CAR RTS | rts.i-car.com | Editorial summaries + position statements only — no raw OEM data redistribution |
| NHTSA | nhtsa.gov public APIs | Free, well-documented, fastest to ship |
| OEM service bulletins | Various OEM portals | Per-OEM licensing review required |
| SCRS resources | scrs.com | Position papers, Repairer Driven News content |
| CIC proceedings | ciclink.com | Industry conference outcomes |

---

## 13. What's deferred from v1

| Feature | Defer to | Reasoning |
|---|---|---|
| Vector / semantic search | v2 | Keyword search adequate for demo; Vectorize adds cost + complexity |
| Inquiry submission via MCP | v3 | Requires OAuth + write authorization from DEG |
| Multi-source unified search | v2 | Wait until 2+ verticals live |
| Public dashboard / analytics | v2 | Not needed for demo or Danny conversation |
| Authentication / rate limiting | v2 | Public read-only data, no auth needed yet |
| OEM bulletin / I-CAR adapters | Phase 2 | After DEG launches and proves core architecture |
| Web UI for browsing | v2 | MCP-first; web browsing isn't the unique value |

---

## 14. Setup commands appendix

### Prerequisites

```bash
# Install Bun (if not already)
curl -fsSL https://bun.sh/install | bash

# Install Cloudflare Wrangler globally
bun add -g wrangler

# Verify
bun --version          # Should be 1.x+
wrangler --version     # Should be 3.x+
```

### Initial monorepo setup

```bash
# Clone the new repo
git clone https://github.com/Repairmcp/repairmcp.git
cd repairmcp

# Initialize pnpm workspace
echo 'packages:
  - "packages/*"
  - "apps/*"
  - "ingestion/*"' > pnpm-workspace.yaml

# Install pnpm + turbo at root
bun add -d pnpm turbo @types/node typescript

# Create workspace skeletons
mkdir -p packages/core/src packages/deg/src apps/deg-server/src

# Commit baseline
git add .
git commit -m "Initial monorepo scaffold"
git push origin main
```

### Cloudflare resources (one-time)

```bash
# Login
wrangler login

# Create D1 database
wrangler d1 create repairmcp_deg
# → Save the database_id output into wrangler.toml

# Create KV namespace
wrangler kv namespace create repairmcp_cache
# → Save the id output into wrangler.toml

# Apply schema
cd apps/deg-server
wrangler d1 execute repairmcp_deg --file=migrations/0001_init.sql
```

### Development workflow

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm turbo build

# Run tests
pnpm turbo test

# Local STDIO server for Claude Desktop testing
pnpm --filter deg-server run dev:stdio

# Local HTTP server for Streamable HTTP testing
pnpm --filter deg-server run dev:http
```

### Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "repairmcp-deg": {
      "command": "node",
      "args": ["/absolute/path/to/repairmcp/apps/deg-server/dist/stdio.js"]
    }
  }
}
```

Restart Claude Desktop. The DEG tools should appear in the tool list.

### Production deploy

```bash
cd apps/deg-server
wrangler deploy
```

---

## 15. Acceptance criteria

The v1 ships when all of these are true:

- [ ] All 5 DEG tools callable from Claude Desktop and return valid responses
- [ ] Every tool response includes a properly formatted `Citation` object
- [ ] Sample data (50 inquiries) covers all 3 IPs (CCC, Mitchell, Audatex) and at least 5 vehicle makes
- [ ] `deg_find_supporting` returns relevant results for 5 different test line items
- [ ] Citation `shortForm` strings drop cleanly into Claude-generated supplement narratives
- [ ] All packages build with no type errors and no warnings
- [ ] All tests pass (target: 1 test per public function in `core`, 1 test per tool in `deg`)
- [ ] 90-second demo Loom recorded and uploaded
- [ ] Repository visible at `github.com/Repairmcp/repairmcp` with proper README, LICENSE, ARCHITECTURE.md
- [ ] Outreach email to Danny finalized and queued

---

## 16. References

### MCP

- [Model Context Protocol specification](https://modelcontextprotocol.io)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Example servers](https://github.com/modelcontextprotocol/servers)

### Templates we're learning from

- [`cyanheads/mcp-ts-template`](https://github.com/cyanheads/mcp-ts-template) — base template, Apache 2.0
- [`arabold/docs-mcp-server`](https://github.com/arabold/docs-mcp-server) — reference for scrape + index + serve pattern
- [`firecrawl/firecrawl-mcp-server`](https://github.com/firecrawl/firecrawl-mcp-server) — reference for tool design and AI client integration

### Domain references

- [Database Enhancement Gateway](https://degweb.org)
- [Society of Collision Repair Specialists](https://scrs.com)
- [I-CAR Repairability Technical Support](https://rts.i-car.com)

### Cloudflare

- [Workers documentation](https://developers.cloudflare.com/workers/)
- [D1 documentation](https://developers.cloudflare.com/d1/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

## End notes for Claude Code

When working from this spec:

1. **Read the full document before writing any code.** Section 6 (core abstractions) and section 7 (DEG implementation) are tightly coupled — implementing them out of order causes rework.

2. **The acceptance criteria in section 15 is the contract.** Don't ship until every box is checked.

3. **When in doubt, prefer simplicity.** This is v1. Vector search, OAuth, and multi-source unification are deferred for a reason.

4. **Tool descriptions matter as much as code.** Don't shortcut section 7.3 — that text is what makes the difference between a tool that gets called correctly and one that gets ignored.

5. **Commit frequently with clear messages.** This repo is going to be public; the git history is part of the open-source story.

6. **Don't paint into corners.** If a v1 shortcut would make v2 painful (e.g. hardcoding DEG-specific assumptions into `core`), stop and refactor before continuing.
