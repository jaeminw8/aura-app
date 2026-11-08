// Creates the demo logins (Supabase Auth accounts) and links them to their seeded users.
// Every account uses DEMO_PASSWORD from server/.env. Safe to re-run: existing accounts are kept.
// Needs "Confirm email" turned off in Supabase (Authentication -> Sign In / Providers -> Email).
import pg from 'pg';
import { DEMO_ACCOUNTS } from './lib/session.js';

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DEMO_PASSWORD } = process.env;
if (!SUPABASE_PUBLISHABLE_KEY || !DEMO_PASSWORD) {
  console.error('Set SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in server/.env (see server/.env.example).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  for (const email of Object.values(DEMO_ACCOUNTS)) {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    });
    const data = await res.json();
    if (res.ok) console.log(`created  ${email}`);
    else if (['user_already_exists', 'email_exists'].includes(data.error_code)) console.log(`exists   ${email}`);
    else throw new Error(`${email}: ${data.msg ?? res.status}`);
  }
  await client.connect();
  const { rowCount } = await client.query(
    `UPDATE users u SET auth_user_id = a.id
     FROM (SELECT key::bigint AS user_id, value AS email FROM json_each_text($1)) d
     JOIN auth.users a ON lower(a.email) = d.email
     WHERE u.id = d.user_id AND u.auth_user_id IS DISTINCT FROM a.id`,
    [JSON.stringify(DEMO_ACCOUNTS)],
  );
  console.log(`Linked ${rowCount} seeded user(s). Sign in with any of these emails and DEMO_PASSWORD.`);
} catch (err) {
  console.error(`Demo accounts failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
