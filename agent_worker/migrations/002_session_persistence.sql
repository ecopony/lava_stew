-- ABOUTME: Persists the SDK session id per conversation and mirrors session transcripts
-- ABOUTME: Lets agent sessions resume after a worker restart via the SDK sessionStore adapter

-- The SDK session a conversation last used, so resume survives a worker restart.
-- (sessionStore mirrors transcript content by sessionId but does not know our
-- conversationId, so the mapping is persisted here.)
ALTER TABLE conversations ADD COLUMN session_id TEXT;

-- Transcript entries mirrored by the Postgres sessionStore adapter.
-- Keyed by (project_key, session_id, subpath); subpath '' is the main transcript.
CREATE TABLE session_entries (
  id BIGSERIAL PRIMARY KEY,
  project_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  subpath TEXT NOT NULL DEFAULT '',
  entry_uuid TEXT,
  entry JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Idempotency: entries carrying a uuid are deduped on retry / import replay.
CREATE UNIQUE INDEX idx_session_entries_uuid
  ON session_entries(project_key, session_id, subpath, entry_uuid)
  WHERE entry_uuid IS NOT NULL;

-- Ordered load of a session's transcript.
CREATE INDEX idx_session_entries_load
  ON session_entries(project_key, session_id, subpath, id);

-- listSessions: most-recent activity per session within a project.
CREATE INDEX idx_session_entries_project
  ON session_entries(project_key, created_at DESC);
