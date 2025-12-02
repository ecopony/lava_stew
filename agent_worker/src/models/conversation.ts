// ABOUTME: Database model for conversations
// ABOUTME: Handles conversation lifecycle and message tracking

import { getPool } from "../database.js";

export interface Conversation {
  id: string; // UUID
  session_key: string; // The key used for API requests and session tracking
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string; // UUID
  conversation_id: string; // UUID
  role: "user" | "assistant";
  content: string;
  created_at: Date;
  sequence_number: number;
}

export async function ensureConversation(
  sessionKey: string
): Promise<Conversation> {
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO conversations (session_key)
     VALUES ($1)
     ON CONFLICT (session_key) DO UPDATE SET updated_at = NOW()
     RETURNING id, session_key, created_at, updated_at`,
    [sessionKey]
  );

  return result.rows[0];
}

export async function createMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<Message> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the conversation row to prevent concurrent sequence number conflicts
    await client.query(
      "SELECT id FROM conversations WHERE id = $1 FOR UPDATE",
      [conversationId]
    );

    // Get next sequence number and insert message atomically
    const result = await client.query(
      `INSERT INTO messages (conversation_id, role, sequence_number, content)
       VALUES ($1, $2,
         (SELECT COALESCE(MAX(sequence_number), -1) + 1
          FROM messages
          WHERE conversation_id = $1),
         $3)
       RETURNING id, conversation_id, role, content, created_at, sequence_number`,
      [conversationId, role, content]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
