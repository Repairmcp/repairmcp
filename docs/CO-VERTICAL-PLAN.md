# Colorado State Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `https://co.repairmcp.com/mcp` — the Colorado state-law MCP server (state #3) — with a verbatim CRS + CCR + DOI-bulletin corpus, four `co_*` tools plus the ChatGPT connector pair, passing the demo gauntlet.

**Architecture:** `packages/state-co` is a profile over the shared `packages/state-law` machinery (the MT pattern): per-publisher parsers + capture pipelines behind one `StateCaptureProfile`, a `CorpusProfile` driving the shared `StateLawCorpus`, and thin tool/adapter/connector wiring. `apps/state-co-server` is a Worker identical in shape to `apps/state-mt-server`. One additive change lands in `packages/state-law` (optional binary fetch on `CaptureIo`) — everything else is new files.

**Tech Stack:** TypeScript strict, Bun (test/runtime), zod v4, Cloudflare Workers + wrangler, `fflate` (DOCX unzip, capture-only), `unpdf` (bulletin PDF text, capture-only).

**Spec:** `docs/CO-VERTICAL-KICKOFF.md` — read it first. The corpus manifest (§2), capture surfaces (§3), identity rules (§4), demo gauntlet (§7), and risks (§9) are argued there; this plan implements them.

## Global Constraints

- TypeScript strict; `noUncheckedIndexedAccess: true` (array access returns `T | undefined`); `verbatimModuleSyntax: true` (type-only imports MUST use `import type`).
- Any `packages/state-law` change must be ADDITIVE: zero edits to WA/MT source or tests, and after the change `bun test` in `packages/state-law`, `packages/state-wa`, and `packages/state-mt` must pass with zero edits (112 + 59 + 6 tests).
- Verbatim capture discipline: parsers preserve subsection numbering, never paraphrase; the never-lose-text rule (split on closing tags, strip per piece — structure can add line breaks, never drop words).
- Dates: silence over a guess, always. CRS sections carry NO `effectiveDate` (currency is the edition); CCR sections ALWAYS carry one; the bulletin carries its issue date. All date rendering routes through the identity factory (which uses `fmtDateUtc`).
- Politeness: all fetches through `makeCaptureIo` (2 s delay, UA `RepairMCP-Bot/1.0 (+https://repairmcp.com)`).
- Worker: `workers_dev: false`, route `co.repairmcp.com`, no cache, zero outbound requests. `fflate`/`unpdf` must never reach the Worker bundle: capture modules stay OUT of the package barrel (`src/index.ts`), exactly as MT excludes `capture.ts`.
- Site copy (task 15): no em or en dashes anywhere, the acronym MCP exactly once and expanded, "your AI assistant" never "MCP client" — `bun run test` in `apps/site` is the linter gate.
- Commit after every task, message style `feat(state-co): …`. Commit messages and files must contain NO personal names (use "the project owner" if needed).
- Run `bun install` from the repo root after any package.json dependency change; `bun run build` from the root before task 13 onward.

## File Structure

```
packages/state-co/
  package.json, tsconfig.json
  src/schema.ts          CO codes/domains/section/meta schemas (task 1)
  src/taxonomy.ts        topics + cite-prefix baseline map (task 1)
  src/identity.ts        CO_IDENTITY, CRS edition pin, resolveCoCitationQuery (task 2)
  src/sources-crs.ts     CRS title manifest (task 4)
  src/parse-crs.ts       whole-title HTM → sections (task 4)
  src/capture-crs.ts     index tripwire + title fetches (task 5)
  src/parse-ccr.ts       DOCX document.xml → regs; SOS page discovery helpers (task 6)
  src/sources-ccr.ts     CCR series manifest (task 7)
  src/capture-ccr.ts     two-tier SOS crawl + DOCX unzip (task 7)
  src/capture-bulletin.ts B-5.04 PDF capture, injectable extractor (task 8)
  src/capture.ts         CO_CAPTURE_PROFILE (task 9) — NOT in the barrel
  src/corpus.ts          CoCorpus over CO_CORPUS_PROFILE (task 11)
  src/notes.ts           legal-posture lines (task 11)
  src/tools.ts           the four co_* tools' descriptions + config (task 11)
  src/adapter.ts         CoAdapter/CoItem (task 11)
  src/openai.ts          connector descriptions + registration (task 11)
  src/index.ts           barrel: schema, taxonomy, identity, corpus, notes,
                         tools, adapter, openai, parse-crs, parse-ccr,
                         sources-crs, sources-ccr (NO capture-*, NO capture.ts)
  data/co-law-corpus.json    written by task 10
  data/co-annotations.json   task 12
  test/                  tasks 1–12
packages/state-law/src/capture.ts   MODIFIED (task 3): optional fetchBinary
scripts/state-registry.ts           MODIFIED (task 9): register CO
apps/state-co-server/               task 13
apps/site/public/index.html         task 15
CLAUDE.md                           task 15
```

---

### Task 1: Scaffold `packages/state-co` — schema + taxonomy

**Files:**
- Create: `packages/state-co/package.json`, `packages/state-co/tsconfig.json`
- Create: `packages/state-co/src/schema.ts`, `packages/state-co/src/taxonomy.ts`
- Test: `packages/state-co/test/schema.test.ts`

**Interfaces:**
- Produces: `CO_CODES`, `CoCodeSchema`, `CoCode`; `CO_DOMAINS`, `CoDomainSchema`, `CoDomain`; `CoSectionSchema`, `CoSection`; `CoCorpusMetaSchema`, `CoCorpusFileSchema`, `CoCorpusFile`; `CO_TOPICS`, `CoTopicSchema`, `CoTopic`; `CO_CITE_PREFIX_TOPICS`, `baselineTopics(cite): readonly CoTopic[]`.

- [ ] **Step 1: package.json + tsconfig.json** (MT-shaped; note the two capture-only deps)

```json
{
  "name": "@repairmcp/state-co",
  "version": "0.0.0",
  "description": "Colorado state law vertical for RepairMCP: insurance claims practices (CRS 10-4-120 anti-steering and payment duties, unfair claims practices, the Model Quality Replacement Parts Act), the Motor Vehicle Repair Act, DOI regulations and Bulletin B-5.04, towing rules, and employment rules (Wage Act, COMPS Order), captured verbatim from the CRS and the Code of Colorado Regulations.",
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./data/*": "./data/*"
  },
  "files": ["dist", "data"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "bun test",
    "lint": "echo \"(no lint yet)\" && exit 0"
  },
  "dependencies": {
    "@repairmcp/core": "workspace:*",
    "@repairmcp/state-law": "workspace:*",
    "fflate": "^0.8.2",
    "unpdf": "^1.3.2",
    "zod": "^4.4.3"
  },
  "devDependencies": { "bun-types": "^1.3.13" }
}
```

tsconfig.json is byte-identical to `packages/state-mt/tsconfig.json` (extends base, rootDir src, outDir dist, types node). `fflate`/`unpdf` versions: use the latest published at execution; verify APIs in tasks 7–8.

- [ ] **Step 2: Write the failing schema test**

```ts
// packages/state-co/test/schema.test.ts
import { describe, expect, test } from 'bun:test';
import { CoCorpusFileSchema, CoSectionSchema, CO_CODES, CO_DOMAINS } from '../src/schema.js';
import { CO_TOPICS, baselineTopics } from '../src/taxonomy.js';

const base = {
  cite: '10-4-120',
  code: 'CRS',
  chapter: '10-4',
  chapterTitle: 'Property and Casualty Insurance',
  heading: 'Unfair or discriminatory trade practices.',
  text: '(1) The general assembly finds…',
  domain: 'insurance',
  sourceUrl: 'https://olls.info/crs/crs2026-title-10.htm',
};

describe('CO schema', () => {
  test('codes and domains are the CO enums', () => {
    expect([...CO_CODES]).toEqual(['CRS', '3 CCR', '4 CCR', '7 CCR', 'Colorado DOI Bulletin']);
    expect([...CO_DOMAINS]).toEqual(['insurance', 'repair_law', 'employment']);
  });
  test('a CRS section validates without an effectiveDate', () => {
    expect(CoSectionSchema.parse(base).cite).toBe('10-4-120');
  });
  test('a CCR section carries ccrRuleVersionId and effectiveDate', () => {
    const reg = CoSectionSchema.parse({
      ...base, code: '3 CCR', cite: '702-5-1-14', chapter: '702-5',
      chapterTitle: 'Property and Casualty', effectiveDate: '2025-12-30',
      ccrRuleVersionId: '11592',
    });
    expect(reg.ccrRuleVersionId).toBe('11592');
  });
  test('an unknown code is rejected', () => {
    expect(() => CoSectionSchema.parse({ ...base, code: 'WAC' })).toThrow();
  });
  test('meta requires the CRS edition and currency note', () => {
    expect(() =>
      CoCorpusFileSchema.parse({
        meta: {
          state: 'CO', capturedAt: '2026-08-28', currentThrough: '2026-08-28',
          sourceNote: 'x', sourceUrl: 'https://leg.colorado.gov',
        },
        sections: [base],
      }),
    ).toThrow(); // missing crsEdition/crsCurrencyNote
  });
  test('every prefix-map topic is a known topic', () => {
    const known = new Set<string>(CO_TOPICS);
    for (const topics of Object.values(
      // eslint-free import cycle avoidance: re-import inline
      require('../src/taxonomy.js').CO_CITE_PREFIX_TOPICS as Record<string, readonly string[]>,
    )) {
      for (const t of topics) expect(known.has(t)).toBe(true);
    }
  });
  test('baseline topics resolve by longest prefix', () => {
    expect(baselineTopics('10-4-120')).toContain('steering');
    expect(baselineTopics('702-5-1-14')).toContain('prompt_payment');
    expect(baselineTopics('99-99-999')).toEqual([]);
  });
});
```

(If `require` is awkward under `verbatimModuleSyntax`, import `CO_CITE_PREFIX_TOPICS` normally at top — it is exported.)

- [ ] **Step 3: Run to verify failure** — `cd packages/state-co && bun test` → FAIL (modules missing).

- [ ] **Step 4: src/schema.ts**

```ts
import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Colorado's tightened shapes. Three publishers, five codes: CRS (statutes,
 * OLLS whole-title files), three CCR titles (SOS per-series DOCX documents),
 * and the one DOI bulletin. CRS sections carry NO effective date — their
 * currency is the annual edition, stated in meta.crsEdition and every CRS
 * citation. CCR sections always carry a real effective date plus the SOS
 * ruleVersionId their text came from (the drift shortcut). The bulletin
 * carries its issue date.
 */

export const CO_CODES = ['CRS', '3 CCR', '4 CCR', '7 CCR', 'Colorado DOI Bulletin'] as const;
export const CoCodeSchema = z.enum(CO_CODES);
export type CoCode = z.infer<typeof CoCodeSchema>;

export const CO_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const CoDomainSchema = z.enum(CO_DOMAINS);
export type CoDomain = z.infer<typeof CoDomainSchema>;

export const CoSectionSchema = StateSectionSchema.extend({
  code: CoCodeSchema,
  domain: CoDomainSchema,
  /** CCR only: the SOS ruleVersionId the text was captured from. */
  ccrRuleVersionId: z.string().regex(/^\d+$/).optional(),
});
export type CoSection = z.infer<typeof CoSectionSchema>;

export const CoCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('CO'),
  /** "Colorado Revised Statutes 2026" — pinned by CRS_EDITION in identity.ts. */
  crsEdition: z.string().min(1),
  /** The OLLS download index's currency sentence, verbatim. */
  crsCurrencyNote: z.string().min(1),
});
export type CoCorpusMeta = z.infer<typeof CoCorpusMetaSchema>;

export const CoCorpusFileSchema = z.object({
  meta: CoCorpusMetaSchema,
  sections: z.array(CoSectionSchema).min(1),
});
export type CoCorpusFile = z.infer<typeof CoCorpusFileSchema>;

export const CoAppliesToSchema = AppliesToSchema;
export type CoAppliesTo = z.infer<typeof CoAppliesToSchema>;
export const CoAnnotationSchema = StateAnnotationSchema;
export type CoAnnotation = z.infer<typeof CoAnnotationSchema>;
export const CoAnnotationsFileSchema = StateAnnotationsFileSchema;
export type CoAnnotationsFile = z.infer<typeof CoAnnotationsFileSchema>;
```

