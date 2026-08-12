-- 0004_meta.sql — the corpus_meta table.
--
-- What the corpus knows about its own currency: the date of its newest record
-- and the date it was last synced from degweb.org. The tools read this and state
-- it in every description and every result, so that a model cannot answer from
-- this corpus without also knowing where it stops. It exists because one did:
-- a ChatGPT session described the corpus as running "through August 12" when the
-- newest record in it was dated July 31.
--
-- Apply order: 0001 → 0002 → 0003 → 0004 (this file) → 0005_meta_data.sql.
--
-- Deliberately independent of the inquiry table. Shipping a corrected date to a
-- live database is then two small statements (0004 + 0005) rather than a 25 MB
-- re-import, and 0001's DROP TABLE inquiry never has to be in the path.
--
-- Key/value rather than typed columns: the set of things a corpus knows about
-- itself will grow, and adding a key to a generated INSERT is a one-line change
-- where adding a column is a migration against live data. Nothing is queried by
-- value, so there is no index to lose.
--
-- No explicit transaction statements. D1 supplies its own and rejects a file
-- that opens one -- wrangler scans the raw text, comments included, so those
-- statements must not be named here either.

DROP TABLE IF EXISTS corpus_meta;

CREATE TABLE corpus_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
