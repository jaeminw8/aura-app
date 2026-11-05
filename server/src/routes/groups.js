import { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { randomPastel } from '../lib/format.js';
import { assertMember, loadGroupCards, loadRelationshipStats } from '../lib/groups.js';
import { requireCompleteProfile } from '../lib/profile.js';
import { parseId, readText } from '../lib/validate.js';

const router = Router();

async function groupCard(groupId, viewer) {
  const [card] = await loadGroupCards(pool, [groupId], viewer);
  if (!card) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  return card;
}

router.post('/groups', async (req, res) => {
  await requireCompleteProfile(pool, req.user.id);
  const name = readText(req.body.name, 'Group name', { max: 60, required: true });
  const statusText = readText(req.body.statusText, 'Status', { max: 80 }) ?? null;
  const city = readText(req.body.city, 'City', { max: 80 }) ?? req.user.city;

  const groupId = await withTransaction(async (client) => {
    const { rows: [group] } = await client.query(
      `INSERT INTO friend_groups (name, city, status_text, avatar_color, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, city, statusText, randomPastel(), req.user.id],
    );
    await client.query(
      `INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [group.id, req.user.id],
    );
    await client.query('UPDATE users SET active_group_id = $2 WHERE id = $1', [req.user.id, group.id]);
    return group.id;
  });
  res.status(201).json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

// Join with an invite code. The group_member_cap trigger rejects an 11th member (409 GROUP_FULL).
router.post('/groups/join', async (req, res) => {
  await requireCompleteProfile(pool, req.user.id);
  const code = readText(req.body.inviteCode, 'Invite code', { max: 12, required: true }).toUpperCase();
  const { rows: [group] } = await query('SELECT id, name FROM friend_groups WHERE invite_code = $1', [code]);
  if (!group) throw notFound('INVITE_NOT_FOUND', `No group has the invite code ${code}.`);
  await addMember(group, req.user.id);
  res.status(201).json({ group: await groupCard(group.id, { includeInviteCode: true }) });
});

router.get('/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const viewerGroupId = req.user.active_group_id;
  const card = await groupCard(groupId, { viewerGroupId });
  const [stats] = viewerGroupId && viewerGroupId !== groupId
    ? await loadRelationshipStats(pool, viewerGroupId, [groupId])
    : [];
  res.json({ group: { ...card, stats: stats ?? null } });
});

router.patch('/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertMember(pool, groupId, req.user.id);
  const name = readText(req.body.name, 'Group name', { max: 60, required: 'name' in req.body });
  const statusText = readText(req.body.statusText, 'Status', { max: 80 });
  await query(
    `UPDATE friend_groups
     SET name = coalesce($2, name),
         status_text = CASE WHEN $3 THEN $4 ELSE status_text END
     WHERE id = $1`,
    [groupId, name ?? null, statusText !== undefined, statusText ?? null],
  );
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

// A member adds a friend to the group.
router.post('/groups/:id/members', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.body.userId, 'userId');
  await assertMember(pool, groupId, req.user.id);
  const { rows: [user] } = await query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('USER_NOT_FOUND', 'That person does not exist.');
  const { rows: [group] } = await query('SELECT id, name FROM friend_groups WHERE id = $1', [groupId]);
  await addMember(group, userId);
  res.status(201).json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

async function addMember(group, userId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING RETURNING user_id`,
      [group.id, userId],
    );
    if (!rows.length) throw conflict('ALREADY_MEMBER', `Already a member of ${group.name}.`);
    // A match's chat holds both groups' members, so new members join the group's chats too
    // (skipping any chat that's already at the 30-person cap).
    await client.query(
      `INSERT INTO chat_participants (chat_id, user_id, group_id)
       SELECT c.id, $2, $1
       FROM chats c JOIN group_matches mt ON mt.id = c.match_id
       WHERE $1 IN (mt.group_low_id, mt.group_high_id)
         AND (SELECT count(*) FROM chat_participants x WHERE x.chat_id = c.id) < 30
       ON CONFLICT (chat_id, user_id) DO NOTHING`,
      [group.id, userId],
    );
    // Someone with no group yet gets this one as their active group.
    await client.query(
      'UPDATE users SET active_group_id = $2 WHERE id = $1 AND active_group_id IS NULL',
      [userId, group.id],
    );
  });
}

router.delete('/groups/:id/members/me', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertMember(pool, groupId, req.user.id);
  await withTransaction(async (client) => {
    // If this was the active group, the FK clears active_group_id; then fall back to another group.
    await client.query('DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2', [groupId, req.user.id]);
    await client.query('DELETE FROM chat_participants WHERE group_id = $1 AND user_id = $2', [groupId, req.user.id]);
    await client.query(
      `UPDATE users SET active_group_id = (
         SELECT group_id FROM group_memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1)
       WHERE id = $1 AND active_group_id IS NULL`,
      [req.user.id],
    );
    await client.query(
      'DELETE FROM friend_groups g WHERE g.id = $1 AND NOT EXISTS (SELECT 1 FROM group_memberships WHERE group_id = g.id)',
      [groupId],
    );
  });
  res.status(204).end();
});

export default router;
