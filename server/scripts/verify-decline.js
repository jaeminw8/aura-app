// Checks the Decline vertical slice end to end against the running API and database:
//   1. POST /api/likes/:id/decline
//   2. after "refresh" the incoming request is gone
//   3. the declined group is excluded from recommendations
//   4. the pass row exists in group_likes
//   5. declining the same request twice is rejected
// Usage: npm run dev (in another terminal), then npm run verify:decline
// It really declines a request, so run npm run db:reset afterwards to restore demo data.
import pg from 'pg';
import '../src/env.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const USER_ID = Number(process.argv[2] ?? 1);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

async function call(path, method = 'GET') {
  const res = await fetch(`${API}${path}`, { method, headers: { 'X-User-Id': String(USER_ID) } });
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const me = await call('/me');
  if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
  const groupId = me.body.activeGroupId;
  const before = await call(`/groups/${groupId}/incoming-likes`);
  const like = before.body.likes[0];
  if (!like) throw new Error('No pending requests to decline. Run npm run db:reset first.');

  await db.connect();
  const { rows: [source] } = await db.query(
    'SELECT from_group_id FROM group_likes WHERE id = $1',
    [like.id],
  );
  if (!source) throw new Error(`Could not find group_likes row for request #${like.id}.`);

  const decline = await call(`/likes/${like.id}/decline`, 'POST');
  check(`POST /api/likes/${like.id}/decline returns 200`, decline.status === 200, `status ${decline.status}`);

  const [likesAfter, recommendations] = await Promise.all([
    call(`/groups/${groupId}/incoming-likes`),
    call(`/recommendations?groupId=${groupId}`),
  ]);
  check(`request #${like.id} is gone after refresh`, !likesAfter.body.likes.some((l) => l.id === like.id));
  check(`declined group #${source.from_group_id} is not recommended`,
    !recommendations.body.recommendations.some((g) => g.id === source.from_group_id));

  const { rows: [row] } = await db.query(
    'SELECT decision FROM group_likes WHERE id = $1',
    [like.id],
  );
  check('group_likes stores the decline decision', row?.decision === 'pass', row?.decision);

  const again = await call(`/likes/${like.id}/decline`, 'POST');
  check('declining twice is rejected', again.status === 409, again.body.error?.code);
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed. Run npm run db:reset to restore the demo data.`);
process.exitCode = passed === results.length ? 0 : 1;
