// Checks live chat updates end to end against the running API and the database:
//   1. someone from the other group posts in your least recently active chat   2. GET ?after=<last id>
//   returns just that message   3. polling again returns nothing new   4. the chat moves to the top
//   of the list with the new preview and 0 unread   5. the messages row exists and the chat was
//   marked read   6. a bad ?after is rejected
// Usage: npm run dev (in another terminal), then npm run verify:chat
// It really posts a message (left as that chat's newest preview) and marks the chat read, so run
// npm run db:reset afterwards to restore the demo data.
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
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const me = await call('/me');
  if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
  const groupId = me.body.activeGroupId;
  const groupName = me.body.groups.find((g) => g.id === groupId).name;
  console.log(`Signed in as ${me.body.user.firstName} ${me.body.user.lastName}, acting as ${groupName}`);

  const list = (await call(`/groups/${groupId}/chats`)).body.chats ?? [];
  const chat = list.at(-1); // least recently active, so the new message has to move it to the top
  if (!chat) throw new Error(`${groupName} has no chats. Run npm run db:reset first.`);
  const opened = await call(`/chats/${chat.id}/messages`);
  const lastId = Math.max(0, ...opened.body.messages.map((m) => m.id));
  const other = opened.body.participants.find((p) => p.groupId === chat.otherGroup.id && DEMO_ACCOUNTS[p.id]);
  if (!other) throw new Error(`Nobody from ${chat.otherGroup.name} in chat #${chat.id} has a demo login (README "Demo accounts").`);
  console.log(`Chat #${chat.id} "${chat.name}", newest message #${lastId}; ${other.firstName} ${other.lastName} posts for ${chat.otherGroup.name}\n`);

  const text = `verify:chat ${new Date().toISOString()}`;
  const sent = await call(`/chats/${chat.id}/messages`, { method: 'POST', body: { body: text }, as: other.id });
  check(`${other.firstName} posts with POST /api/chats/${chat.id}/messages (201)`, sent.status === 201, `status ${sent.status}`);
  const newId = sent.body.message?.id;

  const poll = await call(`/chats/${chat.id}/messages?after=${lastId}`);
  const got = poll.body.messages ?? [];
  check(`?after=${lastId} returns exactly the new message`, got.length === 1 && got[0].id === newId && got[0].body === text, `${got.length} message(s)`);
  check('it is not marked mine and hasMore is false', got[0]?.mine === false && poll.body.hasMore === false);

  const again = await call(`/chats/${chat.id}/messages?after=${newId}`);
  check(`?after=${newId} returns nothing (no repeats)`, again.status === 200 && again.body.messages?.length === 0, `${again.body.messages?.length} message(s)`);

  const listAfter = await call(`/groups/${groupId}/chats`);
  const top = listAfter.body.chats?.[0];
  check(
    list.length > 1
      ? `chat moved from position ${list.length} to the top of the list with the new preview`
      : 'chat is first in the list with the new preview (its only chat, so no re-sort to see; Accept a request first)',
    top?.id === chat.id && top.lastMessage?.body === text,
    top ? `"${top.lastMessage?.body}"` : '',
  );
  check('chat shows 0 unread after the poll read it', top?.unreadCount === 0, `unreadCount ${top?.unreadCount}`);

  await db.connect();
  const { rows: [row] } = await db.query(
    `SELECT m.chat_id::int, m.sender_user_id::int, m.body, cp.last_read_at >= m.created_at AS marked_read
     FROM messages m
     LEFT JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = $2
     WHERE m.id = $1`,
    [newId ?? 0, USER_ID],
  );
  check(
    'messages row exists with the right chat, sender and body',
    row && row.chat_id === chat.id && row.sender_user_id === other.id && row.body === text,
    row ? `message #${newId}` : '',
  );
  check(`user #${USER_ID}'s last_read_at is at or after the message's created_at`, row?.marked_read === true);

  const bad = await call(`/chats/${chat.id}/messages?after=abc`);
  check('?after=abc is rejected with 400 INVALID_ID', bad.status === 400 && bad.body.error?.code === 'INVALID_ID', bad.body.error?.code);
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed. Run npm run db:reset to restore the demo data.`);
process.exitCode = passed === results.length ? 0 : 1;