- [ ] **Step 5: src/taxonomy.ts** — WA-shared ids reused verbatim where CO can answer (the cross-state rule); no dead topics (task 12's structural test enforces).

```ts
import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * Colorado's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test enforces that structurally). WA-shared ids
 * carry over where Colorado law answers; absent where it does not (no
 * safety topics — Colorado has no state OSHA plan; no repair_lien — lien
 * statutes are out of the v1 corpus). Colorado-specific additions:
 * prompt_payment (Reg 5-1-14's 60-day rule), written_estimate and
 * parts_return (the Motor Vehicle Repair Act), payroll_deductions and
 * final_paycheck (the Wage Act), consumer_protection (CCPA).
 */
export const CO_TOPICS = [
  // Insurance disputes (WA-shared ids)
  'short_pay',
  'fair_settlement',
  'steering',
  'estimate_dispute',
  'supplement_handling',
  'prompt_investigation',
  'claim_denial',
  'misrepresentation',
  'aftermarket_parts',
  'total_loss',
  'valuation_dispute',
  'storage_towing',
  'repair_facility_choice',
  // Colorado insurance specifics
  'prompt_payment',
  'rental_reimbursement',
  // Repair / consumer law
  'consumer_protection',
  'written_estimate',
  'parts_return',
  // Employment (WA-shared where answerable)
  'meal_rest_breaks',
  'overtime',
  'minimum_wage',
  'final_paycheck',
  'payroll_deductions',
] as const;

export const CoTopicSchema = z.enum(CO_TOPICS);
export type CoTopic = z.infer<typeof CoTopicSchema>;

/**
 * Baseline topics by cite prefix, longest prefix wins. CRS cites (10-4-120),
 * CCR cites (702-5-1-14, 723-6-6511, 1103-1-5.2), and the bulletin (B-5.04)
 * occupy disjoint prefix spaces, so the map cannot collide across codes.
 */
export const CO_CITE_PREFIX_TOPICS: Record<string, readonly CoTopic[]> = {
  '10-3-11': ['fair_settlement'],
  '10-3-13': ['aftermarket_parts', 'consumer_protection'],
  '10-4-120': ['steering', 'repair_facility_choice', 'fair_settlement', 'short_pay'],
  '10-4-639': ['total_loss', 'storage_towing'],
  '702-5-1-14': ['prompt_payment', 'supplement_handling'],
  '702-5-2-12': ['fair_settlement', 'consumer_protection'],
  '702-5-2-15': ['total_loss', 'valuation_dispute', 'rental_reimbursement'],
  'B-5': ['fair_settlement', 'steering'],
  '42-9': ['consumer_protection', 'written_estimate'],
  '42-9-106': ['storage_towing', 'written_estimate'],
  '42-9-107': ['aftermarket_parts', 'consumer_protection'],
  '42-9-109': ['parts_return'],
  '6-1': ['consumer_protection', 'misrepresentation'],
  '42-4': ['storage_towing'],
  '723-6': ['storage_towing'],
  '8-4': ['final_paycheck', 'payroll_deductions'],
  '1103-1': ['overtime', 'minimum_wage', 'meal_rest_breaks'],
};

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(CO_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly CoTopic[];
```

- [ ] **Step 6: Run tests to verify pass** — `bun test` → PASS. Also run `bun install` from the repo root so the workspace links the new package.

- [ ] **Step 7: Commit**

```bash
git add packages/state-co pnpm-lock.yaml
git commit -m "feat(state-co): scaffold Colorado package - schema and taxonomy"
```

---

### Task 2: Identity — the CRS edition pin and the CO citation resolver

**Files:**
- Create: `packages/state-co/src/identity.ts`
- Test: `packages/state-co/test/identity.test.ts`

**Interfaces:**
- Consumes: `makeStateIdentity`, `StateIdentity`, `CitationQuery` from `@repairmcp/state-law`; `CoCode`, `CoSection` from `./schema.js`.
- Produces: `CRS_EDITION = 'Colorado Revised Statutes 2026'`; `CRS_EDITION_NOTE = '2026 edition'`; `CO_IDENTITY` (sourceId `state-co`, sourceName `State of Colorado`, sourceShortName `CO Law`, sourceUrl `https://leg.colorado.gov`); `coStateIdentity: StateIdentity` whose `resolveCitationQuery` is `resolveCoCitationQuery`; `coId(code, cite)`, `parseCoId(id)`, `displayCite(section)`, `resolveCoCitationQuery(query)`, `formatCoCitation(section)`.

**Why a wrapper resolver:** the factory splits cite bodies on `[.-]` and accepts only 2–3 groups with shape `\d+[A-Z]?`. Colorado breaks that three ways: CRS point-five sections (`42-9-108.5` → 4 groups), CCR four-group cites (`702-5-1-14`), and letter-bearing bulletin cites (`B-5.04`). The wrapper resolves those forms itself and delegates everything else to the factory — `packages/state-law` is untouched.

- [ ] **Step 1: Write the failing test**

```ts
// packages/state-co/test/identity.test.ts
import { describe, expect, test } from 'bun:test';
import {
  CRS_EDITION, coStateIdentity, displayCite, formatCoCitation, parseCoId,
  resolveCoCitationQuery,
} from '../src/identity.js';
import type { CoSection } from '../src/schema.js';

const sec = (over: Partial<CoSection>): CoSection => ({
  cite: '10-4-120', code: 'CRS', chapter: '10-4',
  chapterTitle: 'Property and Casualty Insurance',
  heading: 'Unfair or discriminatory trade practices.',
  text: 'body', domain: 'insurance',
  sourceUrl: 'https://olls.info/crs/crs2026-title-10.htm', ...over,
});

describe('resolveCoCitationQuery', () => {
  test('bare hyphen triples are CRS', () => {
    expect(resolveCoCitationQuery('10-4-120')).toEqual({ kind: 'section', code: 'CRS', cite: '10-4-120' });
    expect(resolveCoCitationQuery('CRS 8-4-109')).toEqual({ kind: 'section', code: 'CRS', cite: '8-4-109' });
  });
  test('CRS point-five sections resolve', () => {
    expect(resolveCoCitationQuery('42-9-108.5')).toEqual({ kind: 'section', code: 'CRS', cite: '42-9-108.5' });
    expect(resolveCoCitationQuery('crs 42-9-108.5')).toEqual({ kind: 'section', code: 'CRS', cite: '42-9-108.5' });
  });
  test('CRS chapters (title-article)', () => {
    expect(resolveCoCitationQuery('42-9')).toEqual({ kind: 'chapter', code: 'CRS', chapter: '42-9' });
  });
  test('full CCR cites resolve to their title code', () => {
    expect(resolveCoCitationQuery('3 CCR 702-5-1-14')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-1-14' });
    expect(resolveCoCitationQuery('4 ccr 723-6-6511')).toEqual({ kind: 'section', code: '4 CCR', cite: '723-6-6511' });
    expect(resolveCoCitationQuery('7 CCR 1103-1-5.2')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-5.2' });
  });
  test('DOI regulation shorthand maps into 702-5', () => {
    expect(resolveCoCitationQuery('Reg 5-1-14')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-1-14' });
    expect(resolveCoCitationQuery('regulation 5-2-15')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-2-15' });
  });
  test('COMPS rules resolve by dotted rule number alone', () => {
    expect(resolveCoCitationQuery('2.4.1')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-2.4.1' });
    expect(resolveCoCitationQuery('COMPS Rule 5.2')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-5.2' });
  });
  test('bulletin forms', () => {
    expect(resolveCoCitationQuery('B-5.04')).toEqual({ kind: 'section', code: 'Colorado DOI Bulletin', cite: 'B-5.04' });
    expect(resolveCoCitationQuery('bulletin b-5.04')).toEqual({ kind: 'section', code: 'Colorado DOI Bulletin', cite: 'B-5.04' });
  });
  test('known CCR series as bare chapters', () => {
    expect(resolveCoCitationQuery('702-5')).toEqual({ kind: 'chapter', code: '3 CCR', chapter: '702-5' });
    expect(resolveCoCitationQuery('1103-1')).toEqual({ kind: 'chapter', code: '7 CCR', chapter: '1103-1' });
  });
  test('prose is not a citation', () => {
    expect(resolveCoCitationQuery('steering to a network shop')).toBeNull();
  });
});

describe('display and citation forms', () => {
  test('display cites match the kickoff contract', () => {
    expect(displayCite(sec({}))).toBe('CRS 10-4-120');
    expect(displayCite(sec({ code: '3 CCR', cite: '702-5-1-14' }))).toBe('3 CCR 702-5-1-14');
    expect(displayCite(sec({ code: 'Colorado DOI Bulletin', cite: 'B-5.04' }))).toBe('Colorado DOI Bulletin B-5.04');
  });
  test('CRS citations carry the edition, never a date', () => {
    const c = formatCoCitation(sec({}));
    expect(c.shortForm).toBe('CRS 10-4-120, 2026 edition');
    expect(c.publishedAt).toBeUndefined();
  });
  test('CCR citations carry the real effective date', () => {
    const c = formatCoCitation(sec({ code: '3 CCR', cite: '702-5-1-14', chapter: '702-5', effectiveDate: '2025-12-30' }));
    expect(c.shortForm).toBe('3 CCR 702-5-1-14, effective 12/30/2025');
  });
  test('bulletin citations say issued', () => {
    const c = formatCoCitation(sec({ code: 'Colorado DOI Bulletin', cite: 'B-5.04', chapter: 'B-5', effectiveDate: '2016-09-19' }));
    expect(c.shortForm).toBe('Colorado DOI Bulletin B-5.04, issued 9/19/2016');
  });
  test('ids round-trip, including space-bearing codes', () => {
    expect(parseCoId(coStateIdentity.id('3 CCR', '702-5-1-14'))).toEqual({ code: '3 CCR', cite: '702-5-1-14' });
    expect(parseCoId('crs:10-4-120')).toEqual({ code: 'CRS', cite: '10-4-120' });
  });
  test('the edition pin exists for the rollover tripwire', () => {
    expect(CRS_EDITION).toBe('Colorado Revised Statutes 2026');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test test/identity.test.ts` → FAIL.

- [ ] **Step 3: src/identity.ts**

```ts
/**
 * Colorado's identity. Bare-cite inference: hyphenated triples are CRS (the
 * dominant code, the role hyphens play for MCA in Montana); regulations need
 * their prefix; COMPS rules alone claim bare dotted numbers. CRS citations
 * carry the EDITION — CRS prints session-law source notes, never effective
 * dates, and silence-over-guess is the house rule. CCR citations carry real
 * effective dates; the bulletin carries its issue date. CRS_EDITION is
 * pinned against corpus meta by a test so the yearly rollover fails loudly.
 *
 * resolveCoCitationQuery wraps the shared factory: the factory's 2-3-group
 * splitter cannot express CRS point-five sections (42-9-108.5), four-group
 * CCR cites (702-5-1-14), or letter-bearing bulletin cites (B-5.04), so
 * those forms resolve here and everything else delegates.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import type { CoCode, CoSection } from './schema.js';

export const CRS_EDITION = 'Colorado Revised Statutes 2026';
export const CRS_EDITION_NOTE = `${CRS_EDITION.match(/\d{4}/)?.[0] ?? ''} edition`;

export const CO_IDENTITY = {
  sourceId: 'state-co',
  sourceName: 'State of Colorado',
  sourceShortName: 'CO Law',
  sourceUrl: 'https://leg.colorado.gov',
  description:
    'Colorado state law for collision repair facilities: insurance claims handling (CRS 10-4-120 anti-steering and payment duties, the unfair claims practices catalog, the Model Quality Replacement Parts Act, DOI claim-handling regulations and Bulletin B-5.04), the Motor Vehicle Repair Act, towing rules, and employment rules (the Wage Act and the COMPS Order) — captured verbatim from the CRS and the Code of Colorado Regulations.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

function isoToDisplay(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

const factory = makeStateIdentity({
  ...CO_IDENTITY,
  codes: [
    {
      code: 'CRS',
      longName: 'Colorado Revised Statutes section',
      separator: '-',
      claimsBareSeparators: ['-'],
      citationNote: () => CRS_EDITION_NOTE,
    },
    { code: '3 CCR', longName: 'Code of Colorado Regulations, 3 CCR', separator: '-' },
    { code: '4 CCR', longName: 'Code of Colorado Regulations, 4 CCR', separator: '-' },
    { code: '7 CCR', longName: 'Code of Colorado Regulations, 7 CCR', separator: '-' },
    {
      code: 'Colorado DOI Bulletin',
      longName: 'Colorado Division of Insurance Bulletin',
      separator: '-',
      citationNote: (section) => {
        const issued = isoToDisplay(section.effectiveDate);
        return issued ? `issued ${issued}` : undefined;
      },
    },
  ],
});

/** The three captured CCR series, for bare-chapter and shorthand resolution. */
const CCR_SERIES: ReadonlyArray<{ code: CoCode; series: string }> = [
  { code: '3 CCR', series: '702-5' },
  { code: '4 CCR', series: '723-6' },
  { code: '7 CCR', series: '1103-1' },
];

const CRS_SECTION = /^(\d+)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;
const CCR_FULL = /^([347])\s*C\.?C\.?R\.?\s+(\d{3,4}-\d+)(?:-(.+))?$/i;
const DOI_REG = /^REG(?:ULATION)?\.?\s+(5-\d+-\d+)$/i;
const COMPS_RULE = /^(?:COMPS\s+)?RULE\s+(\d+(?:\.\d+)+)$/i;
const BARE_DOTTED = /^\d+(?:\.\d+)+$/;
const BULLETIN = /^(?:(?:COLORADO\s+)?(?:DOI\s+)?BULLETIN\s+)?B-?(\d+\.\d+)$/i;

export function resolveCoCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/^(?:§|SECTION)\s+/, '').replace(/,\s*C\.R\.S\.?$/, '');

  const bulletin = BULLETIN.exec(upper);
  if (bulletin) {
    return { kind: 'section', code: 'Colorado DOI Bulletin', cite: `B-${bulletin[1]!}` };
  }

  const ccr = CCR_FULL.exec(upper);
  if (ccr) {
    const code = `${ccr[1]!} CCR`;
    const series = ccr[2]!;
    return ccr[3]
      ? { kind: 'section', code, cite: `${series}-${ccr[3]}` }
      : { kind: 'chapter', code, chapter: series };
  }

  const reg = DOI_REG.exec(upper);
  if (reg) {
    // DOI regulation numbers live in the 702-5 series: "5-1-14" → 702-5-1-14.
    return { kind: 'section', code: '3 CCR', cite: `702-${reg[1]!}` };
  }

  const comps = COMPS_RULE.exec(upper) ?? (BARE_DOTTED.test(upper) ? ([, upper] as unknown as RegExpExecArray) : null);
  if (comps) {
    return { kind: 'section', code: '7 CCR', cite: `1103-1-${comps[1]!}` };
  }

  const bareSeries = CCR_SERIES.find((s) => s.series === upper);
  if (bareSeries) {
    return { kind: 'chapter', code: bareSeries.code, chapter: bareSeries.series };
  }

  const bareCrs = CRS_SECTION.exec(upper.replace(/^CRS[\s:.-]+/, ''));
  if (bareCrs) {
    return { kind: 'section', code: 'CRS', cite: `${bareCrs[1]}-${bareCrs[2]}-${bareCrs[3]}` };
  }

  return factory.resolveCitationQuery(trimmed);
}

export const coStateIdentity: StateIdentity = { ...factory, resolveCitationQuery: resolveCoCitationQuery };

export type CoCitationQuery =
  | { kind: 'section'; code: CoCode; cite: string }
  | { kind: 'chapter'; code: CoCode; chapter: string }
  | null;

export function coId(code: CoCode, cite: string): string {
  return coStateIdentity.id(code, cite);
}
export function parseCoId(id: string): { code: CoCode; cite: string } | null {
  return coStateIdentity.parseId(id) as { code: CoCode; cite: string } | null;
}
/** "CRS 10-4-120" / "3 CCR 702-5-1-14" — the display cite everything renders. */
export function displayCite(section: Pick<CoSection, 'code' | 'cite'>): string {
  return coStateIdentity.displayCite(section);
}
export function formatCoCitation(section: CoSection): Citation {
  return coStateIdentity.formatCitation(section);
}
```

Implementation notes for the executor:
- The `comps` line's fake-exec-array trick is ugly; if it fights the type checker, write it as two plain branches (`COMPS_RULE` match → group 1; else `BARE_DOTTED` on `upper` → use `upper` itself). Behavior over cleverness.
- `formatCoCitation` for a CRS section must yield `publishedAt: undefined` — that falls out of the factory because CRS sections carry no `effectiveDate`. The test pins it.
- Order matters and is load-bearing: bulletin → full CCR → Reg shorthand → COMPS → bare series → CRS (with dotted support) → factory fallback. Add a comment saying exactly that.

- [ ] **Step 4: Run tests to verify pass** — `bun test` → PASS (schema + identity).

- [ ] **Step 5: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): identity - CRS edition pin and the CO citation resolver"
```

---

### Task 3: `packages/state-law` — optional binary fetch on CaptureIo

**Files:**
- Modify: `packages/state-law/src/capture.ts`
- Test: `packages/state-law/test/capture-binary.test.ts` (new file — existing tests untouched)

**Interfaces:**
- Produces: `FetchLike` gains optional `arrayBuffer?(): Promise<ArrayBuffer>` on its response shape; `CaptureIo` gains OPTIONAL `fetchBinary?(url: string, opts?: { rawName?: string; accept?: string }): Promise<Uint8Array>`; `makeCaptureIo` always provides it.
- Consumed by: task 7 (CCR DOCX) and task 8 (bulletin PDF). CO code guards with a clear throw if `io.fetchBinary` is absent.

**Why optional:** WA/MT test fakes implement `CaptureIo` structurally; a required member would break their compile, violating the zero-edits constraint.

- [ ] **Step 1: Write the failing test**

```ts
// packages/state-law/test/capture-binary.test.ts
import { describe, expect, test } from 'bun:test';
import { makeCaptureIo, type FetchLike } from '../src/capture.js';

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x7f]); // zip magic + junk

function fakeFetch(): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => 'not-used',
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  });
}

