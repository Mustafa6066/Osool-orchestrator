#!/usr/bin/env tsx
/**
 * Create Admin User Script
 * Usage: npx tsx scripts/create-admin.ts <email> <password>
 *
 * Creates or updates a user in the DB with the admin role and hashed password.
 * The user can then log in at /admin with the given credentials.
 */
import { createHash, randomBytes } from 'node:crypto';
import { config } from 'dotenv';

// Load .env before importing db (which reads DATABASE_URL)
config();

import { db } from '@osool/db';
import { users } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

async function main() {
  const hash = await bcrypt.hash(password, 12);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        passwordHash: hash,
        role: 'admin',
        updatedAt: new Date(),
      } as any)
      .where(eq(users.email, email));
    console.log(`✓ Admin user updated: ${email}`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash: hash,
      role: 'admin',
      name: 'Admin',
    } as any);
    console.log(`✓ Admin user created: ${email}`);
  }

  console.log('\nYou can now log in at http://localhost:5173/login');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error creating admin user:', err);
  process.exit(1);
});
