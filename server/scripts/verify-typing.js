// Checks the typing indicator end to end against the running API and the database:
//   1. someone from the other group pings POST /api/chats/:id/typing   2. your next poll lists them,
//   with time left, and the database has their typing_at   3. you never see yourself   4. DELETE clears it
//   5. sending a message clears it   6. it runs out about 5 seconds after the last ping
//   7. people outside the chat are rejected (403 NOT_IN_CHAT, 404 CHAT_NOT_FOUND)
// Usage: npm run dev (in another terminal), then npm run verify:typing
// It posts one real message and marks the chat read for two people, so run npm run db:reset afterwards
// to restore the demo data (check with the team first on the shared database). It takes about 6 seconds.
import pg from 'pg';
import '../src/env.js';
import { authHeaders, DEMO_ACCOUNTS } from './lib/session.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const USER_ID = Number(process.argv[2] ?? 1);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

async function call(path, { method = 'GET', body, as = USER_ID } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(await authHeaders(as)), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const typingAt = async (chatId, userId) => (await db.query(
  'SELECT typing_at FROM chat_participants WHERE chat_id = $1 AND user_id = $2', [chatId, userId],
)).rows[0]?.typing_at ?? null;

try {
  const me = await call('/me');
  if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
  const chat = (await call(`/groups/${me.body.activeGroupId}/chats`)).body.chats?.at(-1);
  if (!chat) throw new Error('That group has no chats. Run npm run db:reset first.');
  const opened = await call(`/chats/${chat.id}/messages`);
  const other = opened.body.participants.find((p) => p.groupId === chat.otherGroup.id && DEMO_ACCOUNTS[p.id]);
  if (!other) throw new Error(`Nobody from ${chat.otherGroup.name} in chat #${chat.id} has a demo login (README "Demo accounts").`);
  const after = Math.max(0, ...opened.body.messages.map((m) => m.id));
  const poll = async (as = USER_ID) => (await call(`/chats/${chat.id}/messages?after=${after}`, { as })).body;
  await db.connect();
  console.log(`Chat #${chat.id} "${chat.name}"; ${other.firstName} ${other.lastName} types for ${chat.otherGroup.name}\n`);

  const ping = await call(`/chats/${chat.id}/typing`, { method: 'POST', as: other.id });
  check(`${other.firstName} pings POST /api/chats/${chat.id}/typing (204)`, ping.status === 204, `status ${ping.status}`);
  const seen = (await poll()).typing?.find((t) => t.user.id === other.id);
  check(`your next poll lists ${other.firstName} as typing, with time left`, seen && seen.msLeft > 0 && seen.msLeft <= 5000, `msLeft ${seen?.msLeft}`);
  check('the database has their typing_at', (await typingAt(chat.id, other.id)) !== null);

  await call(`/chats/${chat.id}/typing`, { method: 'POST' });
  check('you never see yourself typing', !(await poll()).typing?.some((t) => t.user.id === USER_ID));
  check(`${other.firstName} sees you typing`, (await poll(other.id)).typing?.some((t) => t.user.id === USER_ID));
  await call(`/chats/${chat.id}/typing`, { method: 'DELETE' });

  const cleared = await call(`/chats/${chat.id}/typing`, { method: 'DELETE', as: other.id });
  check(`DELETE clears it (204, gone from the poll, typing_at is NULL)`,
    cleared.status === 204 && !(await poll()).typing?.some((t) => t.user.id === other.id) && (await typingAt(chat.id, other.id)) === null);

  await call(`/chats/${chat.id}/typing`, { method: 'POST', as: other.id });
  const sent = await call(`/chats/${chat.id}/messages`, { method: 'POST', as: other.id, body: { body: `verify:typing ${new Date().toISOString()}` } });
  const afterSend = await poll();
  check(`sending a message clears it (the poll has the message, not ${other.firstName} typing)`,
    sent.status === 201 && afterSend.messages.some((m) => m.id === sent.body.message.id) && !afterSend.typing?.some((t) => t.user.id === other.id)
      && (await typingAt(chat.id, other.id)) === null);

  await call(`/chats/${chat.id}/typing`, { method: 'POST', as: other.id });
  await new Promise((resolve) => { setTimeout(resolve, 5500); });
  check('without another ping it runs out after about 5 seconds', !(await poll()).typing?.some((t) => t.user.id === other.id));

  const { rows: [outsider] } = await db.query(
    'SELECT id::int FROM users WHERE id NOT IN (SELECT user_id FROM chat_participants WHERE chat_id = $1) ORDER BY id LIMIT 1', [chat.id],
  );
  if (outsider) {
    const res = await call(`/chats/${chat.id}/typing`, { method: 'POST', as: outsider.id });
    check('someone outside the chat gets 403 NOT_IN_CHAT', res.status === 403 && res.body?.error?.code === 'NOT_IN_CHAT', res.body?.error?.code);
  }
  const missing = await call('/chats/999999999/typing', { method: 'POST' });
  check('a chat that does not exist gets 404 CHAT_NOT_FOUND', missing.status === 404 && missing.body?.error?.code === 'CHAT_NOT_FOUND', missing.body?.error?.code);
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed. Run npm run db:reset to restore the demo data (check with the team first).`);
process.exitCode = passed === results.length ? 0 : 1;
