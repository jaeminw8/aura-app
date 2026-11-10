// Creates the demo logins (Supabase Auth accounts) and links them to their seeded users.
// Every account uses DEMO_PASSWORD from server/.env. Safe to re-run (also after db:reset, which unlinks them).
// Needs "Confirm email" turned off in Supabase (Authentication -> Sign In / Providers -> Email).
// The app's database login can't read auth.users, so each account's id comes from Supabase Auth itself.
import pg from 'pg';
import { DEMO_ACCOUNTS } from './lib/session.js';

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DEMO_PASSWORD } = process.env;
if (!SUPABASE_PUBLISHABLE_KEY || !DEMO_PASSWORD) {
  console.error('Set SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in server/.env (see server/.env.example).');
  process.exit(1);
}
const AUTH = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

async function authCall(path, body) {
  const res = await fetch(`${AUTH}${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

// Returns the account's auth user id, creating the account if it doesn't exist yet.
async function ensureAccount(email) {
  const signup = await authCall('/signup', { email, password: DEMO_PASSWORD });
  if (signup.ok && signup.data.user?.id) {
    console.log(`created  ${email}`);
    return signup.data.user.id;
  }
  if (signup.ok || ['user_already_exists', 'email_exists'].includes(signup.data.error_code)) {
    const signin = await authCall('/token?grant_type=password', { email, password: DEMO_PASSWORD });
    if (!signin.ok) {
      throw new Error(`${email} exists but DEMO_PASSWORD doesn't sign in (${signin.data.msg ?? signin.status}). Use the team's demo password.`);
    }
    console.log(`exists   ${email}`);
    return signin.data.user.id;
  }
  throw new Error(`${email}: ${signup.data.msg ?? signup.status}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  const links = [];
  for (const [userId, email] of Object.entries(DEMO_ACCOUNTS)) links.push([Number(userId), await ensureAccount(email)]);
  await client.connect();
  await client.query('BEGIN');
  for (const [userId, authId] of links) {
    await client.query('UPDATE users SET auth_user_id = NULL WHERE auth_user_id = $1 AND id <> $2', [authId, userId]);
    await client.query('UPDATE users SET auth_user_id = $1 WHERE id = $2', [authId, userId]);
  }
  await client.query('COMMIT');
  console.log(`Linked ${links.length} seeded user(s). Sign in with any of these emails and DEMO_PASSWORD.`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Demo accounts failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
