# Kickoff spec: NHTSA and Washington state verticals

> **Status 2026-08-27 (evening): §1 NHTSA is SHIPPED** — live at
> `nhtsa.repairmcp.com/mcp`, site card flipped, CLAUDE.md carries the build
> row and gotchas. Two additions relative to this spec: 49 U.S.C. ch. 301 was
> added as a law corpus at the project owner's direction (captured from OLRC, not the
> govinfo edition this spec links — govinfo per-section URLs soft-404 and its
> edition lags years), and the May branch `codex/washington-binding-authority`
> turned out to hold a full prior implementation of BOTH verticals, not just
> research. **§2 Washington is superseded by `docs/WA-VERTICAL-KICKOFF.md`**
> (2026-08-27, evening): a fine-tooth-comb audit of the branch's state-wa
> implementation, verified capture mechanics for leg.wa.gov, and the
> expanded scope directive (insurance + repair law + WISHA safety + HR/employment).
> Plan the Washington vertical from that file, not this one.

Written 2026-08-27 at the end of the launch session, as the handoff into a
fresh planning session. Read `docs/ARCHITECTURE.md` first for the core
abstractions; this file is what is specific to these two builds. Start the
next session in plan mode with "plan the NHTSA vertical" and work this list.

Both verticals already have cards on the live site ("What's next"), and the
site now invites shops to email requests that move sources up the list — so
finishing these is also keeping a public promise.

---

## 1. NHTSA (build first)

**The pitch on the site:** "Recalls, complaints, and investigations by year,
make, and model. For the open-recall check and for the pattern behind a
complaint you have now seen three times."

### Why this is a faster build than DEG was

NHTSA publishes free, no-key, official JSON lookup services. That means a
**live adapter** — query NHTSA at request time — rather than DEG's whole
scrape / store / hash / delta-sync / D1 pipeline. No crawler, no weekly sync,
no corpus staleness machinery, no 25 MB migrations. The freshness convention
("the corpus states its own cutoff") is satisfied trivially: every answer is
live and says so with a retrievedAt timestamp.

Known endpoints (verify current shapes before coding; knowledge may be stale):

- Recalls by vehicle: `api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=`
- Complaints by vehicle: `api.nhtsa.gov/complaints/complaintsByVehicle?...`
- VIN decode (year/make/model from a VIN): `vpic.nhtsa.dot.gov/api/`
- Investigations and manufacturer communications (TSBs) are historically flat
  files from ODI, not clean JSON lookups — v1 can ship without them if so.

### Decisions to settle in plan mode

1. **Which datasets in v1.** Recalls + complaints alone deliver the site
   card's promise. Investigations/TSBs only if a sane lookup exists.
2. **Tool shape.** The four standard corpus tools (search / fetch /
   list_recent / find_supporting) assume a local corpus; a live source cannot
   do corpus-wide free-text search. Likely custom tools instead:
   `nhtsa_check_recalls(year, make, model)`,
   `nhtsa_complaints(year, make, model, keyword?)` — with
   `RepairMCPServer.registerStandardTools({ skip: [...] })` or none at all.
   This is the first real test of "vertical-agnostic core": if core needs
   changes, make them make sense for I-CAR too.
3. **VIN in or out for v1.** Shops live on VINs; vPIC decode → year/make/model
   is one extra hop. But the privacy page says we only receive search terms —
   decide whether a VIN passed through to NHTSA's own decoder is consistent
   with that (it is vehicle data, not personal data, and NHTSA built the
   decoder for exactly this — but decide it consciously and update /legal if
   needed).
4. **Citation format.** Campaign number + report date + nhtsa.gov URL for
   recalls; ODI number for complaints. Route dates through `fmtDateUtc` like
   everything else. AI clients drop `citation.shortForm` verbatim — design it
   to read well in a supplement note.
5. **Caching.** Short-TTL result cache (hours, `caches.default`) keyed on the
   query — NHTSA data changes daily at most. No CORPUS_VERSION; nothing to
   invalidate manually. Decide TTL and whether /health should probe NHTSA.
