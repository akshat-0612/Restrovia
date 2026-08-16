/**
 * Checks a database connection string before you paste it into a host.
 *
 * A wrong string fails several minutes into a deploy, with an error that doesn't
 * say which part was wrong. This says so in seconds:
 *
 *   DATABASE_URL="<the string you're about to use>" npm run check:db -w server
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  ✗ DATABASE_URL is not set.\n');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error('\n  ✗ That is not a valid URL. It should start with postgresql://\n');
  process.exit(1);
}

const params = parsed.searchParams;
const host = parsed.hostname;
const notes = [];
const warn = (m) => notes.push(['warn', m]);
const good = (m) => notes.push(['good', m]);

console.log(`\n  Host     ${host}`);
console.log(`  Database ${parsed.pathname.replace('/', '') || '(none)'}`);

// Neon's pooled endpoint is the one that survives more than a handful of users.
if (host.includes('neon.tech')) {
  if (host.includes('-pooler')) good('Pooled endpoint — correct for this app');
  else warn('No "-pooler" in the host. This is the DIRECT string; switch the toggle in Neon.');
}

if (params.get('pgbouncer') === 'true') good('pgbouncer=true');
else warn('Missing pgbouncer=true — add it, or connections will run out under load.');

if (params.get('connection_limit') === '1') good('connection_limit=1');
else warn('Missing connection_limit=1 — add it alongside pgbouncer=true.');

if (params.get('sslmode')) good(`sslmode=${params.get('sslmode')}`);
else warn('No sslmode. Add sslmode=require for a hosted database.');

if (params.get('channel_binding') === 'require') {
  notes.push(['info', 'channel_binding=require is set. If the connection below fails on ' +
                      'authentication, remove it — sslmode already encrypts the connection.']);
}

for (const [kind, message] of notes) {
  console.log(`  ${kind === 'good' ? '✓' : kind === 'warn' ? '!' : 'i'} ${message}`);
}

// The parameters can all look right and the string still not work, so actually connect.
const prisma = new PrismaClient();
try {
  const started = Date.now();
  const [{ version }] = await prisma.$queryRaw`SELECT version()`;
  const ms = Date.now() - started;

  console.log(`\n  ✓ Connected in ${ms}ms`);
  console.log(`    ${version.split(',')[0]}`);

  // The API will make several of these back to back per order, so a slow link here
  // is a slow checkout there.
  if (ms > 400) {
    console.log(`\n  ! ${ms}ms is slow. If your API is in a different region from the`);
    console.log('    database, move one of them so they match.');
  }

  const tables = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'
  `;
  console.log(`    ${tables[0].n} tables present${tables[0].n === 0 ? ' — run the migrations next' : ''}`);
  console.log('');
} catch (error) {
  const message = error.message.replace(/\s+/g, ' ');
  console.error('\n  ✗ Could not connect.');
  if (/channel binding/i.test(message)) {
    console.error('    Remove &channel_binding=require from the string and try again.');
  } else if (/password|authentication/i.test(message)) {
    console.error('    The username or password is wrong — re-copy the string from Neon.');
  } else if (/does not exist/i.test(message)) {
    console.error('    That database name does not exist on the server.');
  } else {
    console.error(`    ${message.slice(0, 200)}`);
  }
  console.error('');
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
