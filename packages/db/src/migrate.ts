/**
 * Run Drizzle ORM migrations against the database.
 * Usage: pnpm db:migrate
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Migrations folder is at packages/db/drizzle/
// This file compiles to packages/db/dist/migrate.js, so go up one level
const MIGRATIONS_FOLDER = join(__dirname, '..', 'drizzle');

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for migrations');
  }

  console.log('Running database migrations…');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  console.log('✅ Migrations complete');
  await client.end();
}

// Allow running directly: tsx src/migrate.ts
if (process.argv[1] === __filename) {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(DATABASE_URL).catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  });
}
