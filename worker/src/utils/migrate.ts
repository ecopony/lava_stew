// ABOUTME: Database migration runner for applying SQL schema changes
// ABOUTME: Tracks applied migrations and runs pending ones in order

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getPool } from '../database.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });

function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runMigrations() {
  const pool = getPool();

  // Create migrations tracking table with checksum validation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Get applied migrations with checksums
  const appliedResult = await pool.query(
    'SELECT filename, checksum FROM migrations ORDER BY id'
  );
  const applied = new Map(appliedResult.rows.map(r => [r.filename, r.checksum]));

  // Read migration files
  // Migrations are always two directories up from utils (works for both src/utils and dist/utils)
  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  // Validate that migration files haven't been modified
  for (const filename of sqlFiles) {
    if (applied.has(filename)) {
      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf-8');
      const currentChecksum = computeChecksum(sql);
      const storedChecksum = applied.get(filename);

      if (currentChecksum !== storedChecksum) {
        throw new Error(
          `Migration ${filename} has been modified after being applied. ` +
          `This is not allowed. Create a new migration instead.`
        );
      }
    }
  }

  // Apply pending migrations
  for (const filename of sqlFiles) {
    if (applied.has(filename)) {
      console.log(`✓ ${filename} (already applied)`);
      continue;
    }

    console.log(`Applying ${filename}...`);
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf-8');
    const checksum = computeChecksum(sql);

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query(
        'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
      await pool.query('COMMIT');
      console.log(`✓ ${filename} applied`);
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error(`✗ ${filename} failed:`, error);
      throw error;
    }
  }

  console.log('All migrations completed');
}

// Run if executed directly (ESM equivalent of require.main === module)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
