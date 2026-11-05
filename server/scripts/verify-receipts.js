// Checks read receipts end to end against the running API and the database:
//   1. you post a message, and no one else's receipt reaches it yet (the UI shows "Delivered")
//   2. someone from the other group opens the chat   3. your next poll shows their receipt on that
//   message   4. your own receipt is never returned   5. their last_read_at really moved past the message
//   6. a member who hasn't opened the chat since joining has no receipt
// Usage: npm run dev (in another terminal), then npm run verify:receipts
// It really posts a message and marks the chat read for two people, so run npm run db:reset afterwards
// to restore the demo data (check with the team first on the shared database).
import pg from 'pg';
import '../src/env.js';

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
    headers: { 'X-User-Id': String(as), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const me = await call('/me');
  if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
  const chat = (await call(`/groups/${me.body.activeGroupId}/chats`)).body.chats?.at(-1);
  if (!chat) throw new Error('That group has no chats. Run npm run db:reset first.');
  const opened = await call(`/chats/${chat.id}/messages`);
  const other = opened.body.participants.find((p) => p.groupId === chat.otherGroup.id);
  if (!other) throw new Error(`Nobody from ${chat.otherGroup.name} is in chat #${chat.id}.`);
  console.log(`Chat #${chat.id} "${chat.name}"; ${other.firstName} ${other.lastName} reads for ${chat.otherGroup.name}\n`);

  const sent = await call(`/chats/${chat.id}/messages`, { method: 'POST', body: { body: `verify:receipts ${new Date().toISOString()}` } });
  check('you post a message (201)', sent.status === 201, `status ${sent.status}`);
  const id = sent.body.message?.id;

  const before = await call(`/chats/${chat.id}/messages?after=${id}`);
  check('no one has read it yet, so the UI shows "Delivered"', before.body.reads?.every((r) => r.messageId < id), `${before.body.reads?.length} receipt(s)`);

  const theirs = await call(`/chats/${chat.id}/messages`, { as: other.id });
  check(`${other.firstName} opens the chat (200)`, theirs.status === 200, `status ${theirs.status}`);

  const after = await call(`/chats/${chat.id}/messages?after=${id}`);
  const receipt = after.body.reads?.find((r) => r.user.id === other.id);
  check(`your next poll shows ${other.firstName} on your message`, receipt?.messageId === id, `message #${receipt?.messageId}`);
  check('the receipt has what the avatar needs', Boolean(receipt?.user.firstName && receipt.user.initials && receipt.user.avatarColor));
  check('your own receipt is not returned', !after.body.reads?.some((r) => r.user.id === USER_ID));

  await db.connect();
  const { rows: [row] } = await db.query(
    `SELECT cp.last_read_at >= m.created_at AS marked_read
     FROM messages m JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = $2
     WHERE m.id = $1`,
    [id, other.id],
  );
  check(`${other.firstName}'s last_read_at is at or after the message's created_at`, row?.marked_read === true);

  const { rows: unopened } = await db.query(
    'SELECT user_id::int FROM chat_participants WHERE chat_id = $1 AND last_read_at = joined_at',
    [chat.id],
  );
  check(
    `${unopened.length} member(s) who haven't opened the chat since joining have no receipt`,
    unopened.every((u) => !after.body.reads.some((r) => r.user.id === u.user_id)),
  );
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed. Run npm run db:reset to restore the demo data (check with the team first).`);
process.exitCode = passed === results.length ? 0 : 1;
