-- Schema for the resident service board. Every statement is idempotent, so this
-- file is safe to run on every cold start and on every deploy.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL UNIQUE,
  apartment     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS posts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('need','offer')),
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  apartment   TEXT NOT NULL,
  price_min   INTEGER,
  price_max   INTEGER,
  price_unit  TEXT NOT NULL DEFAULT 'total',
  schedule    TEXT NOT NULL CHECK (schedule IN ('one_time','recurring')),
  recurrence  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','matched','completed','cancelled')),
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user   ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_taker  ON posts(accepted_by);

CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One thread per pair per post. NULLs are distinct in a unique index, so the
-- post-less case (a plain direct message) needs its own partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_convo_post
  ON conversations(post_id, user_a, user_b) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_convo_direct
  ON conversations(user_a, user_b) WHERE post_id IS NULL;

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_convo  ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, sender_id)
  WHERE read_at IS NULL;

-- Login/signup throttling. Serverless instances don't share memory, so attempts
-- are counted in the database instead.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(ip, at);
