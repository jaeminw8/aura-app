// Signs scripts in as a demo account (README "Demo accounts") and returns request headers.
// Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD in server/.env.
import '../../src/env.js';

// Seeded user id -> demo login. db/seed.sql and db/migrations/003 link the same emails.
export const DEMO_ACCOUNTS = {
  1: 'avery@example.com', // Tuesday Crew
  2: 'ben@example.com', // Tuesday Crew
  7: 'maya@example.com', // Sunday Summit Club
  16: 'zoe@example.com', // Wednesday Volleyball
};

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
