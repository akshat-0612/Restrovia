/**
 * Creates (or resets) the platform-admin account — the vendor login that sits
 * above every restaurant and onboards new ones.
 *
 * A fresh production database has no users at all, so this is the one thing that
 * cannot be done through the portal. Run it once after the first deploy:
 *
 *   DATABASE_URL="<your-production-url>" \
 *   ADMIN_EMAIL="you@yourdomain.com" \
 *   ADMIN_PASSWORD="<a-strong-password>" \
 *   npm run create:admin -w server
 *
 * Re-running with the same email resets that account's password, which is the
 * supported way back in if you lock yourself out.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const name = (process.env.ADMIN_NAME || 'Platform Admin').trim();

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail('Set ADMIN_EMAIL to a valid email address.');
}
if (password.length < 12) {
  // Longer than the 8 required of restaurant staff: this account can read and
  // change every tenant's data.
  fail('Set ADMIN_PASSWORD to at least 12 characters — this account sees every restaurant.');
}
if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL is not set. Point it at the database you want to create the account in.');
}

const target = new URL(process.env.DATABASE_URL.replace(/^postgres(ql)?:\/\//, 'https://'));
console.log(`\n  Database : ${target.hostname}${target.pathname}`);
console.log(`  Email    : ${email}`);

try {
  const existing = await prisma.user.findFirst({ where: { email, restaurantId: null } });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name, isActive: true, role: 'PLATFORM_ADMIN' },
    });
    console.log('\n  ✓ Existing platform admin updated — password reset.\n');
  } else {
    await prisma.user.create({
      data: { email, name, passwordHash, role: 'PLATFORM_ADMIN' },
    });
    console.log('\n  ✓ Platform admin created. Sign in to the admin portal with it.\n');
  }
} catch (error) {
  fail(`Could not reach the database: ${error.message}`);
} finally {
  await prisma.$disconnect();
}
