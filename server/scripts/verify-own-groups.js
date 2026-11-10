// Checks that a person never sees their own groups as something to match with:
//   1. Find never recommends a group the person is in
//   2. "Groups that liked you" hides a request that came from another group the person is in
//   3. other members of the group (who aren't in both groups) still see that request
//   4. accepting it anyway is rejected with 400 OWN_GROUP
// Usage: npm run dev (in another terminal), then npm run verify:own-groups
// If no such request exists yet it adds one and removes it at the end, so the data is left as it was.
import pg from 'pg';
import '../src/env.js';
import { authHeaders } from './lib/session.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};
async function call(userId, path, method = 'GET') {
  const res = await fetch(`${API}${path}`, { method, headers: await authHeaders(userId) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let addedLikeId = null;

try {
  await db.connect();
  // Someone (U) whose active group is A and who is also in group B, plus a member of B who isn't in A
  // (V, who can send the request) and a member of A who isn't in B (W, who should still see it).
  const { rows: [setup] } = await db.query(`
    SELECT u.id AS u, u.first_name, u.active_group_id AS a, b.group_id AS b, ga.name AS a_name, gb.name AS b_name,
           (SELECT gm.user_id FROM group_memberships gm WHERE gm.group_id = b.group_id
              AND NOT EXISTS (SELECT 1 FROM group_memberships x WHERE x.group_id = u.active_group_id AND x.user_id = gm.user_id)
            ORDER BY gm.user_id LIMIT 1) AS v,
           (SELECT w.id FROM users w JOIN group_memberships gm ON gm.user_id = w.id AND gm.group_id = u.active_group_id
            WHERE w.active_group_id = u.active_group_id
              AND NOT EXISTS (SELECT 1 FROM group_memberships x WHERE x.group_id = b.group_id AND x.user_id = w.id)
              AND w.id <= 16
            ORDER BY w.id LIMIT 1) AS w
    FROM users u
    JOIN group_memberships b ON b.user_id = u.id AND b.group_id <> u.active_group_id
    JOIN friend_groups ga ON ga.id = u.active_group_id
    JOIN friend_groups gb ON gb.id = b.group_id
    WHERE NOT EXISTS (SELECT 1 FROM group_matches mt
                      WHERE mt.group_low_id = LEAST(u.active_group_id, b.group_id)
                        AND mt.group_high_id = GREATEST(u.active_group_id, b.group_id))
      AND NOT EXISTS (SELECT 1 FROM group_likes r WHERE r.from_group_id = u.active_group_id AND r.to_group_id = b.group_id)
      AND u.id <= 16
    ORDER BY u.id LIMIT 1`);
  if (!setup?.v || !setup?.w) throw new Error('No one is in two unmatched groups with the right members. Run npm run db:reset first.');
  console.log(`${setup.first_name} (#${setup.u}) is in ${setup.a_name} (active) and ${setup.b_name}\n`);

  const { rows: [existing] } = await db.query(
    `SELECT id FROM group_likes WHERE from_group_id = $1 AND to_group_id = $2 AND decision = 'connect'`,
    [setup.b, setup.a],
  );
  let likeId = existing ? Number(existing.id) : null;
  if (!likeId) {
    const { rows: [added] } = await db.query(
      `INSERT INTO group_likes (from_group_id, to_group_id, liked_by_user_id, decision)
       VALUES ($1, $2, $3, 'connect') RETURNING id`,
      [setup.b, setup.a, setup.v],
    );
    likeId = addedLikeId = Number(added.id);
  }

  const recs = await call(setup.u, `/recommendations?groupId=${setup.a}`);
  check(`Find doesn't recommend ${setup.b_name} to ${setup.first_name}`, recs.status === 200 && !recs.body.recommendations.some((g) => g.id === setup.b));

  const mine = await call(setup.u, `/groups/${setup.a}/incoming-likes`);
  check(`${setup.first_name}'s "Groups that liked you" hides the request from ${setup.b_name}`,
    mine.status === 200 && !mine.body.likes.some((l) => l.id === likeId));

  const theirs = await call(setup.w, `/groups/${setup.a}/incoming-likes`);
  check(`a member of ${setup.a_name} who isn't in ${setup.b_name} (#${setup.w}) still sees it`,
    theirs.status === 200 && theirs.body.likes.some((l) => l.id === likeId));

  const accept = await call(setup.u, `/likes/${likeId}/accept`, 'POST');
  check(`${setup.first_name} accepting it anyway is rejected`, accept.status === 400 && accept.body?.error?.code === 'OWN_GROUP',
    `${accept.status} ${accept.body?.error?.code}`);
} catch (err) {
  check(err.message, false);
} finally {
  if (addedLikeId) await db.query('DELETE FROM group_likes WHERE id = $1', [addedLikeId]).catch(() => {});
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed.${addedLikeId ? ' The test request was removed again.' : ''}`);
process.exitCode = passed === results.length ? 0 : 1;
