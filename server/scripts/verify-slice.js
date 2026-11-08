// Checks the Accept vertical slice end to end against the running API and the database:
//   1. POST /api/likes/:id/accept   2. match + chat + participants created in one transaction
//   3. the response contains the new chat   4. after "refresh" (fresh GETs) the request is gone
//   and the chat is first in the list   5. the rows exist in group_matches / chats / chat_participants
// Usage: npm run dev (in another terminal), then npm run verify:slice
// It really accepts a request, so run npm run db:reset afterwards to restore the demo data.
import pg from 'pg';
import '../src/env.js';
import { authHeaders } from './lib/session.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const USER_ID = Number(process.argv[2] ?? 1);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

async function call(path, method = 'GET') {
  const res = await fetch(`${API}${path}`, { method, headers: await authHeaders(USER_ID) });
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const me = await call('/me');
  if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
  const groupId = me.body.activeGroupId;
  const groupName = me.body.groups.find((g) => g.id === groupId).name;
  console.log(`Signed in as ${me.body.user.firstName} ${me.body.user.lastName}, acting as ${groupName}\n`);

  const before = await call(`/groups/${groupId}/incoming-likes`);
  const like = before.body.likes[0];
  if (!like) throw new Error('No pending requests to accept. Run npm run db:reset first.');

  const accept = await call(`/likes/${like.id}/accept`, 'POST');
  check(`POST /api/likes/${like.id}/accept returns 201`, accept.status === 201, `status ${accept.status}`);
  const chat = accept.body.chat;
  check('response contains the new chat', Boolean(chat?.id), chat ? `#${chat.id} "${chat.name}", ${chat.peopleCount} people` : JSON.stringify(accept.body));

  const [likesAfter, chatsAfter] = await Promise.all([
    call(`/groups/${groupId}/incoming-likes`),
    call(`/groups/${groupId}/chats`),
  ]);
  check(`request from ${like.group.name} is gone after refresh`, !likesAfter.body.likes.some((l) => l.id === like.id));
  check('new chat is first in the chat list after refresh', chatsAfter.body.chats[0]?.id === chat?.id);

  await db.connect();
  const { rows: [row] } = await db.query(
    `SELECT m.id AS match_id, m.matched_at, c.id AS chat_id, c.created_at AS chat_created,
            (SELECT count(*)::int FROM chat_participants p WHERE p.chat_id = c.id) AS participants,
            (SELECT count(*)::int FROM group_memberships gm WHERE gm.group_id IN (m.group_low_id, m.group_high_id)) AS members
     FROM chats c JOIN group_matches m ON m.id = c.match_id WHERE c.id = $1`,
    [chat?.id ?? 0],
  );
  check('group_matches and chats rows exist', Boolean(row), row ? `match #${row.match_id}, chat #${row.chat_id}` : '');
  check('every member of both groups is a chat participant', row && row.participants === row.members, row ? `${row.participants} participants` : '');
  check('match and chat were created in the same transaction', row && row.matched_at.getTime() === row.chat_created.getTime());

  const again = await call(`/likes/${like.id}/accept`, 'POST');
  check('accepting twice is rejected', again.status === 409, again.body.error?.code);
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed. Run npm run db:reset to restore the demo data.`);
process.exitCode = passed === results.length ? 0 : 1;
