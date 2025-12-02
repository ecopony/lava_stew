// ABOUTME: Database connection configuration and pool management
// ABOUTME: Provides PostgreSQL connection pool with error handling and graceful shutdown

import pg from "pg";

const { Pool } = pg;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "lava_stew",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
  };
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());

    pool.on("error", (err: Error) => {
      console.error("Unexpected database error:", err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Register signal handlers for graceful shutdown
function setupSignalHandlers() {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, closing database connection...`);
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Auto-setup signal handlers when this module is imported
setupSignalHandlers();