describe('fetchBinary', () => {
  test('returns the exact bytes', async () => {
    const io = makeCaptureIo({ userAgent: 'test', delayMs: 0, fetchImpl: fakeFetch(), log: () => {} });
    const got = await io.fetchBinary!('https://example.test/doc.docx');
    expect([...got]).toEqual([...bytes]);
  });
  test('round-trips through saveRaw/readRaw as base64', async () => {
    const store = new Map<string, string>();
    const io = makeCaptureIo({
      userAgent: 'test', delayMs: 0, fetchImpl: fakeFetch(), log: () => {},
      saveRaw: (name, body) => store.set(name, body),
      readRaw: (name) => store.get(name),
    });
    const first = await io.fetchBinary!('https://example.test/doc.docx', { rawName: 'doc.b64' });
    expect(store.has('doc.b64')).toBe(true);
    // Second call must replay from the store, not fetch.
    const replayIo = makeCaptureIo({
      userAgent: 'test', delayMs: 0, log: () => {},
      fetchImpl: async () => { throw new Error('must not fetch'); },
      readRaw: (name) => store.get(name),
    });
    const second = await replayIo.fetchBinary!('https://example.test/doc.docx', { rawName: 'doc.b64' });
    expect([...second]).toEqual([...first]);
  });
  test('a FetchLike without arrayBuffer throws a named error', async () => {
    const io = makeCaptureIo({
      userAgent: 'test', delayMs: 0, log: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x' }),
    });
    await expect(io.fetchBinary!('https://example.test/doc.docx')).rejects.toThrow(/arrayBuffer/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/state-law && bun test test/capture-binary.test.ts` → FAIL (`fetchBinary` undefined).

- [ ] **Step 3: Implement in `packages/state-law/src/capture.ts`** — additive only.

Change `FetchLike`'s response shape to:

```ts
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  /** Present on real fetch; binary capture requires it. */
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;
```

Add to `CaptureIo`:

```ts
  /**
   * Fetch raw bytes (DOCX, PDF). Optional so existing structural fakes stay
   * valid; makeCaptureIo always provides it. Raw replay stores base64 under
   * the rawName through the same saveRaw/readRaw as text.
   */
  fetchBinary?(url: string, opts?: { rawName?: string; accept?: string }): Promise<Uint8Array>;
```

Inside `makeCaptureIo`, add base64 helpers and the implementation (worker-safe: `atob`/`btoa`, no Buffer):

```ts
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

and in the returned object:

```ts
    fetchBinary: async (url, o) => {
      const rawName = o?.rawName;
      if (rawName && opts.readRaw) {
        const saved = opts.readRaw(rawName);
        if (saved !== undefined) {
          log(`reading ${rawName}`);
          return base64ToBytes(saved);
        }
      }
      if (fetchedOnce) await sleep(delayMs);
      fetchedOnce = true;
      log(`fetching ${url}`);
      const res = await fetchImpl(url, {
        headers: { 'user-agent': opts.userAgent, accept: o?.accept ?? 'application/octet-stream' },
      });
      if (!res.ok) {
        throw new Error(`${new URL(url).host} responded ${res.status} for ${url} — not capturing.`);
      }
      if (!res.arrayBuffer) {
        throw new Error('This FetchLike has no arrayBuffer() — binary capture needs one.');
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (rawName && opts.saveRaw) opts.saveRaw(rawName, bytesToBase64(bytes));
      return bytes;
    },
```

Note the existing `fetchRaw` for text is untouched. The politeness delay and `fetchedOnce` state are shared with it — binary fetches count toward the same pacing.

- [ ] **Step 4: Run the regression gate** — all three MUST pass with zero test edits:

```bash
cd packages/state-law && bun test
cd ../state-wa && bun test
cd ../state-mt && bun test
```

Expected: 6 + 112 + 59 green (plus the new binary tests). If anything in WA/MT fails, the change was not additive — stop and fix the change, never the tests.

- [ ] **Step 5: Commit**

```bash
git add packages/state-law
git commit -m "feat(state-law): optional fetchBinary on CaptureIo for DOCX/PDF capture"
```

---

### Task 4: CRS — sources manifest and the whole-title parser

**Files:**
- Create: `packages/state-co/src/sources-crs.ts`, `packages/state-co/src/parse-crs.ts`
- Test: `packages/state-co/test/parse-crs.test.ts` (synthetic fixture inline)

**Interfaces:**
- Produces (sources-crs): `CrsCaptureSource { code: 'CRS'; title: number; chapterKey: string; chapterTitle: string; domain: CoDomain; filter: { kind: 'sections'; cites: readonly string[] } | { kind: 'article' }; note?: string }`; `CO_CRS_SOURCES: readonly CrsCaptureSource[]`; `CRS_INDEX_URL`.
- Produces (parse-crs): `CrsParseError`; `ParsedCrsSection { cite: string; heading: string; text: string; historyNote?: string; repealed: boolean }`; `parseCrsTitleHtml(html: string, opts: { title: number }): { sections: ParsedCrsSection[]; warnings: string[] }`; `parseCrsIndexCurrency(html: string): { currencyNote: string; editionYear: string; titleHrefs: Map<number, string> }`.

- [ ] **Step 1: Write the failing parser test with a synthetic fixture**

The fixture encodes the researched OLLS shape: plain server-rendered HTML, sections opened by a bold `cite.  Catchline.` run, body paragraphs, a `Source:` history paragraph, then non-statutory annotation blocks to be dropped. The real files will differ in details — task 10 revalidates against saved raw and this test then gains a real-file slice fixture.

```ts
// packages/state-co/test/parse-crs.test.ts
import { describe, expect, test } from 'bun:test';
import { parseCrsIndexCurrency, parseCrsTitleHtml } from '../src/parse-crs.js';

const TITLE_42 = `
<html><body>
<p><b>42-9-104.  Written estimate required - exception.</b></p>
<p>(1) A repair facility shall give the customer a written estimate.</p>
<p>(2) The estimate shall state the total price.</p>
<p>Source: L. 77: Entire article added, p. 1930, § 1.</p>
<p>Editor's note: This section is similar to former law.</p>
<p><b>42-9-105.  (Repealed)</b></p>
<p>Source: L. 85: Entire section repealed.</p>
<p><b>42-9-108.5.  Completion of repairs - warranty work.</b></p>
<p>Text of the point five section.</p>
<p>Source: L. 91: Entire section added.</p>
</body></html>`;

const INDEX = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="https://olls.info/crs/crs2026-title-10.htm">Title 10</a>
<a href="https://olls.info/crs/crs2026-title-42.htm">Title 42</a>
</body></html>`;

describe('parseCrsTitleHtml', () => {
  const parsed = parseCrsTitleHtml(TITLE_42, { title: 42 });

  test('splits sections on the cite-dot-catchline convention', () => {
    expect(parsed.sections.map((s) => s.cite)).toEqual(['42-9-104', '42-9-105', '42-9-108.5']);
  });
  test('heading is the catchline as printed', () => {
    expect(parsed.sections[0]!.heading).toBe('Written estimate required - exception.');
  });
  test('body keeps subsection numbering, one paragraph per line', () => {
    expect(parsed.sections[0]!.text).toBe(
      '(1) A repair facility shall give the customer a written estimate.\n(2) The estimate shall state the total price.',
    );
  });
  test('the Source line becomes historyNote; annotation blocks are dropped', () => {
    expect(parsed.sections[0]!.historyNote).toBe('Source: L. 77: Entire article added, p. 1930, § 1.');
    expect(parsed.sections[0]!.text).not.toContain("Editor's note");
  });
  test('point-five cites parse', () => {
    expect(parsed.sections[2]!.cite).toBe('42-9-108.5');
  });
  test('repealed sections are flagged', () => {
    expect(parsed.sections[1]!.repealed).toBe(true);
    expect(parsed.sections[0]!.repealed).toBe(false);
  });
  test('a wrong-title cite hard-fails', () => {
    expect(() => parseCrsTitleHtml(TITLE_42, { title: 10 })).toThrow(/title/i);
  });
  test('an empty page hard-fails', () => {
    expect(() => parseCrsTitleHtml('<html><body></body></html>', { title: 42 })).toThrow();
  });
});

describe('parseCrsIndexCurrency', () => {
  test('extracts the currency sentence and the title hrefs', () => {
    const idx = parseCrsIndexCurrency(INDEX);
    expect(idx.currencyNote).toContain('Second');
    expect(idx.editionYear).toBe('2026');
    expect(idx.titleHrefs.get(42)).toBe('https://olls.info/crs/crs2026-title-42.htm');
  });
  test('a page without the currency sentence hard-fails', () => {
    expect(() => parseCrsIndexCurrency('<html><body>nope</body></html>')).toThrow(/curren/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: src/parse-crs.ts**

```ts
/**
 * Parser for the OLLS whole-title CRS files (olls.info/crs/crsYYYY-title-NN.htm)
 * and the download index page that states currency. One page per TITLE, no
 * per-section anchors: sections are identified by the text convention
 * `NN-N-NNN.  Catchline.` at the start of a paragraph (the OLRC-style shape
 * capture-uscode.ts parses, not WA/MT's anchor shape). Statutory text runs to
 * the `Source:` history paragraph; annotation blocks after it (Editor's
 * notes, cross references, ANNOTATION) are non-statutory chrome and are
 * dropped, bounded by the next section start. ADJUST AGAINST REAL FILES in
 * task 10 — this shape is from the research pass, and the first --save-raw
 * capture is the authority.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CrsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrsParseError';
  }
}

export interface ParsedCrsSection {
  cite: string;
  heading: string;
  text: string;
  historyNote?: string;
  repealed: boolean;
}

function stripToText(html: string): string {
  const spaced = html.replace(/<\/(td|th|tr)>/gi, ' ');
  const noTags = spaced.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/** Never-lose-text: split on closing block tags, strip per piece. */
function toLines(html: string): string[] {
  const lines: string[] = [];
  for (const piece of html.split(/<\/(?:p|div|h\d)>/i)) {
    const text = stripToText(piece);
    if (text) lines.push(text);
  }
  return lines;
}

const SECTION_START = /^(\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?)\.\s+(.+)$/;
const SOURCE_LINE = /^Source:\s/;
const ANNOTATION_BLOCK = /^(Editor's note|Cross references|Law reviews|ANNOTATION|I\. General Consideration)/i;

export function parseCrsTitleHtml(
  html: string,
  opts: { title: number },
): { sections: ParsedCrsSection[]; warnings: string[] } {
  const lines = toLines(html);
  const sections: ParsedCrsSection[] = [];
  const warnings: string[] = [];

  let current: ParsedCrsSection | null = null;
  let inAnnotations = false;

  const push = (): void => {
    if (!current) return;
    if (!current.text && !current.repealed) {
      warnings.push(`${current.cite}: no body text captured.`);
    }
    sections.push(current);
    current = null;
  };

  for (const line of lines) {
    const start = SECTION_START.exec(line);
    if (start) {
      const cite = start[1]!;
      if (!cite.startsWith(`${opts.title}-`)) {
        throw new CrsParseError(
          `Section ${cite} does not belong to title ${opts.title} — wrong file or template drift.`,
        );
      }
      push();
      const heading = start[2]!.trim();
      current = {
        cite,
        heading,
        text: '',
        repealed: /^\(?Repealed/i.test(heading),
      };
      inAnnotations = false;
      continue;
    }
    if (!current || inAnnotations) continue;
    if (SOURCE_LINE.test(line)) {
      current.historyNote = line;
      inAnnotations = true;
      continue;
    }
    if (ANNOTATION_BLOCK.test(line)) {
      inAnnotations = true;
      continue;
    }
    current.text = current.text ? `${current.text}\n${line}` : line;
  }
  push();

  if (sections.length === 0) {
    throw new CrsParseError(`Title ${opts.title}: no sections found — template drift or wrong file.`);
  }
  return { sections, warnings };
}

const CURRENCY_PATTERN = /current with the changes[\s\S]*?General Assembly[\s\S]*?\b(\d{4})\b[.]?/;

export function parseCrsIndexCurrency(html: string): {
  currencyNote: string;
  editionYear: string;
  titleHrefs: Map<number, string>;
} {
  const text = stripToText(html);
  const match = CURRENCY_PATTERN.exec(text);
  if (!match) {
    throw new CrsParseError(
      'The CRS download index no longer states its currency sentence — refusing to capture a corpus that cannot state its own currency.',
    );
  }
  const sentenceStart = text.lastIndexOf('The statutes', match.index) >= 0
    ? text.lastIndexOf('The statutes', match.index)
    : match.index;
  const sentenceEnd = text.indexOf('.', match.index + match[0].length - 1);
  const currencyNote = text.slice(sentenceStart, sentenceEnd >= 0 ? sentenceEnd + 1 : undefined).trim();

  const titleHrefs = new Map<number, string>();
  for (const m of html.matchAll(/href="([^"]*crs\d{4}-title-0*(\d+)\.htm)"/gi)) {
    titleHrefs.set(Number(m[2]), m[1]!);
  }
  return { currencyNote, editionYear: match[1]!, titleHrefs };
}
```

Executor note: `CURRENCY_PATTERN`'s exact wording is calibrated to the researched sentence ("current with the changes made by amendments, additions, and repeals to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second Regular Session in 2026"). If the real index words it differently, loosen the pattern to the stable core (`current with` … `General Assembly` … year) — the hard-fail-when-absent behavior is the point, not the exact words.

- [ ] **Step 4: src/sources-crs.ts**

```ts
import type { CoDomain } from './schema.js';

/**
 * The CRS half of the Colorado capture manifest. CRS is published as one
 * file per TITLE (olls.info), so capture fetches each distinct title once
 * and each entry selects sections out of it. Every cite here was verified
 * in the kickoff's research pass; a named cite absent from its title file
 * hard-fails at capture (for Title 8 that failure names the PDF-only
 * supplement risk from kickoff §9.1).
 */
export interface CrsCaptureSource {
  code: 'CRS';
  title: number;
  /** Becomes StateSection.chapter, e.g. '10-4' (title-article). */
  chapterKey: string;
  chapterTitle: string;
  domain: CoDomain;
  filter: { kind: 'sections'; cites: readonly string[] } | { kind: 'article' };
  note?: string;
}

export const CRS_INDEX_URL =
  'https://content.leg.colorado.gov/agencies/office-legislative-legal-services/2026-crs-titles-download';

export const CO_CRS_SOURCES: readonly CrsCaptureSource[] = [
  {
    code: 'CRS', title: 10, chapterKey: '10-3',
    chapterTitle: 'Regulation of Insurance Companies', domain: 'insurance',
    filter: { kind: 'sections', cites: ['10-3-1104'] },
    note: 'The unfair claims practices catalog at (1)(h). DOI enforcement only — no private right of action; the annotation carries that caveat.',
  },
  {
    code: 'CRS', title: 10, chapterKey: '10-3',
    chapterTitle: 'Regulation of Insurance Companies', domain: 'insurance',
    filter: {
      kind: 'sections',
      cites: ['10-3-1301', '10-3-1302', '10-3-1303', '10-3-1304', '10-3-1305', '10-3-1306'],
    },
    note: 'The Model Quality Replacement Parts Act, whole part. 10-3-1305 is the aftermarket-parts estimate disclosure.',
  },
  {
    code: 'CRS', title: 10, chapterKey: '10-4',
    chapterTitle: 'Property and Casualty Insurance', domain: 'insurance',
    filter: { kind: 'sections', cites: ['10-4-120', '10-4-639'] },
    note: '10-4-120: anti-steering, (2)(a)-(i) prohibited acts, (3)(a)-(g) required acts incl. (3)(e) "assume all reasonable costs". 10-4-639: total loss — taxes/fees, valuation method, towing/storage disclosure.',
  },
  {
    code: 'CRS', title: 42, chapterKey: '42-9',
    chapterTitle: 'Motor Vehicle Repairs', domain: 'repair_law',
    filter: { kind: 'article' },
    note: 'The Motor Vehicle Repair Act, whole article: estimates, over-estimate caps, storage, parts disclosure and return, invoices, warranties, penalties. NOT repealed (kickoff §2.3).',
  },
  {
    code: 'CRS', title: 42, chapterKey: '42-4',
    chapterTitle: 'Regulation of Vehicles and Traffic', domain: 'repair_law',
    filter: { kind: 'sections', cites: ['42-4-2103'] },
    note: 'Towing without authorization — the statute the PUC towing rules enforce.',
  },
  {
    code: 'CRS', title: 6, chapterKey: '6-1',
    chapterTitle: 'Colorado Consumer Protection Act', domain: 'repair_law',
    filter: { kind: 'sections', cites: ['6-1-105'] },
    note: 'The deceptive-practices catalog: (1)(e) service misrepresentation, (1)(l) price statements, (1)(n) bait-and-switch, (1)(u) failure to disclose, (1)(rrr) catch-all. Private-claim public-impact threshold is case law — annotation caveat.',
  },
  {
    code: 'CRS', title: 8, chapterKey: '8-4',
    chapterTitle: 'Wages', domain: 'employment',
    filter: { kind: 'sections', cites: ['8-4-103', '8-4-105', '8-4-109'] },
    note: 'The Wage Act: paydays and pay statements (-103), permitted deductions (-105), final pay on separation with the entrusted-property carve-out (-109). Title 8 partly ships in the PDF-only supplement zip — a hard-fail here means consult crs2026-statute-pdfs.zip (kickoff §9.1).',
  },
];
```

- [ ] **Step 5: Run tests to verify pass** — `bun test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): CRS whole-title parser and sources manifest"
```

---

### Task 5: CRS capture pipeline

**Files:**
- Create: `packages/state-co/src/capture-crs.ts`
- Test: `packages/state-co/test/capture-crs.test.ts`

**Interfaces:**
- Consumes: `CaptureIo` (state-law), `parseCrsTitleHtml`/`parseCrsIndexCurrency`, `CO_CRS_SOURCES`/`CRS_INDEX_URL`, `CRS_EDITION` (identity), `CoSection`.
- Produces: `captureCrs(io: CaptureIo, sources: readonly CrsCaptureSource[]): Promise<CrsCaptureResult>` where `CrsCaptureResult = { sections: CoSection[]; currencyNote: string; editionYear: string; report: { skippedEmpty: string[]; warnings: string[] } }`.

- [ ] **Step 1: Write the failing test** — fake `CaptureIo` serving the index fixture and two title fixtures from task 4 (extend the title fixture with a `10-4-120` page for title 10). Assert:

```ts
// packages/state-co/test/capture-crs.test.ts — core assertions
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureCrs } from '../src/capture-crs.js';
import type { CrsCaptureSource } from '../src/sources-crs.js';

// Build fake io: io.fetchText(url) returns INDEX for the index URL,
// TITLE_42 for the title-42 href, TITLE_10 for title-10. Reuse fixtures.

// Tests:
// 1. 'sections' filter returns exactly the named cites with chapterKey/
//    chapterTitle/domain from the manifest and sourceUrl = the title URL.
// 2. { kind: 'article' } on 42-9 returns every non-repealed 42-9-* section
//    and reports repealed ones in skippedEmpty.
// 3. A named cite that is missing throws, and for title 8 the error message
//    contains 'crs2026-statute-pdfs.zip'.
// 4. A named cite whose page is repealed throws.
// 5. currencyNote and editionYear surface in the result; a mismatch between
//    editionYear and CRS_EDITION's year lands a warning in report.warnings.
// 6. CRS sections carry NO effectiveDate and historyNote = the Source line.
// 7. The index is fetched exactly once and each distinct title exactly once
//    (count io calls).
```

Write these as real `test()` bodies — the comment block above is the checklist, not the code. Model the fake io on the MT test fakes (a `Map<string, string>` from URL to body, `fetchJson` throwing "unused").

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: src/capture-crs.ts**

```ts
/**
 * The CRS capture pipeline: fetch the OLLS download index (the currency
 * tripwire — a page that cannot state its currency hard-fails the capture),
 * resolve each needed title's href FROM the index (never derive the file
 * name — padding is the index's business), fetch each distinct title once,
 * parse, and select per manifest entry. Named cites hard-fail when absent
 * or repealed; article filters skip repealed sections with a report line.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { CRS_EDITION } from './identity.js';
import { parseCrsIndexCurrency, parseCrsTitleHtml, type ParsedCrsSection } from './parse-crs.js';
import type { CoSection } from './schema.js';
import { CRS_INDEX_URL, type CrsCaptureSource } from './sources-crs.js';

export interface CrsCaptureResult {
  sections: CoSection[];
  currencyNote: string;
  editionYear: string;
  report: { skippedEmpty: string[]; warnings: string[] };
}

export async function captureCrs(
  io: CaptureIo,
  sources: readonly CrsCaptureSource[],
): Promise<CrsCaptureResult> {
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];

  const indexHtml = await io.fetchText(CRS_INDEX_URL, { rawName: 'crs-index.html' });
  const index = parseCrsIndexCurrency(indexHtml);

  const pinnedYear = CRS_EDITION.match(/\d{4}/)?.[0];
  if (index.editionYear !== pinnedYear) {
    warnings.push(
      `CRS edition rollover: the index states ${index.editionYear} but the package pins ` +
        `"${CRS_EDITION}" — update CRS_EDITION in src/identity.ts (the pin test fails until you do).`,
    );
  }

  const titles = [...new Set(sources.map((s) => s.title))];
  const parsedByTitle = new Map<number, { url: string; sections: ParsedCrsSection[] }>();
  for (const title of titles) {
    const href = index.titleHrefs.get(title);
    if (!href) {
      throw new Error(
        `Title ${title} has no .htm link on the CRS download index` +
          (title === 8 ? ' — check the PDF-only supplement crs2026-statute-pdfs.zip (kickoff §9.1).' : '.'),
      );
    }
    const url = href.startsWith('http') ? href : `https://olls.info${href.startsWith('/') ? '' : '/'}${href}`;
    const html = await io.fetchText(url, { rawName: `crs-title-${title}.htm` });
    const parsed = parseCrsTitleHtml(html, { title });
    warnings.push(...parsed.warnings.map((w) => `title ${title}: ${w}`));
    parsedByTitle.set(title, { url, sections: parsed.sections });
  }

  const out: CoSection[] = [];
  for (const source of sources) {
    const parsed = parsedByTitle.get(source.title)!;
    const byCite = new Map(parsed.sections.map((s) => [s.cite, s]));

    let wanted: ParsedCrsSection[];
    if (source.filter.kind === 'sections') {
      wanted = source.filter.cites.map((cite) => {
        const section = byCite.get(cite);
        if (!section) {
          throw new Error(
            `CRS ${cite} was requested by name but is absent from the title ${source.title} file` +
              (source.title === 8
                ? ' — the Wage Act sections may live in the PDF-only supplement crs2026-statute-pdfs.zip (kickoff §9.1).'
                : '.'),
          );
        }
        if (section.repealed) {
          throw new Error(`CRS ${cite} was requested by name but its catchline reads Repealed.`);
        }
        return section;
      });
    } else {
      wanted = parsed.sections.filter((s) => s.cite.startsWith(`${source.chapterKey}-`));
      for (const s of wanted.filter((w) => w.repealed)) {
        io.log(`  CRS ${source.chapterKey}: skipping repealed ${s.cite}`);
        skippedEmpty.push(s.cite);
      }
      wanted = wanted.filter((w) => !w.repealed);
      if (wanted.length === 0) {
        throw new Error(`CRS article ${source.chapterKey} matched no live sections — wrong chapterKey?`);
      }
    }

    for (const section of wanted) {
      out.push({
        cite: section.cite,
        code: 'CRS',
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: section.heading,
        text: section.text,
        // CRS states no per-section effective dates — currency is the edition.
        ...(section.historyNote ? { historyNote: section.historyNote } : {}),
        domain: source.domain,
        sourceUrl: parsed.url,
      });
    }
  }

  return { sections: out, currencyNote: index.currencyNote, editionYear: index.editionYear, report: { skippedEmpty, warnings } };
}
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): CRS capture pipeline with the currency tripwire"
```

---

### Task 6: CCR — the DOCX document parser and the SOS page-discovery helpers

**Files:**
- Create: `packages/state-co/src/parse-ccr.ts`
- Test: `packages/state-co/test/parse-ccr.test.ts`

**Interfaces:**
- Produces: `CcrParseError`; `CcrHeaderKind = 'regulation' | 'comps-rule' | 'puc-rule'`; `ParsedCcrReg { regNumber: string; heading: string; text: string; statedEffectiveDate?: string }`; `parseCcrDocumentXml(xml: string, opts: { headerKind: CcrHeaderKind; seriesNum: string }): { regs: ParsedCcrReg[]; warnings: string[] }`; `findAgencyIds(deptListHtml: string, deptName: string, agencyName: string): { deptID: number; agencyID: number }`; `findRuleId(docListHtml: string, seriesNum: string): number`; `findCurrentVersion(ruleInfoHtml: string): { ruleVersionId: string; effectiveDate: string; docDownload: { url: string } }`.
- The three `find*` helpers parse SERVER-RENDERED SOS pages. Their regexes below encode the researched shape; task 10's `--save-raw` run is the authority — harden them against the real HTML there and extend this test file with real-page slice fixtures.

- [ ] **Step 1: Write the failing test**

```ts
// packages/state-co/test/parse-ccr.test.ts
import { describe, expect, test } from 'bun:test';
import {
  findAgencyIds, findCurrentVersion, findRuleId, parseCcrDocumentXml,
} from '../src/parse-ccr.js';

/** Minimal WordprocessingML: one <w:p> per paragraph, text in <w:t> runs. */
const p = (text: string, opts: { numbered?: boolean } = {}): string =>
  `<w:p>${opts.numbered ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ''}` +
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const DOI_XML = `<?xml version="1.0"?><w:document><w:body>
${p('DEPARTMENT OF REGULATORY AGENCIES')}
${p('Division of Insurance')}
${p('3 CCR 702-5')}
${p('Regulation 5-1-14 PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS')}
${p('Section 1 Authority')}
${p('This regulation is promulgated under the authority of § 10-1-109, C.R.S.')}
${p('Section 8 Effective Date')}
${p('This regulation is effective December 30, 2025.')}
${p('Regulation 5-2-12 AUTOMOBILE INSURANCE CONSUMER PROTECTIONS')}
${p('Section 1 Authority')}
${p('Body of 5-2-12.')}
</w:body></w:document>`;

const COMPS_XML = `<?xml version="1.0"?><w:document><w:body>
${p('COLORADO OVERTIME AND MINIMUM PAY STANDARDS ORDER ("COMPS ORDER") #40')}
${p('Rule 5.2 Rest Periods')}
${p('Every employer shall authorize and permit a compensated 10-minute rest period for each 4 hours of work, or major fractions thereof.')}
${p('Rule 2.4.1 Exemption for certain salespersons and mechanics')}
${p('Salespersons, parts-persons, and mechanics employed by automobile, truck, or farm implement (retail) dealers are exempt from Rule 4 (Overtime).')}
</w:body></w:document>`;

describe('parseCcrDocumentXml', () => {
  test('regulation kind splits on "Regulation N-N-N" headers', () => {
    const { regs } = parseCcrDocumentXml(DOI_XML, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(regs.map((r) => r.regNumber)).toEqual(['5-1-14', '5-2-12']);
    expect(regs[0]!.heading).toBe('PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS');
    expect(regs[0]!.text).toContain('Section 1 Authority');
  });
  test('a stated effective date inside the reg body is extracted as ISO', () => {
    const { regs } = parseCcrDocumentXml(DOI_XML, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(regs[0]!.statedEffectiveDate).toBe('2025-12-30');
    expect(regs[1]!.statedEffectiveDate).toBeUndefined();
  });
  test('comps-rule kind splits on "Rule N.N" headers, dotted numbers preserved', () => {
    const { regs } = parseCcrDocumentXml(COMPS_XML, { headerKind: 'comps-rule', seriesNum: '7 CCR 1103-1' });
    expect(regs.map((r) => r.regNumber)).toEqual(['5.2', '2.4.1']);
    expect(regs[0]!.text).toContain('10-minute rest period');
  });
  test('Word auto-numbering trips a warning — verbatim numbering may be lost', () => {
    const numbered = `<?xml version="1.0"?><w:document><w:body>${p('Regulation 5-1-14 X')}${p('item', { numbered: true })}</w:body></w:document>`;
    const { warnings } = parseCcrDocumentXml(numbered, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(warnings.some((w) => /auto-number/i.test(w))).toBe(true);
  });
  test('a document with no headers hard-fails', () => {
    expect(() =>
      parseCcrDocumentXml(`<?xml?><w:document><w:body>${p('nothing here')}</w:body></w:document>`, {
        headerKind: 'regulation', seriesNum: '3 CCR 702-5',
      }),
    ).toThrow();
  });
});

describe('SOS page discovery', () => {
  test('findAgencyIds pulls dept/agency ids from the doc-list href', () => {
    const html = `<a href="NumericalCCRDocList.do?deptID=18&agencyID=57&deptName=Department+of+Regulatory+Agencies&agencyName=Division+of+Insurance">Division of Insurance</a>`;
    expect(findAgencyIds(html, 'Department of Regulatory Agencies', 'Division of Insurance')).toEqual({ deptID: 18, agencyID: 57 });
  });
  test('findRuleId locates the series row', () => {
    const html = `<a href="DisplayRule.do?action=ruleinfo&ruleId=2201&deptID=18&agencyID=57&seriesNum=3+CCR+702-5">3 CCR 702-5</a> Property and Casualty`;
    expect(findRuleId(html, '3 CCR 702-5')).toBe(2201);
  });
  test('findCurrentVersion extracts ruleVersionId, effective date, and the word-document download', () => {
    const html = `
      <td>Effective Date: 12/30/2025</td>
      <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=11592&fileName=3+CCR+702-5&fileType=WORD')">Word document</a>`;
    const v = findCurrentVersion(html);
    expect(v.ruleVersionId).toBe('11592');
    expect(v.effectiveDate).toBe('2025-12-30');
    expect(v.docDownload.url).toContain('ruleVersionId=11592');
  });
  test('a ruleinfo page with no word-document link hard-fails — no silent PDF fallback', () => {
    expect(() => findCurrentVersion('<td>Effective Date: 12/30/2025</td>')).toThrow(/word/i);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: src/parse-ccr.ts**

```ts
/**
 * CCR parsing, two halves. (1) parseCcrDocumentXml: the SOS serves one DOCX
 * per SERIES; this parses the DOCX's word/document.xml (the unzip lives in
 * capture-ccr, never here — this module ships in the barrel and must stay
 * dependency-free). Paragraphs are <w:p> elements; text is the concatenation
 * of <w:t> runs. Word auto-numbering (<w:numPr>) would mean numbering lives
 * in numbering.xml, not the text — that trips a WARNING because verbatim
 * capture cannot silently lose list numbers. (2) The find* helpers regex the
 * server-rendered SOS browse pages (deptID/agencyID → ruleId →
 * ruleVersionId + effective date + the word-document download). Their
 * shapes come from the kickoff's research pass; the first --save-raw run
 * (task 10) is the authority — harden there.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CcrParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CcrParseError';
  }
}

export type CcrHeaderKind = 'regulation' | 'comps-rule' | 'puc-rule';

export interface ParsedCcrReg {
  regNumber: string;
  heading: string;
  text: string;
  statedEffectiveDate?: string;
}

const HEADER_PATTERNS: Record<CcrHeaderKind, RegExp> = {
  regulation: /^Regulation\s+(\d+-\d+-\d+)\s+(.+)$/i,
  'comps-rule': /^Rule\s+(\d+(?:\.\d+)*)\.?\s+(.+)$/i,
  'puc-rule': /^(\d{4})\.\s+(.+)$/,
};

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function longDateToIso(text: string): string | undefined {
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i.exec(text);
  if (!m) return undefined;
  return `${m[3]}-${MONTHS[m[1]!.toLowerCase()]}-${m[2]!.padStart(2, '0')}`;
}

function paragraphsOf(xml: string): { text: string; autoNumbered: boolean }[] {
  const out: { text: string; autoNumbered: boolean }[] = [];
  for (const pMatch of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const pXml = pMatch[0];
    const runs = [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => decodeEntities(m[1] ?? ''))
      .join('');
    const text = runs.replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, autoNumbered: /<w:numPr[\s/>]/.test(pXml) });
  }
  return out;
}

export function parseCcrDocumentXml(
  xml: string,
  opts: { headerKind: CcrHeaderKind; seriesNum: string },
): { regs: ParsedCcrReg[]; warnings: string[] } {
  const pattern = HEADER_PATTERNS[opts.headerKind];
  const warnings: string[] = [];
  const regs: ParsedCcrReg[] = [];
  let current: { regNumber: string; heading: string; lines: string[] } | null = null;

  const push = (): void => {
    if (!current) return;
    const text = current.lines.join('\n');
    regs.push({
      regNumber: current.regNumber,
      heading: current.heading,
      text,
      ...(longDateToIso(text.slice(-500)) && /effective/i.test(text.slice(-500))
        ? { statedEffectiveDate: longDateToIso(text.slice(-500)) }
        : {}),
    });
    current = null;
  };

  for (const para of paragraphsOf(xml)) {
    if (para.autoNumbered) {
      warnings.push(
        `${opts.seriesNum}: a paragraph uses Word auto-numbering — its list numbers live in ` +
          'numbering.xml, not the text. Eyeball the DOCX against the official PDF before accepting.',
      );
    }
    const header = pattern.exec(para.text);
    if (header) {
      push();
      current = { regNumber: header[1]!, heading: header[2]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(para.text);
  }
  push();

  if (regs.length === 0) {
    throw new CcrParseError(
      `${opts.seriesNum}: no ${opts.headerKind} headers found in the document — the split pattern no longer matches; re-derive it from the saved raw.`,
    );
  }
  return { regs, warnings };
}

function decodeHtml(html: string): string {
  return decodeEntities(html.replace(/&#x2F;/gi, '/'));
}

export function findAgencyIds(
  deptListHtml: string,
  deptName: string,
  agencyName: string,
): { deptID: number; agencyID: number } {
  const html = decodeHtml(deptListHtml);
  for (const m of html.matchAll(/NumericalCCRDocList\.do\?[^"']*deptID=(\d+)[^"']*agencyID=(\d+)[^"']*/gi)) {
    const context = html.slice(Math.max(0, m.index - 200), m.index + m[0].length + 300);
    const normalized = context.replace(/\+/g, ' ');
    if (normalized.includes(agencyName)) {
      return { deptID: Number(m[1]), agencyID: Number(m[2]) };
    }
  }
  throw new CcrParseError(
    `Agency "${agencyName}" (${deptName}) not found on the SOS department list — renumbered or template drift.`,
  );
}

export function findRuleId(docListHtml: string, seriesNum: string): number {
  const html = decodeHtml(docListHtml).replace(/\+/g, ' ');
  for (const m of html.matchAll(/DisplayRule\.do\?[^"']*ruleId=(\d+)[^"']*/gi)) {
    const context = html.slice(m.index, m.index + m[0].length + 300);
    if (context.includes(seriesNum)) return Number(m[1]);
  }
  throw new CcrParseError(`Series "${seriesNum}" not found on the SOS document list.`);
}

export function findCurrentVersion(ruleInfoHtml: string): {
  ruleVersionId: string;
  effectiveDate: string;
  docDownload: { url: string };
} {
  const html = decodeHtml(ruleInfoHtml);
  const dateMatch = /Effective\s+Date:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(html);
  if (!dateMatch) {
    throw new CcrParseError('No "Effective Date" on the rule-info page — template drift.');
  }
  const effectiveDate = `${dateMatch[3]}-${dateMatch[1]!.padStart(2, '0')}-${dateMatch[2]!.padStart(2, '0')}`;

  const wordMatch = /(?:word)[\s\S]{0,300}?ruleVersionId=(\d+)|ruleVersionId=(\d+)[\s\S]{0,300}?(?:word)/i.exec(html);
  const versionFromWord = wordMatch?.[1] ?? wordMatch?.[2];
  if (!versionFromWord) {
    throw new CcrParseError(
      'No word-document download found on the rule-info page. The PDF is the official rendering but is NOT a silent fallback — re-derive the word link from the saved raw.',
    );
  }
  const urlMatch = new RegExp(`[\\w./]*\\w+\\.do\\?[^"')]*ruleVersionId=${versionFromWord}[^"')]*`, 'i').exec(html);
  if (!urlMatch) {
    throw new CcrParseError('Word-document link found but its .do URL could not be extracted.');
  }
  return { ruleVersionId: versionFromWord, effectiveDate, docDownload: { url: urlMatch[0] } };
}
```

Executor notes: `findCurrentVersion` must pick the CURRENT version (the researched page lists 72 archived versions). The current version is the first/topmost block — if the real page interleaves archives before the current one, anchor on the page's "current version" region in the saved raw and harden here with a real-slice fixture. The `statedEffectiveDate` extraction reads only the reg's last 500 chars and requires the word "effective" nearby — adjust the window against real documents in task 10.

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): CCR DOCX parser and SOS page discovery helpers"
```

---

### Task 7: CCR — sources manifest and the two-tier capture pipeline

**Files:**
- Create: `packages/state-co/src/sources-ccr.ts`, `packages/state-co/src/capture-ccr.ts`
- Test: `packages/state-co/test/capture-ccr.test.ts`

**Interfaces:**
- Produces (sources-ccr): `CcrCaptureSource { code: '3 CCR' | '4 CCR' | '7 CCR'; deptName: string; agencyName: string; seriesNum: string; chapterKey: string; chapterTitle: string; domain: CoDomain; headerKind: CcrHeaderKind; filter: { kind: 'regs'; regCites: readonly string[] } | { kind: 'prefix'; citePrefix: string }; note?: string }`; `CO_CCR_SOURCES`.
- Produces (capture-ccr): `captureCcr(io: CaptureIo, sources: readonly CcrCaptureSource[], opts: { previousSections?: readonly CoSection[] }): Promise<{ sections: CoSection[]; report: { skippedEmpty: string[]; warnings: string[] } }>`; also `regNumberToCite(source: CcrCaptureSource, regNumber: string): string`.
- Consumes: `unzipSync`, `strFromU8` from `fflate`; `parseCcrDocumentXml` + the `find*` helpers; `io.fetchBinary` (task 3).

- [ ] **Step 1: src/sources-ccr.ts** (write first — the test consumes it)

```ts
import type { CcrHeaderKind } from './parse-ccr.js';
import type { CoDomain } from './schema.js';

/**
 * The CCR half of the manifest. The SOS publishes one document per SERIES;
 * capture is two-tier like Montana's MCA slot URLs: the dept list resolves
 * deptID/agencyID by NAME, the doc list resolves the series ruleId, the
 * rule-info page yields the current ruleVersionId + effective date + the
 * word-document download, and the DOCX is split into individual regulations.
 * deptName/agencyName strings are row-matching keys on the SOS pages —
 * verified (and corrected if needed) at the first --save-raw capture.
 */
export interface CcrCaptureSource {
  code: '3 CCR' | '4 CCR' | '7 CCR';
  deptName: string;
  agencyName: string;
  seriesNum: string;
  /** Becomes StateSection.chapter, e.g. '702-5'. */
  chapterKey: string;
  chapterTitle: string;
  domain: CoDomain;
  headerKind: CcrHeaderKind;
  filter: { kind: 'regs'; regCites: readonly string[] } | { kind: 'prefix'; citePrefix: string };
  note?: string;
}

export const CCR_BASE = 'https://www.coloradosos.gov/CCR';

export const CO_CCR_SOURCES: readonly CcrCaptureSource[] = [
  {
    code: '3 CCR',
    deptName: 'Department of Regulatory Agencies',
    agencyName: 'Division of Insurance',
    seriesNum: '3 CCR 702-5',
    chapterKey: '702-5',
    chapterTitle: 'Property and Casualty',
    domain: 'insurance',
    headerKind: 'regulation',
    filter: { kind: 'regs', regCites: ['702-5-1-14', '702-5-2-12', '702-5-2-15'] },
    note: '5-1-14 prompt payment (60 days); 5-2-12 auto consumer protections; 5-2-15 total-loss valuation and rental reimbursement (kickoff §2.2).',
  },
  {
    code: '4 CCR',
    deptName: 'Department of Regulatory Agencies',
    agencyName: 'Public Utilities Commission',
    seriesNum: '4 CCR 723-6',
    chapterKey: '723-6',
    chapterTitle: 'Rules Regulating Transportation by Motor Vehicle',
    domain: 'repair_law',
    headerKind: 'puc-rule',
    filter: { kind: 'prefix', citePrefix: '723-6-65' },
    note: 'The towing-carrier 6500-series ONLY — the series document is the whole transportation rulebook and must never be captured whole (kickoff §2.4; the leak test enforces).',
  },
  {
    code: '7 CCR',
    deptName: 'Department of Labor and Employment',
    agencyName: 'Division of Labor Standards and Statistics',
    seriesNum: '7 CCR 1103-1',
    chapterKey: '1103-1',
    chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
    domain: 'employment',
    headerKind: 'comps-rule',
    filter: {
      kind: 'regs',
      regCites: ['1103-1-2.4.1', '1103-1-3.1', '1103-1-4.1.1', '1103-1-5.1', '1103-1-5.2'],
    },
    note: 'COMPS Order #40: 2.4.1 the dealer salesperson/parts/mechanic exemption (the "dealers" caveat is annotated, not settled), 3.1 minimum wage, 4.1.1 overtime, 5.1 meal periods, 5.2 rest periods. Rule numbers are the #38/#39 structure — a named-reg hard-fail at first capture means Order #40 renumbered; reconcile against the real document consciously.',
  },
];
```

- [ ] **Step 2: Write the failing capture test** — fake io whose `fetchText` serves synthetic dept-list, doc-list, and rule-info pages (reusing task 6's fixture shapes), and whose `fetchBinary` serves a real zip built in the test with fflate:

```ts
// packages/state-co/test/capture-ccr.test.ts — build the fixture DOCX like this:
import { strToU8, zipSync } from 'fflate';
const docxBytes = zipSync({ 'word/document.xml': strToU8(DOI_XML) });
```

Assertions (write as real tests):
1. A `regs` filter yields exactly the named cites with `code`, `chapter`, `chapterTitle`, `domain`, `ccrRuleVersionId` from the pipeline, and `sourceUrl` = the DisplayRule.do rule-info URL.
2. `effectiveDate` prefers the reg's own stated date (`5-1-14` → `2025-12-30` from the body) and falls back to the version's effective date when the body states none (`5-2-12`).
3. A named regCite absent from the document throws, naming the series.
4. A `prefix` filter keeps only matching cites and reports the dropped count via `io.log` (the leak guard's visible half).
5. **The version shortcut:** when `previousSections` all carry the same `ccrRuleVersionId` the pipeline resolves from the rule-info page, `fetchBinary` is NEVER called and the previous sections are returned as-is (count fetchBinary invocations).
6. A fake io with no `fetchBinary` member throws a clear error naming `fetchBinary`.

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: src/capture-ccr.ts**

```ts
/**
 * The CCR capture pipeline. Two-tier discovery (names → ids → current
 * version), then ONE DOCX per series, unzipped here (fflate stays out of
 * the barrel) and split by parseCcrDocumentXml. The ruleVersionId is the
 * drift shortcut: when the rule-info page still states the version the
 * served corpus was captured from, the document fetch is skipped entirely
 * and the served text is reused — the CCR analog of ARM's content hashes.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { CaptureIo } from '@repairmcp/state-law';
import {
  findAgencyIds, findCurrentVersion, findRuleId, parseCcrDocumentXml,
} from './parse-ccr.js';
import type { CoSection } from './schema.js';
import { CCR_BASE, type CcrCaptureSource } from './sources-ccr.js';

export function regNumberToCite(source: CcrCaptureSource, regNumber: string): string {
  if (source.headerKind === 'regulation') {
    // DOI regs print "5-1-14"; the leading series digit is already the
    // chapter's tail, so the cite is chapterKey + the reg minus that digit:
    // 702-5 + 5-1-14 → 702-5-1-14.
    const withoutSeriesDigit = regNumber.replace(/^\d+-/, '');
    return `${source.chapterKey}-${withoutSeriesDigit}`;
  }
  // COMPS rules ("5.2") and PUC rules ("6511") append whole: 1103-1-5.2, 723-6-6511.
  return `${source.chapterKey}-${regNumber}`;
}

export async function captureCcr(
  io: CaptureIo,
  sources: readonly CcrCaptureSource[],
  opts: { previousSections?: readonly CoSection[] } = {},
): Promise<{ sections: CoSection[]; report: { skippedEmpty: string[]; warnings: string[] } }> {
  if (!io.fetchBinary) {
    throw new Error('CCR capture needs io.fetchBinary (DOCX documents) — wire makeCaptureIo.');
  }
  const sections: CoSection[] = [];
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];

  const deptListHtml = await io.fetchText(`${CCR_BASE}/NumericalDeptList.do`, {
    rawName: 'ccr-deptlist.html',
  });

  for (const source of sources) {
    const { deptID, agencyID } = findAgencyIds(deptListHtml, source.deptName, source.agencyName);
    const docListHtml = await io.fetchText(
      `${CCR_BASE}/NumericalCCRDocList.do?deptID=${deptID}&agencyID=${agencyID}`,
      { rawName: `ccr-doclist-${source.chapterKey}.html` },
    );
    const ruleId = findRuleId(docListHtml, source.seriesNum);
    const ruleInfoUrl = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${ruleId}&deptID=${deptID}&agencyID=${agencyID}`;
    const ruleInfoHtml = await io.fetchText(ruleInfoUrl, {
      rawName: `ccr-ruleinfo-${source.chapterKey}.html`,
    });
    const version = findCurrentVersion(ruleInfoHtml);

    const previous = (opts.previousSections ?? []).filter(
      (s) => s.code === source.code && s.chapter === source.chapterKey,
    );
    if (previous.length > 0 && previous.every((s) => s.ccrRuleVersionId === version.ruleVersionId)) {
      io.log(`  ${source.seriesNum}: version ${version.ruleVersionId} unchanged — document fetch skipped.`);
      sections.push(...previous);
      continue;
    }

    const docUrl = version.docDownload.url.startsWith('http')
      ? version.docDownload.url
      : `${CCR_BASE}/${version.docDownload.url.replace(/^\/?(?:CCR\/)?/, '')}`;
    const docxBytes = await io.fetchBinary(docUrl, {
      rawName: `ccr-doc-${source.chapterKey}.docx.b64`,
      accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(docxBytes);
    } catch {
      throw new Error(
        `${source.seriesNum}: the word-document download is not a zip (DOCX) — it may be a legacy .doc or an error page. Inspect the saved raw.`,
      );
    }
    const documentXml = files['word/document.xml'];
    if (!documentXml) {
      throw new Error(`${source.seriesNum}: DOCX has no word/document.xml — inspect the saved raw.`);
    }

    const parsed = parseCcrDocumentXml(strFromU8(documentXml), {
      headerKind: source.headerKind,
      seriesNum: source.seriesNum,
    });
    warnings.push(...parsed.warnings);

    const byCite = new Map(parsed.regs.map((r) => [regNumberToCite(source, r.regNumber), r]));

    let wantedCites: string[];
    if (source.filter.kind === 'regs') {
      for (const cite of source.filter.regCites) {
        if (!byCite.has(cite)) {
          throw new Error(
            `${source.seriesNum}: ${cite} was requested by name but is not in the document. ` +
              'The series may have renumbered (COMPS orders do) — reconcile the manifest against the real document.',
          );
        }
      }
      wantedCites = [...source.filter.regCites];
    } else {
      const prefix = source.filter.citePrefix;
      wantedCites = [...byCite.keys()].filter((cite) => cite.startsWith(prefix));
      const dropped = byCite.size - wantedCites.length;
      io.log(`  ${source.seriesNum}: prefix ${prefix} kept ${wantedCites.length}, dropped ${dropped}.`);
      if (wantedCites.length === 0) {
        throw new Error(`${source.seriesNum}: prefix ${prefix} matched nothing — renumbered?`);
      }
    }

    for (const cite of wantedCites) {
      const reg = byCite.get(cite)!;
      sections.push({
        cite,
        code: source.code,
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: reg.heading,
        text: reg.text,
        effectiveDate: reg.statedEffectiveDate ?? version.effectiveDate,
        domain: source.domain,
        sourceUrl: ruleInfoUrl,
        ccrRuleVersionId: version.ruleVersionId,
      });
    }
  }

  return { sections, report: { skippedEmpty, warnings } };
}
```

- [ ] **Step 5: Run tests to verify pass.**

- [ ] **Step 6: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): CCR sources and two-tier capture with the version shortcut"
```

---

### Task 8: Bulletin capture — B-5.04

**Files:**
- Create: `packages/state-co/src/capture-bulletin.ts`
- Test: `packages/state-co/test/capture-bulletin.test.ts`

**Interfaces:**
- Produces: `BulletinSource { cite: string; heading: string; chapter: string; chapterTitle: string; domain: CoDomain; effectiveDate: string; pdfUrl: string; pageUrl: string; mustContain: readonly string[] }`; `captureBulletin(io: CaptureIo, source: BulletinSource, opts?: { extractText?: (bytes: Uint8Array) => Promise<string> }): Promise<{ section: CoSection; report: { warnings: string[] } }>`.
- The REAL `BulletinSource` constant (`CO_BULLETIN_B_5_04`) is created in task 10 once the official DOI URL is located — this task ships the machinery, tested with an injected fake extractor. `mustContain` is the extraction-fidelity tripwire: strings that must appear in the extracted text (the bulletin number, the 10-4-120 reference).

- [ ] **Step 1: Write the failing test**

```ts
// packages/state-co/test/capture-bulletin.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureBulletin, type BulletinSource } from '../src/capture-bulletin.js';

const source: BulletinSource = {
  cite: 'B-5.04',
  heading: 'Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged Property',
  chapter: 'B-5',
  chapterTitle: 'Division of Insurance Bulletins, Property and Casualty',
  domain: 'insurance',
  effectiveDate: '2016-09-19',
  pdfUrl: 'https://doi.example.test/b-5.04.pdf',
  pageUrl: 'https://doi.example.test/bulletins',
  mustContain: ['B-5.04', '10-4-120'],
};

const fakeIo = (bytes: Uint8Array): CaptureIo => ({
  fetchText: async () => { throw new Error('unused'); },
  fetchJson: async () => { throw new Error('unused'); },
  fetchBinary: async () => bytes,
  log: () => {},
});

describe('captureBulletin', () => {
  test('extracted text becomes one verbatim section', async () => {
    const { section } = await captureBulletin(fakeIo(new Uint8Array([1])), source, {
      extractText: async () => 'Bulletin B-5.04\nConcerning § 10-4-120, C.R.S.\nThe division reminds carriers…',
    });
    expect(section.cite).toBe('B-5.04');
    expect(section.code).toBe('Colorado DOI Bulletin');
    expect(section.effectiveDate).toBe('2016-09-19');
    expect(section.sourceUrl).toBe(source.pageUrl);
    expect(section.text).toContain('10-4-120');
  });
  test('missing mustContain strings hard-fail — extraction fidelity is the point', async () => {
    await expect(
      captureBulletin(fakeIo(new Uint8Array([1])), source, { extractText: async () => 'garbled output' }),
    ).rejects.toThrow(/B-5\.04/);
  });
  test('an io without fetchBinary throws a clear error', async () => {
    const io = { ...fakeIo(new Uint8Array([1])) };
    delete (io as Record<string, unknown>).fetchBinary;
    await expect(captureBulletin(io as CaptureIo, source)).rejects.toThrow(/fetchBinary/);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: src/capture-bulletin.ts**

```ts
/**
 * DOI bulletin capture: one PDF, text-extracted, served as one section.
 * A bulletin is guidance, not law — the tool descriptions and annotations
 * say so; this module just captures it verbatim. unpdf loads via dynamic
 * import so no bundle path ever pulls it (this module is not in the barrel
 * anyway, same as every capture-* module). mustContain is the extraction
 * tripwire: PDF text extraction can silently garble, and a bulletin that
 * cannot state its own number did not extract.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import type { CoDomain, CoSection } from './schema.js';

export interface BulletinSource {
  cite: string;
  heading: string;
  chapter: string;
  chapterTitle: string;
  domain: CoDomain;
  /** The issue/reissue date the bulletin states. */
  effectiveDate: string;
  pdfUrl: string;
  /** The human landing page — becomes sourceUrl. */
  pageUrl: string;
  /** Extraction-fidelity tripwire: all must appear in the extracted text. */
  mustContain: readonly string[];
}

async function defaultExtractText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : String(text);
}

export async function captureBulletin(
  io: CaptureIo,
  source: BulletinSource,
  opts: { extractText?: (bytes: Uint8Array) => Promise<string> } = {},
): Promise<{ section: CoSection; report: { warnings: string[] } }> {
  if (!io.fetchBinary) {
    throw new Error('Bulletin capture needs io.fetchBinary (PDF) — wire makeCaptureIo.');
  }
  const extract = opts.extractText ?? defaultExtractText;
  const bytes = await io.fetchBinary(source.pdfUrl, {
    rawName: `bulletin-${source.cite}.pdf.b64`,
    accept: 'application/pdf',
  });
  const raw = await extract(bytes);
  const text = raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  for (const needle of source.mustContain) {
    if (!text.includes(needle)) {
      throw new Error(
        `Bulletin ${source.cite}: extracted text does not contain "${needle}" — the PDF did not ` +
          'extract faithfully. Inspect the saved raw; do not ship a garbled bulletin.',
      );
    }
  }

  return {
    section: {
      cite: source.cite,
      code: 'Colorado DOI Bulletin',
      chapter: source.chapter,
      chapterTitle: source.chapterTitle,
      heading: source.heading,
      text,
      effectiveDate: source.effectiveDate,
      domain: source.domain,
      sourceUrl: source.pageUrl,
    },
    report: { warnings: [] },
  };
}
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/state-co
git commit -m "feat(state-co): bulletin PDF capture with the extraction-fidelity tripwire"
```

---

### Task 9: CO_CAPTURE_PROFILE + registry + barrel

**Files:**
- Create: `packages/state-co/src/capture.ts`, `packages/state-co/src/index.ts`
- Modify: `scripts/state-registry.ts`
- Test: `packages/state-co/test/capture-profile.test.ts`

**Interfaces:**
- Produces: `CO_CAPTURE_PROFILE: StateCaptureProfile` (state `CO`, corpusPath `packages/state-co/data/co-law-corpus.json`, attention `CO-LAW-ATTENTION.txt`, `supportsOnly: false`). Its `captureAll` composes `captureCrs` + `captureCcr` + `captureBulletin`, guards key overlap, and builds meta with `crsEdition`/`crsCurrencyNote`.
- The bulletin source constant is not yet real: `capture.ts` exports `CO_BULLETIN_SOURCE: BulletinSource | null = null` in THIS task; `captureAll` skips the bulletin with a loud `io.log` line when null. Task 10 replaces it with the real constant — `captureAll` then requires it (null after task 10 would be a corpus regression, so task 10 also flips the skip into a throw).

- [ ] **Step 1: src/capture.ts**

```ts
/**
 * Colorado's StateCaptureProfile: the CRS whole-title fetches, the CCR
 * two-tier crawl, and the bulletin PDF composed into one captureAll. NOT
 * exported from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts (the MT pattern; fflate/unpdf stay out of the
 * Worker bundle this way).
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureBulletin, type BulletinSource } from './capture-bulletin.js';
import { captureCcr } from './capture-ccr.js';
import { captureCrs } from './capture-crs.js';
import { CRS_EDITION } from './identity.js';
import { CoCorpusFileSchema, type CoSection } from './schema.js';
import { CO_CCR_SOURCES } from './sources-ccr.js';
import { CO_CRS_SOURCES } from './sources-crs.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SOURCE_NOTE =
  'Captured from the Office of Legislative Legal Services CRS title files at olls.info ' +
  '(the practical official surface; the OLLS states currency per General Assembly session), ' +
  'from the Secretary of State Code of Colorado Regulations at coloradosos.gov (per-series ' +
  'documents with stated effective dates), and from the Division of Insurance bulletin PDF. ' +
  'Statute currency is the CRS edition stated in crsEdition; each CCR rule carries its own ' +
  'effective date; all were captured on the date stated.';

/** Filled with the real DOI URL in the first-capture task; null skips loudly. */
export const CO_BULLETIN_SOURCE: BulletinSource | null = null;

export const CO_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'CO',
  displayName: 'Colorado',
  corpusPath: 'packages/state-co/data/co-law-corpus.json',
  corpusFileSchema: CoCorpusFileSchema,
  attentionFileName: 'CO-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state co      (re-captures CRS + CCR + bulletin)\n' +
    '  3. cd packages\\state-co && bun test             (annotation + demo suites are the gate;\n' +
    '     a CRS edition rollover fails the CRS_EDITION pin and needs the constant bumped)\n' +
    '  4. cd ..\\..\\apps\\state-co-server && npx wrangler deploy\n' +
    '  5. curl -s https://co.repairmcp.com/health       (confirm the new capture date + edition)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    const previous = opts.previous?.sections as CoSection[] | undefined;
    const crs = await captureCrs(io, CO_CRS_SOURCES);
    const ccr = await captureCcr(io, CO_CCR_SOURCES, { previousSections: previous });

    const sections: CoSection[] = [...crs.sections, ...ccr.sections];
    const warnings = [...crs.report.warnings, ...ccr.report.warnings];
    if (CO_BULLETIN_SOURCE) {
      const bulletin = await captureBulletin(io, CO_BULLETIN_SOURCE);
      sections.push(bulletin.section);
      warnings.push(...bulletin.report.warnings);
    } else {
      io.log('  WARNING: CO_BULLETIN_SOURCE is null — B-5.04 NOT captured. Fill it (task 10).');
      warnings.push('bulletin skipped: CO_BULLETIN_SOURCE is null.');
    }

    const byKey = new Map<string, CoSection>();
    for (const section of sections) {
      const key = `${section.code}:${section.cite}`;
      if (byKey.has(key)) {
        throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      }
      byKey.set(key, section);
    }

    return {
      file: {
        meta: {
          state: 'CO',
          capturedAt: today(),
          currentThrough: today(),
          sourceNote: SOURCE_NOTE,
          sourceUrl: 'https://leg.colorado.gov',
          crsEdition: CRS_EDITION,
          crsCurrencyNote: crs.currencyNote,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [...crs.report.skippedEmpty, ...ccr.report.skippedEmpty],
        duplicates: [],
        warnings,
      },
    };
  },
};
```

Note: `meta.crsEdition` is the PIN (`CRS_EDITION`), while the capture WARNS on an index-year mismatch (task 5) — same failure mode as MT: a rollover warns at capture and fails the pin test until a human bumps the constant.

- [ ] **Step 2: src/index.ts** (barrel — NO capture modules)

```ts
export * from './schema.js';
export * from './taxonomy.js';
export * from './identity.js';
export * from './corpus.js';   // exists after task 11 — add these two lines then
export * from './notes.js';    //
export * from './tools.js';    // task 11
export * from './adapter.js';  // task 11
export * from './openai.js';   // task 11
export * from './parse-crs.js';
export * from './parse-ccr.js';
export * from './sources-crs.js';
export * from './sources-ccr.js';
```

In THIS task write the barrel with only the lines whose modules exist (schema, taxonomy, identity, parse-crs, parse-ccr, sources-crs, sources-ccr); task 11 appends the rest. Never add `capture.js`, `capture-crs.js`, `capture-ccr.js`, or `capture-bulletin.js`.

- [ ] **Step 3: Register CO** — in `scripts/state-registry.ts`:

```ts
import { CO_CAPTURE_PROFILE } from '../packages/state-co/src/capture.js';
// …
export const STATE_PROFILES: Record<string, StateCaptureProfile> = {
  wa: WA_CAPTURE_PROFILE,
  mt: MT_CAPTURE_PROFILE,
  co: CO_CAPTURE_PROFILE,
};
```

- [ ] **Step 4: Write the profile test** — `test/capture-profile.test.ts`: compose fake ios from the task 5 and task 7 fixtures; assert `captureAll` returns CRS + CCR sections with no overlap, meta carries `crsEdition === CRS_EDITION` and a nonempty `crsCurrencyNote`, and (bulletin null) the report carries the bulletin-skipped warning. Assert a manufactured duplicate (same code:cite from two entries) throws.

- [ ] **Step 5: Run** — `bun test` in state-co → PASS. Also `bun scripts/capture-state.ts --state co --dry-run --from-dir <empty-dir>` is expected to FAIL fast on the missing raw index (proves registry wiring executes; do not run a live capture yet).

- [ ] **Step 6: Commit**

```bash
git add packages/state-co scripts/state-registry.ts
git commit -m "feat(state-co): capture profile composed and registered"
```

---

### Task 10: First real capture — discovery, parser hardening, the corpus

This is the task where kickoff §9's risks are resolved against reality. Work it with `--save-raw` from the start; every adjustment to a parser gets a real-slice fixture added to the task 4/6 test files. THE RULES: a parser change must keep all synthetic-fixture tests green (or consciously update them with the real shape and say so in the commit); a manifest cite that does not survive contact with the source is a stop-and-look against the kickoff, never a silent drop.

- [ ] **Step 1: Locate B-5.04's official home.** Search doi.colorado.gov for "B-5.04" (WebFetch/browser). Acceptance: a `*.colorado.gov` URL serving the bulletin PDF, plus the bulletins landing page URL. Fill `CO_BULLETIN_SOURCE` in `src/capture.ts`:

```ts
export const CO_BULLETIN_SOURCE: BulletinSource | null = {
  cite: 'B-5.04',
  heading: 'Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged Property',
  chapter: 'B-5',
  chapterTitle: 'Division of Insurance Bulletins, Property and Casualty',
  domain: 'insurance',
  effectiveDate: '2016-09-19',
  pdfUrl: '<the located colorado.gov PDF URL>',
  pageUrl: '<the located bulletins landing page URL>',
  mustContain: ['B-5.04', '10-4-120'],
};
```

Verify `heading` and `effectiveDate` against the PDF itself (the reissue date the document states); correct them if the document says otherwise. Then flip the null-skip branch in `captureAll` into a throw (`CO_BULLETIN_SOURCE` is typed non-null from here on) and delete the skip test assertion from task 9's test.

- [ ] **Step 2: Dry-run with raw capture.**

```bash
bun scripts/capture-state.ts --state co --dry-run --save-raw C:\degdata\co-raw
```

Expect failures. Work them one at a time, in fetch order: the CRS index currency pattern, title hrefs (padding!), the title-file section convention (inspect `C:\degdata\co-raw\crs-title-42.htm` and harden `parse-crs.ts` — real-slice fixtures into `test/parse-crs.test.ts`), the SOS dept list, doc list, rule-info page (`findAgencyIds`/`findRuleId`/`findCurrentVersion` against the real HTML — the current-version block vs the 72 archived versions matters here), the DOCX internals (numbering warning? reg header shapes for `regulation`/`comps-rule`/`puc-rule` — fix `HEADER_PATTERNS` against `word/document.xml` extracted from the saved raw), and the bulletin extraction. Re-run with `--from-dir C:\degdata\co-raw` while iterating parsers — no repeat fetches.

- [ ] **Step 3: Resolve the named risks explicitly.** Record each answer in the task's commit message:
  1. Title 8: are 8-4-103/-105/-109 in the main HTM? If not, capture them from the supplement zip (extend `capture-crs.ts` consciously — a `supplementPdf` filter kind — or renegotiate scope with the project owner; do NOT quietly substitute an unofficial source).
  2. COMPS #40 rule numbers: do the five named regCites exist as written? Reconcile the manifest against the real order.
  3. PUC 6500-series: does the prefix filter keep a bounded towing set (expect roughly 10 to 40 rules)? Adjust `citePrefix` if the towing rules live in a different number band.
  4. Word auto-numbering: if the DOCX parse warns, eyeball extracted text against the official PDF; if numbering is genuinely lost, that is a stop-and-decide.
  5. Per-reg stated effective dates: verify the extraction window catches them (5-1-14 should state its own date).

- [ ] **Step 4: Full capture + eyeball.**

```bash
bun scripts/capture-state.ts --state co
```

Eyeball `packages/state-co/data/co-law-corpus.json`: read 10-4-120 (the (3)(e) clause verbatim?), 42-9-104, one COMPS rule, one PUC rule, the bulletin. Compare a paragraph each against the official source in a browser. Domain counts printed by the script should be roughly: insurance 10–12, repair_law 20–45 (depends on the PUC band), employment 8–9.

- [ ] **Step 5: Drift-check idempotence.**

```bash
bun scripts/check-state.ts --state co --out-dir C:\Users\ttrav\AppData\Local\Temp\claude\co-check
```

Expected: `[CO] clean` and the CCR series log the version-shortcut skip lines. Delete the temp out-dir after.

- [ ] **Step 6: Commit** (corpus + hardened parsers + real fixtures + the filled bulletin source):

```bash
git add packages/state-co scripts
git commit -m "feat(state-co): first capture - <N> verbatim sections from CRS, CCR, and B-5.04"
```

State the resolved risks (Title 8 outcome, COMPS numbering, PUC band, numbering warnings) in the commit body.

---

### Task 11: Corpus, notes, tools, adapter, connector — the serving wiring

**Files:**
- Create: `packages/state-co/src/corpus.ts`, `src/notes.ts`, `src/tools.ts`, `src/adapter.ts`, `src/openai.ts`
- Modify: `src/index.ts` (append the five barrel lines)
- Test: `packages/state-co/test/corpus.test.ts` (structural half — the gauntlet lands in task 12)

**Interfaces:**
- Produces: `CO_CORPUS_PROFILE: CorpusProfile`; `class CoCorpus extends StateLawCorpus<CoSection>`; `CO_EXTRA_STOPWORDS` (`new Set(['colorado'])`); `LEGAL_ADVICE_NOTE`/`EDUCATIONAL_CAVEAT`/`EMPTY_SEARCH_HINT`; `CoItem`, `class CoAdapter extends StateLawAdapter<CoSection, CoItem>`; `registerCoTools(server, corpus)`, `registerCoConnectorTools(server, adapter, corpus)`.

- [ ] **Step 1: corpus.ts / notes.ts / adapter.ts** — byte-level mirrors of MT with CO names:

```ts
// src/corpus.ts
import {
  StateLawCorpus, type CorpusProfile, type ScoreBreakdown,
  type StateLawHit, type StateQueryOpts, type StateQueryResult,
} from '@repairmcp/state-law';
import { displayCite, resolveCoCitationQuery } from './identity.js';
import { CO_CODES, CO_DOMAINS, CoCorpusFileSchema, type CoSection } from './schema.js';
import { CO_TOPICS, baselineTopics } from './taxonomy.js';

export const CO_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['colorado']);

export const CO_CORPUS_PROFILE: CorpusProfile = {
  state: 'CO',
  codes: CO_CODES,
  domains: CO_DOMAINS,
  topics: CO_TOPICS,
  baselineTopics,
  resolveCitationQuery: resolveCoCitationQuery,
  displayCite,
  extraStopwords: CO_EXTRA_STOPWORDS,
  corpusFileSchema: CoCorpusFileSchema,
};

export type CoScoreBreakdown = ScoreBreakdown;
export type CoHit = StateLawHit<CoSection>;
export type CoQueryResult = StateQueryResult<CoSection>;
export type CoQueryOpts = StateQueryOpts;

export class CoCorpus extends StateLawCorpus<CoSection> {
  constructor(corpusData: unknown, annotationsData: unknown = {}) {
    super(CO_CORPUS_PROFILE, corpusData, annotationsData);
  }
}
```

`notes.ts` = MT's with `'Colorado'`. `adapter.ts` = MT's with `CoItem`/`CoAdapter`/`coStateIdentity`/`CoDomain`.

- [ ] **Step 2: tools.ts** — the four descriptions are product surface; use these verbatim (shop-floor vocabulary, honest caveats):

```ts
const CO_SEARCH_AUTHORITY_DESCRIPTION = `Search Colorado state law for collision repair facilities: insurance claims handling (CRS 10-4-120, the anti-steering statute whose subsection (3)(e) requires insurers to assume all reasonable repair costs including materials and parts; the CRS 10-3-1104 unfair claims practices catalog; the Model Quality Replacement Parts Act with its 10-3-1305 aftermarket-parts estimate disclosure; DOI Regulation 5-1-14 prompt payment and 5-2-15 total-loss valuation; DOI Bulletin B-5.04), the Motor Vehicle Repair Act (CRS Title 42 Article 9: written estimates, charges over the estimate, storage, parts return, invoices), towing rules (CRS 42-4-2103 and the PUC towing-carrier rules), and employment rules (the Wage Act and the COMPS Order: breaks, overtime, minimum wage, final pay, deductions).

USE THIS WHEN:
- A Colorado claim issue needs the actual rule text: steering, short-pay, OEM procedure payment, supplement, prompt payment, aftermarket parts disclosure, total loss valuation or sales tax, storage.
- A shop obligation question: written estimates and invoices, charges exceeding the estimate, returning replaced parts, storage charges, tow-in rules.
- An HR question: rest and meal breaks, the flag-hour overtime exemption question, final paycheck timing, payroll deductions for tools or equipment.
- You have a citation like "CRS 10-4-120", "3 CCR 702-5-1-14", "Reg 5-1-14", "COMPS Rule 5.2", or "B-5.04" and want it directly.

KNOWN CAVEATS, answer these honestly instead of inventing law: CRS 10-3-1104 carries NO private right of action (Division of Insurance enforcement; common-law bad faith is case law outside this corpus). The Division of Insurance has publicly declined to decide whether refusing a specific OEM procedure is "unreasonable" under 10-4-120 — the statute text is here, the agency's enforcement posture is a fact to state. The COMPS overtime exemption for salespersons, parts-persons, and mechanics says "dealers" — whether an independent body shop qualifies is an OPEN question, never settled. Colorado has NO state OSHA plan: spray booth, respirator, and hazard communication duties come from federal OSHA (29 CFR), outside this corpus. Repair-lien and mechanic's-lien statutes are not in this corpus. Bulletin B-5.04 is DIVISION GUIDANCE, not law.

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, effective dates on CCR rules, score details, and citations. CRS citations carry the edition instead of a date (Colorado statutes state no per-section effective dates). Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;
```

Write `CO_GET_AUTHORITY_DESCRIPTION`, `CO_FIND_SUPPORTING_AUTHORITY_DESCRIPTION`, and `CO_BUILD_REBUTTAL_PACKET_DESCRIPTION` by mirroring MT's three (task-file `packages/state-mt/src/tools.ts` lines 39–67) with Colorado content: get's INPUT line lists `"CRS 10-4-120", "3 CCR 702-5-1-14", "crs:10-4-120", or a bare "10-4-120" (hyphenated triples read as CRS; regulations and rules need their prefix; COMPS rules also resolve by their dotted number, "2.4.1")`; find-supporting's USE THIS WHEN names the steering / OEM-procedure short-pay / parts-disclosure / prompt-payment / total-loss / storage disputes; rebuttal's OUTPUT caveat sentence becomes: `This does not determine liability or provide legal advice — in particular, 10-3-1104 enforcement belongs to the Division of Insurance (no private right of action), and whether a specific OEM procedure refusal violates 10-4-120(3)(e) is a question the Division has declined to answer; both are questions for counsel.`

Then the config + builders, mirroring MT exactly:

```ts
const CO_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'co',
  stateName: 'Colorado',
  sourceSiteName: 'leg.colorado.gov or coloradosos.gov',
  descriptions: { search: …, get: …, findSupporting: …, rebuttal: … },
  domains: CO_DOMAINS,
  topics: CO_TOPICS,
  domainSchema: CoDomainSchema,
  topicSchema: CoTopicSchema,
  getInputDescription:
    'A citation such as "CRS 10-4-120", "3 CCR 702-5-1-14", "Reg 5-1-14", "COMPS Rule 5.2", "B-5.04", or "crs:10-4-120".',
  identity: coStateIdentity,
  notes: { legalAdviceNote: LEGAL_ADVICE_NOTE, educationalCaveat: EDUCATIONAL_CAVEAT, emptySearchHint: EMPTY_SEARCH_HINT },
  rebuttalDomain: 'insurance',
};
```

plus `buildCoSearchAuthorityTool` … `registerCoTools` mirroring MT lines 93–112.

- [ ] **Step 3: openai.ts** — mirror MT's shape. Connector search description: condense the co_search description to the connector format (USE THIS WHEN bullets, KNOWN CAVEATS paragraph kept — it is the honesty surface, INPUT `query — one string`, OUTPUT `results — up to 10 matches…`). Fetch description's CITATION DISCIPLINE line: `metadata.citation carries the correct short form, e.g. "CRS 10-4-120, 2026 edition" or "3 CCR 702-5-1-14, effective 12/30/2025". Use it verbatim — never reformat it.` Titles: `Search Colorado law documents` / `Fetch a Colorado law document`.

- [ ] **Step 4: Structural corpus tests** (`test/corpus.test.ts`, first half):

```ts
import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/co-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/co-annotations.json' with { type: 'json' };
import { CoCorpus } from '../src/corpus.js';
import { CRS_EDITION } from '../src/identity.js';
import { CO_TOPICS } from '../src/taxonomy.js';

const corpus = new CoCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all three domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(8);
    expect(domains.repair_law).toBeGreaterThan(15);
    expect(domains.employment).toBeGreaterThan(6);
  });
  test('the CRS_EDITION pin matches the corpus — the yearly rollover tripwire', () => {
    expect((corpus.meta as { crsEdition?: string }).crsEdition).toBe(CRS_EDITION);
  });
  test('CRS sections never carry effective dates; CCR sections always do, with a version id', () => {
    for (const s of corpus.sections) {
      if (s.code === 'CRS') {
        expect(s.effectiveDate).toBeUndefined();
        expect(s.ccrRuleVersionId).toBeUndefined();
      } else if (s.code !== 'Colorado DOI Bulletin') {
        expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.ccrRuleVersionId).toMatch(/^\d+$/);
      }
    }
  });
  test('the bulletin is one section with its issue date', () => {
    const bulletins = corpus.sections.filter((s) => s.code === 'Colorado DOI Bulletin');
    expect(bulletins.length).toBe(1);
    expect(bulletins[0]!.effectiveDate).toBe('2016-09-19');
  });
  test('the PUC series never leaked past the towing band', () => {
    for (const s of corpus.sections.filter((x) => x.code === '4 CCR')) {
      expect(s.cite.startsWith('723-6-65')).toBe(true);
    }
    expect(corpus.sections.filter((x) => x.code === '4 CCR').length).toBeLessThan(45);
  });
  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const topic of CO_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });
  test('getSection tolerates every citation spelling', () => {
    for (const input of ['CRS 10-4-120', 'crs:10-4-120', '10-4-120']) {
      expect(corpus.getSection(input)?.cite).toBe('10-4-120');
    }
    for (const input of ['3 CCR 702-5-1-14', 'Reg 5-1-14']) {
      expect(corpus.getSection(input)?.cite).toBe('702-5-1-14');
    }
    expect(corpus.getSection('COMPS Rule 5.2')?.cite).toBe('1103-1-5.2');
    expect(corpus.getSection('B-5.04')?.cite).toBe('B-5.04');
    expect(corpus.getSection('CRS 99-99-999')).toBeNull();
  });
});
```

(`co-annotations.json` starts as `{}` in this task — create the file with `{}` so the import resolves; task 12 fills it. The no-dead-topic test may FAIL until task 12 annotates — that ordering is fine, note it and proceed; task 12's exit gate is the full suite green.)

- [ ] **Step 5: Adapter/connector round-trip test** (same file): `new CoAdapter(corpus)`; `await adapter.getById('3 ccr:702-5-1-14')` returns the item (the space-bearing id namespace, proven); `adapter.sectionToItem` title starts with the display cite.

- [ ] **Step 6: Build + run** — `bun install` (if needed), root `bun run build` (state-co compiles), `bun test` in state-co. Commit:

```bash
git add packages/state-co
git commit -m "feat(state-co): corpus, tools, adapter, connector wiring"
```

---

### Task 12: Annotations + the demo gauntlet

**Files:**
- Modify: `packages/state-co/data/co-annotations.json`
- Test: `packages/state-co/test/corpus.test.ts` (append the gauntlet describe-block)

The annotation layer is the vocabulary bridge (shop phrasing → statutory language) and the quote-safety layer. Keys are display cites. Every `quoteSafeExcerpts` entry MUST be copied character-for-character from `data/co-law-corpus.json` — the corpus constructor throws on any non-substring, and that throw is the loop you work in.

- [ ] **Step 1: Append the gauntlet tests** (the launch bar, from kickoff §7):

```ts
describe('launch demo criteria — the expert gauntlet', () => {
  test('steering: 10-4-120 first', () => {
    const r = corpus.findSupporting('adjuster says my customer has to use their network shop');
    expect(r.hits[0]!.section.cite).toBe('10-4-120');
  });
  test('the killer demo: OEM procedure short-pay reaches 10-4-120 with the (3)(e) excerpt', () => {
    const r = corpus.findSupporting('insurer refuses to pay for the OEM procedure and is short-paying the repair');
    expect(r.hits[0]!.section.cite).toBe('10-4-120');
    expect(r.hits[0]!.annotation?.quoteSafeExcerpts?.some((e) => e.includes('reasonable costs'))).toBe(true);
  });
  test('undisclosed aftermarket parts: 10-3-1305 in the top three', () => {
    const r = corpus.findSupporting('estimate written with aftermarket parts and nobody told the customer');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('10-3-1305');
  });
  test('supplement sitting: Reg 5-1-14 in the top three', () => {
    const r = corpus.findSupporting('supplement has been sitting for two months with no answer from the carrier');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('702-5-1-14');
  });
  test('total loss taxes and fees: 10-4-639 in the top three', () => {
    const r = corpus.findSupporting('total loss but they will not pay the sales tax and registration fees');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('10-4-639');
  });
  test('authorization: 42-9-104 in the top three', () => {
    const r = corpus.findSupporting('customer never authorized the extra work before we started');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('42-9-104');
  });
  test('over the estimate and storage: 42-9-106 in the top three', () => {
    const r = corpus.findSupporting('final bill came in over the written estimate and now storage charges');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('42-9-106');
  });
  test('painter breaks: the COMPS rest rule in the top three', () => {
    const r = corpus.findSupporting('do my painters get paid rest breaks during the shift');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('1103-1-5.2');
  });
  test('flag-hour overtime: the exemption rule surfaces WITH the dealers caveat', () => {
    const r = corpus.findSupporting('are my flag rate techs exempt from overtime');
    const hit = r.hits.slice(0, 3).find((h) => h.section.cite === '1103-1-2.4.1');
    expect(hit).toBeDefined();
    expect(hit!.annotation?.claimUseCases?.some((u) => /dealer/i.test(u))).toBe(true);
  });
  test('final paycheck: 8-4-109 first', () => {
    const r = corpus.findSupporting('tech quit and still has my tools, when is his final check due');
    expect(r.hits[0]!.section.cite).toBe('8-4-109');
  });
  test('an exact cite short-circuits at 1.0', () => {
    const r = corpus.search('CRS 10-4-120');
    expect(r.hits[0]!.score).toBe(1);
    expect(r.hits[0]!.breakdown.citation).toBe(1);
  });
  test('a chapter listing works for the repair act', () => {
    const r = corpus.search('42-9');
    expect(r.chapterListing).toBe(true);
    expect(r.hits.length).toBeGreaterThan(8);
  });
});
```

If the captured corpus's real section numbering differs from an expectation (e.g., authorization is not `42-9-104`), that is a source-verification moment: re-read the captured text, confirm which section actually carries the duty, and change the TEST to the true cite with a comment naming the check — never bend an annotation to force a wrong cite upward.

- [ ] **Step 2: Run — expect gauntlet failures.** This is the iteration loop.

- [ ] **Step 3: Write `data/co-annotations.json`.** Annotate at minimum: `CRS 10-4-120`, `CRS 10-3-1104`, `CRS 10-4-639`, `CRS 10-3-1305`, `3 CCR 702-5-1-14`, `3 CCR 702-5-2-15`, `CRS 42-9-104`, `CRS 42-9-106`, `CRS 42-9-109`, `CRS 6-1-105`, `7 CCR 1103-1-2.4.1`, `7 CCR 1103-1-5.2`, `CRS 8-4-109`, `Colorado DOI Bulletin B-5.04`. The shape per key (topics from CO_TOPICS only; excerpts copied verbatim from the corpus JSON):

```json
{
 "CRS 10-4-120": {
  "topics": ["steering", "repair_facility_choice", "short_pay", "fair_settlement", "supplement_handling", "estimate_dispute"],
  "appliesTo": ["insurers", "repairers", "claimants", "consumers"],
  "claimUseCases": [
   "steering away from shop of choice",
   "DRP network pressure on customer",
   "insurer requires a particular repair shop",
   "short pay on OEM procedures",
   "refusing to pay reasonable repair costs",
   "materials and parts not paid",
   "kickback referral arrangement",
   "unreasonable travel distance to approved shop"
  ],
  "quoteSafeExcerpts": [
   "<copy the (3)(e) 'assume all reasonable costs sufficient to pay for the … repairs including materials or parts' clause verbatim from co-law-corpus.json>",
   "<copy the (2) prohibition on requiring a particular repair business verbatim>"
  ]
 }
}
```

Fill the other keys in the same shape. Content guidance per key: 10-3-1104 useCases carry `"unfair claim settlement practice"`, `"lowball offer"`, `"no reasonable investigation"` AND `"DOI complaint"` (plus its excerpts from the (1)(h) list); 702-5-1-14 carries `"supplement sitting sixty days"`, `"no decision on a clean claim"`, `"prompt payment deadline"`; 1103-1-2.4.1 MUST carry a dealer-caveat use case (the gauntlet asserts it), e.g. `"flag hour overtime exemption applies to dealers, open question for independent shops"`; B-5.04 useCases carry `"division guidance on payment of repair claims"` and its topics stay within the taxonomy.

- [ ] **Step 4: Iterate to green.** The constructor's substring throw catches paraphrases; the gauntlet catches ranking gaps (add claimUseCases vocabulary, never touch scoring weights — kickoff §1 and the CLAUDE.md scoring convention both forbid rescaling). The no-dead-topic test from task 11 must also be green now.

- [ ] **Step 5: Full suite + build.** `bun test` (state-co, all green), root `bun run build`. Commit:

```bash
git add packages/state-co
git commit -m "feat(state-co): annotation layer and the demo gauntlet green"
```

---

### Task 13: `apps/state-co-server` — the Worker

**Files:**
- Create: `apps/state-co-server/package.json`, `tsconfig.worker.json`, `wrangler.jsonc`, `src/worker.ts`

**Interfaces:**
- Consumes: `CoAdapter`, `CoCorpus`, `registerCoConnectorTools`, `registerCoTools`, `CoItem` from `@repairmcp/state-co`; the two data JSONs via the package's `./data/*` export.

- [ ] **Step 1: The four files.** All four are the MT server files with CO substitutions — and because the MT worker is the proven template, produce them by copying `apps/state-mt-server`'s four files and applying exactly these changes (no other edits):
  - `package.json`: name `@repairmcp/state-co-server`, description `"Cloudflare Worker hosting the Colorado state law MCP server (verbatim CRS/CCR corpus)."`, dependency `@repairmcp/state-co` instead of state-mt.
  - `tsconfig.worker.json`: unchanged copy.
  - `wrangler.jsonc`: name `repairmcp-state-co`, route pattern `co.repairmcp.com`, comments updated to say `--state co`. `workers_dev` stays `false`.
  - `src/worker.ts`: imports from `@repairmcp/state-co` and `@repairmcp/state-co/data/co-law-corpus.json` / `co-annotations.json`; `SERVER_NAME = 'repairmcp-state-co'`; `MtAdapter/MtCorpus/MtItem/registerMt*` → `CoAdapter/CoCorpus/CoItem/registerCo*`; the `/health` corpus block reports `crsEdition: (corpus.meta as { crsEdition?: string }).crsEdition ?? null` instead of `mcaEdition`; the `/` plain-text pointer describes Colorado:

```
Source: Colorado state law for collision repair facilities — insurance claims
handling, the Motor Vehicle Repair Act, DOI regulations and Bulletin B-5.04,
towing rules, and employment rules, captured verbatim from the CRS
(leg.colorado.gov / olls.info) and the Code of Colorado Regulations
(coloradosos.gov).
Read-only. Not legal advice.
```

- [ ] **Step 2: Wire the workspace.** `bun install` from the root, then root `bun run build` — the worker's `tsc -p tsconfig.worker.json` must pass (this is the check that `fflate`/`unpdf` never entered the barrel: if the worker typecheck or a later `wrangler deploy` bundle pulls them, a capture module leaked into `src/index.ts`).

- [ ] **Step 3: Local verification.**

```bash
cd apps/state-co-server && npx wrangler dev
```

Against `http://127.0.0.1:8787`:
1. `curl -s http://127.0.0.1:8787/health` → `ok: true`, section count, `crsEdition: "Colorado Revised Statutes 2026"`, three domains.
2. An MCP `initialize` + `tools/list` round-trip (the header dance matters — copy the exact curl sequence from the MT launch's verification, or use a minimal Node script): expect six tools (`co_search_authority`, `co_get_authority`, `co_find_supporting_authority`, `co_build_rebuttal_packet`, `search`, `fetch`).
3. `tools/call co_find_supporting_authority` with `disputeText: "adjuster says my customer has to use their network shop"` → first result cite `CRS 10-4-120`.

- [ ] **Step 4: Commit**

```bash
git add apps/state-co-server
git commit -m "feat(state-co-server): Colorado Worker - co.repairmcp.com"
```

---

### Task 14: Deploy + wire verification

- [ ] **Step 1: Deploy.**

```bash
cd apps/state-co-server && npx wrangler deploy
```

The `custom_domain: true` route provisions `co.repairmcp.com` DNS automatically (no existing record conflicts — WA/MT precedent). If wrangler reports a route/DNS conflict, STOP and surface it — do not delete records.

- [ ] **Step 2: Verify on the wire.**
1. `curl -s https://co.repairmcp.com/health` — `ok: true`, the exact section count and `capturedAt` from the committed corpus, the edition.
2. The three demo scenarios as real JSON-RPC calls against `https://co.repairmcp.com/mcp`: steering → `CRS 10-4-120` first; OEM-procedure short-pay → `10-4-120` with the (3)(e) excerpt in `quoteSafeExcerpts`; supplement-sitting → `3 CCR 702-5-1-14` present. Confirm `citation.shortForm` renders `"CRS 10-4-120, 2026 edition"`.
3. `co_get_authority` with `"B-5.04"` → the bulletin text with `"Colorado DOI Bulletin B-5.04, issued 9/19/2016"`.

- [ ] **Step 3: WAF burst test.** Fire 25 rapid POSTs at `/mcp` (a small loop; malformed JSON-RPC is fine — the WAF counts requests). Expect HTTP 429s beginning at request 21 within the 10 s window (the zone rule matches `/mcp` on every hostname — verified at the WA/MT launches, re-proven here). Wait 15 s after for the block to lapse.

- [ ] **Step 4: Drift-check registration proof.** `bun scripts/check-state.ts --state co` → `[CO] clean`, one CSV line appended to `C:\degdata\logs\state-law-check.log`. The Scheduled Task "RepairMCP State Law Check" iterates every registered state, so CO rides the existing schedule with no Scheduler changes.

- [ ] **Step 5: Commit anything the deploy touched** (nothing expected; wrangler writes no files). Record the deployment id and verified outputs in the task notes for task 15's CLAUDE.md row.

---

### Task 15: Site, legal review, CLAUDE.md

**Files:**
- Modify: `apps/site/public/index.html`, `CLAUDE.md`
- Review-only: `apps/site/public/legal.html`

- [ ] **Step 1: Site card.** Study the MT launch's site change first — `git show 74ab9c9 -- apps/site/public/index.html` — and make the same shape of change for Colorado: the sources count language moves from four to five, and the Colorado card goes live in the sources section. Card copy (linter-safe: no em or en dashes, no "MCP client", the acronym MCP must not appear here since the page already expands it once):

> **Colorado state law** — LIVE
> Steering, short pays, aftermarket parts disclosure, prompt payment deadlines, total loss, storage, and the shop rules in the Motor Vehicle Repair Act. Quoted verbatim from the Colorado Revised Statutes, the Code of Colorado Regulations, and Division of Insurance guidance.
> Endpoint: `https://co.repairmcp.com/mcp`

(Written here with an em dash for readability; in the HTML use the card markup's existing structure — the linter forbids the dash character itself.)

- [ ] **Step 2: "What to ask it" prompts — tested live FIRST.** Add one or two Colorado prompts to the examples section, each verified against the deployed server before publishing (house rule). Candidates, in shop phrasing:
  - "The adjuster says my customer has to use their network shop. What does Colorado law actually say?" (expect: CRS 10-4-120 quoted)
  - "A supplement has been sitting with the carrier for two months on a Colorado claim. What deadline applies?" (expect: 3 CCR 702-5-1-14)
  Run each through the live connector/tool and keep only prompts whose top answer is the right cite.

- [ ] **Step 3: Copy linter + local render.**

```bash
cd apps/site && bun run test && bun run dev
```

Eyeball the page. Then `bun run deploy`.

- [ ] **Step 4: /legal review.** Read `apps/site/public/legal.html`; expected NO change (pure corpus, zero outbound, same posture as WA/MT — the WA/MT launch entries already cover state-law sources generically). If state sources are enumerated by name anywhere, add Colorado; otherwise record "reviewed, no change needed" in the commit message.

- [ ] **Step 5: CLAUDE.md.** Add: the `packages/state-co` + `apps/state-co-server` blocks to the project-shape tree (mirroring the MT entries: parser tripwires, the version-shortcut drift note, the bulletin); `co` mentions in the state-server Commands section (`capture-state --state co`, `curl -s https://co.repairmcp.com/health`); a `CO vertical` build-status row (live date, section count, the verified demo results, the WAF proof, open items = connector gates in the project owner's clients); updated test totals (count the real numbers from `bun test` output across all packages). Also note the one state-law addition (optional `fetchBinary`) in the state-law paragraph.

- [ ] **Step 6: Final verification + commit.**

```bash
bun run build            # root, green
cd packages/state-co && bun test    # green
cd ../state-law && bun test && cd ../state-wa && bun test && cd ../state-mt && bun test  # untouched and green
```

```bash
git add apps/site CLAUDE.md
git commit -m "feat(site): Colorado card live; docs: CO vertical shipped"
```

---

## Execution order and gates

Tasks 1→9 are code-only and sequential (3 can run any time before 7). Task 10 is the reality gate — it is the only task that touches the network, and it may loop back into tasks 4–8's parsers (with fixtures). Tasks 11→12 need task 10's corpus. Task 13 needs 11–12. Task 14 needs 13. Task 15 needs 14 (live prompts). The regression gate (state-law/wa/mt green, zero edits) runs in task 3 and again in task 15 step 6.

Do not start task 14 (deploy) without the full state-co suite green — the corpus tests and gauntlet are the acceptance gate the kickoff names.




