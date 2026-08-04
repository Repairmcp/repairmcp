-- 0001_schema.sql — base tables for the DEG corpus on Cloudflare D1.
--
-- Apply order matters: 0001 (this file) → 0002_data.sql → 0003_fts.sql.
-- The FTS5 virtual table and its sync triggers are deliberately NOT here,
-- because D1's bulk import path does not handle virtual tables, and because
-- building the index once with 'rebuild' after the rows land is far cheaper
-- than firing 22,652 triggers during the import.
--
-- No explicit transaction statements anywhere in these files. D1 wraps the
-- import in its own transaction and rejects a file that opens one. Note that
-- wrangler's check scans the raw text, comments included, so do not name those
-- statements here either -- it will refuse the file over a comment.

DROP TABLE IF EXISTS inquiry;

CREATE TABLE inquiry (
  -- INTEGER PRIMARY KEY aliases the rowid. The numeric DEG inquiry id is used
  -- directly so that (a) the external-content FTS table can point at it via
  -- content_rowid, and (b) `fetch(id)` is a rowid lookup rather than an index
  -- probe. Verified: all 22,652 ids are unique positive integers, max 41745.
  db_id            INTEGER PRIMARY KEY,

  -- The string form is what MCP exposes as BaseItem.id. Stored separately
  -- rather than cast on read, so the served record round-trips byte-identical
  -- to the JSON the local server loads.
  id               TEXT    NOT NULL,
  inquiry_number   TEXT    NOT NULL,

  title            TEXT    NOT NULL,
  url              TEXT    NOT NULL,

  ip               TEXT,               -- 'CCC' | 'Mitchell' | 'Audatex' | NULL
  inquiry_type     TEXT,
  area_of_vehicle  TEXT,

  vehicle_year     INTEGER,
  vehicle_make     TEXT,
  vehicle_model    TEXT,
  body             TEXT,

  -- Present in the Zod schema, NULL on all 22,652 current records. Carried so
  -- the table stays aligned with DEGInquiry rather than drifting from it.
  labor_type       TEXT,

  issue_summary    TEXT,
  suggested_action TEXT,
  resolution       TEXT,

  status           TEXT    NOT NULL,   -- 'pending' | 'resolved' | 'closed'

  -- ISO 8601 UTC, exactly as the JSON carries it. Same-format strings sort
  -- lexicographically in date order, so listRecent and `since` filters are
  -- plain string comparisons — no date functions, no timezone surface.
  submitted_at     TEXT    NOT NULL,
  resolved_at      TEXT,
  last_updated     TEXT    NOT NULL,

  -- The metadata bag, serialized verbatim. Audit-only fields (lastSeenAt,
  -- bodyFetchedAt) live here and must never be routed into a citation date.
  metadata         TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_inquiry_id ON inquiry(id);
CREATE INDEX idx_inquiry_submitted ON inquiry(submitted_at DESC);
CREATE INDEX idx_inquiry_ip ON inquiry(ip);
CREATE INDEX idx_inquiry_status ON inquiry(status);
CREATE INDEX idx_inquiry_year ON inquiry(vehicle_year);
CREATE INDEX idx_inquiry_make_nocase ON inquiry(vehicle_make COLLATE NOCASE);

-- The "effective date" of an inquiry: when it was resolved, or when it was
-- submitted if it never was. This is the tie-break key for find_supporting
-- ranking, and the recency arm of the candidate pool sorts on it, so it gets
-- an expression index rather than a sort of the whole match set.
CREATE INDEX idx_inquiry_effective_date
  ON inquiry(COALESCE(resolved_at, submitted_at) DESC);
