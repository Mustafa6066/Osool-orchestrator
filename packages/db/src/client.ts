import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | undefined;

function getDb(): DrizzleDB {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        '❌ DATABASE_URL is not set. ' +
        'Add it in Railway → Service → Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}}'
      );
    }
    const queryClient = postgres(connectionString, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(queryClient, { schema });
  }
  return _db;
}

// Lazy proxy — initialisation is deferred until first DB call,
// so a missing DATABASE_URL no longer crashes the process at import time.
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    return getDb()[prop as keyof DrizzleDB];
  },
});

export type Database = DrizzleDB;
