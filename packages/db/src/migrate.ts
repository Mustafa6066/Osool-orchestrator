/**
 * Run Drizzle ORM migrations against the database.
 * Usage: pnpm db:migrate
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function runMigrations() {
  console.log('Running database migrations…');

  const client = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: './drizzle' });

  console.log('✅ Migrations complete');
  await client.end();
}

runMigrations().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
