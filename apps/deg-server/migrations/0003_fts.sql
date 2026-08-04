-- 0003_fts.sql — FTS5 index over the inquiry table, applied AFTER 0002_data.sql.
--
-- Two reasons this is a separate migration rather than part of 0001:
--   1. D1's bulk import path does not handle virtual tables.
--   2. 'rebuild' builds the whole index in one pass. Creating the triggers
--      first would instead fire 22,652 individual trigger inserts during the
--      data import, for the same result at far greater cost.
--
-- Column order here is load-bearing: the bm25() weights in the adapter are
-- positional. If a column is added, moved, or removed, the weight vector in
-- packages/deg/src/d1/sql.ts must move with it.

DROP TABLE IF EXISTS inquiry_fts;

CREATE VIRTUAL TABLE inquiry_fts USING fts5(
  title,             -- 1
  issue_summary,     -- 2
  suggested_action,  -- 3
  resolution,        -- 4
  inquiry_type,      -- 5
  area_of_vehicle,   -- 6
  vehicle_make,      -- 7
  vehicle_model,     -- 8
  body,              -- 9
  content='inquiry',
  content_rowid='db_id'
);

-- Build the index from the rows already present in the content table.
INSERT INTO inquiry_fts(inquiry_fts) VALUES('rebuild');

-- Sync triggers. Inert under the current full-re-import update path, but
-- correct, and they are what will keep the index consistent when the nightly
-- sync starts pushing deltas instead of re-importing everything.

DROP TRIGGER IF EXISTS inquiry_fts_ai;
DROP TRIGGER IF EXISTS inquiry_fts_ad;
DROP TRIGGER IF EXISTS inquiry_fts_au;

CREATE TRIGGER inquiry_fts_ai AFTER INSERT ON inquiry BEGIN
  INSERT INTO inquiry_fts(
    rowid, title, issue_summary, suggested_action, resolution,
    inquiry_type, area_of_vehicle, vehicle_make, vehicle_model, body
  ) VALUES (
    new.db_id, new.title, new.issue_summary, new.suggested_action, new.resolution,
    new.inquiry_type, new.area_of_vehicle, new.vehicle_make, new.vehicle_model, new.body
  );
END;

CREATE TRIGGER inquiry_fts_ad AFTER DELETE ON inquiry BEGIN
  INSERT INTO inquiry_fts(
    inquiry_fts, rowid, title, issue_summary, suggested_action, resolution,
    inquiry_type, area_of_vehicle, vehicle_make, vehicle_model, body
  ) VALUES (
    'delete', old.db_id, old.title, old.issue_summary, old.suggested_action, old.resolution,
    old.inquiry_type, old.area_of_vehicle, old.vehicle_make, old.vehicle_model, old.body
  );
END;

CREATE TRIGGER inquiry_fts_au AFTER UPDATE ON inquiry BEGIN
  INSERT INTO inquiry_fts(
    inquiry_fts, rowid, title, issue_summary, suggested_action, resolution,
    inquiry_type, area_of_vehicle, vehicle_make, vehicle_model, body
  ) VALUES (
    'delete', old.db_id, old.title, old.issue_summary, old.suggested_action, old.resolution,
    old.inquiry_type, old.area_of_vehicle, old.vehicle_make, old.vehicle_model, old.body
  );
  INSERT INTO inquiry_fts(
    rowid, title, issue_summary, suggested_action, resolution,
    inquiry_type, area_of_vehicle, vehicle_make, vehicle_model, body
  ) VALUES (
    new.db_id, new.title, new.issue_summary, new.suggested_action, new.resolution,
    new.inquiry_type, new.area_of_vehicle, new.vehicle_make, new.vehicle_model, new.body
  );
END;
