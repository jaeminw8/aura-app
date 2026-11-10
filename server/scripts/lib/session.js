// Signs scripts in as a demo account (README "Demo accounts") and returns request headers.
// Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in server/.env.
import '../../src/env.js';

// Seeded user id -> demo login (every seeded user has one). npm run db:demo-accounts creates and links them.
const FIRST_NAMES = ['avery', 'ben', 'chloe', 'diego', 'emma', 'finn', 'maya', 'theo',
  'priya', 'sam', 'jordan', 'lena', 'grace', 'eli', 'noah', 'zoe'];
export const DEMO_ACCOUNTS = Object.fromEntries(FIRST_NAMES.map((name, i) => [i + 1, `${name}@example.com`]));

const cache = new Map();

export async function authHeaders(userId) {
  const email = DEMO_ACCOUNTS[userId];
  if (!email) {
    throw new Error(`User #${userId} has no demo login. Use one of: ${Object.keys(DEMO_ACCOUNTS).join(', ')}.`);
  }
  if (!cache.has(userId)) {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DEMO_PASSWORD } = process.env;
    if (!SUPABASE_PUBLISHABLE_KEY || !DEMO_PASSWORD) {
      throw new Error('Set SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in server/.env (see server/.env.example).');
    }
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Couldn't sign in as ${email}: ${data.msg ?? data.error_description ?? res.status}. Run npm run db:demo-accounts first.`);
    cache.set(userId, data.access_token);
  }
  return { Authorization: `Bearer ${cache.get(userId)}` };
}
