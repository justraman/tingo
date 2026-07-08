-- D1 schema for the Tambola game index.
-- Amounts are stored as decimal strings: they are 18-decimal wei values that
-- overflow SQLite's 64-bit integers.
CREATE TABLE IF NOT EXISTS games (
  game_id            INTEGER PRIMARY KEY,
  host               TEXT    NOT NULL,
  ticket_price       TEXT    NOT NULL,
  start_time         INTEGER NOT NULL,           -- unix seconds
  last_draw_time     INTEGER NOT NULL,           -- unix seconds; 0 until first draw
  ticket_count       INTEGER NOT NULL,
  pot                TEXT    NOT NULL,
  state              INTEGER NOT NULL,           -- 0=Pending 1=Live 2=Won 3=NoWinner
  top_line_winner    TEXT,
  middle_line_winner TEXT,
  bottom_line_winner TEXT,
  fullhouse_winner   TEXT,
  drawn_numbers      TEXT    NOT NULL DEFAULT '[]',  -- JSON array in draw order
  indexed_at         INTEGER NOT NULL            -- unix seconds of the snapshot
);

CREATE INDEX IF NOT EXISTS idx_games_state ON games (state);

-- Chat milestones already published to a game's statement-store room, so a
-- cron invocation announces each one exactly once.
CREATE TABLE IF NOT EXISTS announcements (
  game_id      INTEGER NOT NULL,
  kind         TEXT    NOT NULL,   -- welcome | won | no-winner
  announced_at INTEGER NOT NULL,   -- unix seconds
  PRIMARY KEY (game_id, kind)
);
