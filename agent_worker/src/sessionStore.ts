// ABOUTME: Postgres-backed SessionStore adapter for the Agent SDK.
// ABOUTME: Mirrors session transcripts so a session can resume from the database after a worker restart.

import type pg from "pg";
import type {
  SessionStore,
  SessionKey,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: pg.Pool) {}

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    const subpath = key.subpath ?? "";
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const entry of entries) {
        const uuid = typeof entry.uuid === "string" ? entry.uuid : null;

        if (uuid) {
          // Entries with a uuid are idempotent: ignore retries / import replays
          await client.query(
            `INSERT INTO session_entries (project_key, session_id, subpath, entry_uuid, entry)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (project_key, session_id, subpath, entry_uuid)
               WHERE entry_uuid IS NOT NULL
             DO NOTHING`,
            [key.projectKey, key.sessionId, subpath, uuid, JSON.stringify(entry)]
          );
        } else {
          await client.query(
            `INSERT INTO session_entries (project_key, session_id, subpath, entry)
             VALUES ($1, $2, $3, $4)`,
            [key.projectKey, key.sessionId, subpath, JSON.stringify(entry)]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    const subpath = key.subpath ?? "";
    const result = await this.pool.query(
      `SELECT entry FROM session_entries
       WHERE project_key = $1 AND session_id = $2 AND subpath = $3
       ORDER BY id ASC`,
      [key.projectKey, key.sessionId, subpath]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows.map((row) => row.entry as SessionStoreEntry);
  }

  async listSessions(
    projectKey: string
  ): Promise<Array<{ sessionId: string; mtime: number }>> {
    const result = await this.pool.query(
      `SELECT session_id, MAX(created_at) AS mtime
       FROM session_entries
       WHERE project_key = $1
       GROUP BY session_id`,
      [projectKey]
    );

    return result.rows.map((row) => ({
      sessionId: row.session_id as string,
      mtime: new Date(row.mtime as string).getTime(),
    }));
  }

  async listSubkeys(key: {
    projectKey: string;
    sessionId: string;
  }): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT subpath FROM session_entries
       WHERE project_key = $1 AND session_id = $2 AND subpath <> ''`,
      [key.projectKey, key.sessionId]
    );

    return result.rows.map((row) => row.subpath as string);
  }

  async delete(key: SessionKey): Promise<void> {
    if (key.subpath !== undefined) {
      await this.pool.query(
        `DELETE FROM session_entries
         WHERE project_key = $1 AND session_id = $2 AND subpath = $3`,
        [key.projectKey, key.sessionId, key.subpath]
      );
    } else {
      await this.pool.query(
        `DELETE FROM session_entries
         WHERE project_key = $1 AND session_id = $2`,
        [key.projectKey, key.sessionId]
      );
    }
  }
}
