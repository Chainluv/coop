const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.COOP_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.COOP_DB || path.join(DATA_DIR, 'coop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('East', 'West')),
  bio TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '[]',
  roles TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  open_to_collab INTEGER NOT NULL DEFAULT 1,
  seeking TEXT NOT NULL DEFAULT '',
  seeking_at TEXT,
  photo_url TEXT,
  avatar_style INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- A track is a collaboration submission between two artists.
-- It only counts toward rankings once the partner confirms it.
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  submitter_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  pair_lo INTEGER NOT NULL,
  pair_hi INTEGER NOT NULL,
  link_url TEXT,
  audio_url TEXT,
  artwork_url TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  responded_at TEXT,
  CHECK (submitter_id <> partner_id),
  CHECK (pair_lo < pair_hi)
);
-- The same pair can't log the same song twice (declined submissions don't block a retry).
CREATE UNIQUE INDEX IF NOT EXISTS tracks_no_dupes ON tracks(pair_lo, pair_hi, title_key) WHERE status <> 'declined';
CREATE INDEX IF NOT EXISTS tracks_by_status ON tracks(status, responded_at);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  pair_lo INTEGER NOT NULL,
  pair_hi INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  CHECK (from_id <> to_id)
);
-- Only one open request between any two artists at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_request ON requests(pair_lo, pair_hi) WHERE status = 'pending';
`);

function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, tx, DATA_DIR };
