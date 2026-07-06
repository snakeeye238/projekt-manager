PRAGMA defer_foreign_keys = ON;

ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_iterations INTEGER;

ALTER TABLE sessions RENAME TO sessions_legacy;
DROP TABLE sessions_legacy;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

ALTER TABLE user_states RENAME TO user_state;
ALTER TABLE user_state RENAME COLUMN data TO payload;
ALTER TABLE user_state ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
