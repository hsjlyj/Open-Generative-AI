PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  credits INTEGER NOT NULL DEFAULT 50 CHECK (credits >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS model_prices;
CREATE TABLE IF NOT EXISTS model_prices (
  model TEXT NOT NULL,
  resolution TEXT NOT NULL,
  credits_per_second INTEGER NOT NULL CHECK (credits_per_second >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (model, resolution)
);

-- Pricing matrix: prices are in credits per second; 1 credit = 0.1 CNY.
-- Resolution defaults only cover 480p and 720p; other resolutions must be set
-- by an admin before users can submit (reserve will reject unpriced combos).
INSERT OR IGNORE INTO model_prices (model, resolution, credits_per_second) VALUES
  ('cheap-seedance-2.0',       '480p', 4),
  ('cheap-seedance-2.0',       '720p', 8),
  ('cheap-seedance-2.0-fast',  '480p', 3),
  ('cheap-seedance-2.0-fast',  '720p', 6),
  ('doubao-seedance-2.0-mini',  '480p', 2),
  ('doubao-seedance-2.0-mini',  '720p', 3);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_task_id TEXT UNIQUE,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  resolution TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  audio INTEGER NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  credits_reserved INTEGER NOT NULL CHECK (credits_reserved >= 0),
  credits_refunded INTEGER NOT NULL DEFAULT 0 CHECK (credits_refunded IN (0, 1)),
  result_url TEXT,
  storage_key TEXT,
  thumbnail_url TEXT,
  fail_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS tasks_user_created_idx ON tasks(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