6. **Failure honesty.** NHTSA outages happen. Degrade to "NHTSA is not
   answering right now" — never to a guess and never to silence. Same
   convention as freshness: unknown means say so.
7. **Hostname + rate limit.** `nhtsa.repairmcp.com`, custom domain,
   `workers_dev: false`, same as deg. **Check the existing WAF rate limit
   rule's expression first**: Free plan allows exactly one rule; if it matches
   on path `/mcp` without pinning the hostname it may already cover every
   `*.repairmcp.com/mcp`. If it pins `deg.`, decide how to share one rule
   across both hostnames before deploying.

### Build shape (rough)

`packages/nhtsa` (schema, live adapter over injected FetchLike, tools with
shop-language descriptions) + `apps/nhtsa-server` (worker; STDIO entry only if
Claude Desktop use is wanted). Tests: recorded NHTSA fixtures injected through
`FetchLike` (the tier2.ts pattern), no live calls in CI. Demo scenario to beat
before shipping: an open-recall check on a common shop vehicle (say, a 2020
Transit or a top-10 seller) that returns campaign numbers with dates, and a
complaint-pattern question that returns countable, citable reports.

### Housekeeping first

- `packages/nhtsa/` and `packages/state-wa/` on disk are **empty husks** from
  a June scaffold (no source, no package.json, untracked). Delete them and
  scaffold fresh.
- A stale worktree registration `.git/worktrees/codex-washington-binding-authority`
  resists deletion (permission denied). Run `git worktree prune` from an
  elevated shell. Before pruning, check whether the branch it pointed at still
  exists — the name suggests prior Washington research that may be worth
  recovering: `git branch -a | grep -i washington`.

---

## 2. Washington state regulations (build second)

**The pitch on the site:** "What the rules actually say about steering,
aftermarket parts, appraisals, and short-pays. Washington first. Ask for your
state and it jumps the line."

### Shape

This one IS a corpus vertical, like DEG — but tiny and slow-moving, so no
delta-sync machinery: a hand-curated JSON corpus, refreshed manually when the
law changes, served by the same in-memory adapter pattern.

Candidate corpus (verify and scope in plan mode):

- WAC 284-30 unfair claims settlement practices — the short-pay / appraisal /
  steering core (284-30-330 and neighbors), total loss (284-30-390 range)
- RCW 46.71 (automotive repair act)
- Insurance Commissioner (OIC) bulletins and technical assistance advisories
  that interpret the above

### Decisions to settle in plan mode

1. **Package shape.** `packages/state-wa` vs one `packages/state-regs` with
   per-state data files. Fifty states are coming if this works — decide the
   shape that makes state #2 a data task, not a code task.
2. **Sourcing.** RCW/WAC text is published at the legislature's site;
   bulletins are PDFs at the OIC. Confirm terms of reuse (state law text is
   public record) and pick a capture format that preserves section numbers,
   effective dates, and exact wording — the citation IS the product.
3. **Citation format.** "WAC 284-30-330(7), effective <date>, <url>" — a
   citation an appraiser can paste into a dispute letter.
4. **The legal-advice line.** Tool descriptions and payloads must say plainly:
   this quotes the regulation and cites the section; it is not legal advice.
   /legal already covers the service side; the tool text should echo it.
5. **Freshness.** Corpus states "regulations as published through <date>";
   every layer degrades to silence if unknown — same convention as DEG.

### Demo criteria

A shop asks "can the insurer make me use aftermarket parts in Washington" or
"what does Washington say about steering" and gets back the actual WAC
section, quoted, with the number and effective date — not a summary from
model memory.

---

## Sequence

1. NHTSA plan session → build → wire check → flip the site card to Live.
2. WA plan session → corpus capture → build → flip the card.
3. Each launch: site card + a "What to ask it" prompt or two (tested against
   the live server first, same as the DEG ones), CLAUDE.md build-status row,
   and the outreach note.
