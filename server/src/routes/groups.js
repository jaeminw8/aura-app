import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, query, withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
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
  const city = readText(req.body.city, 'City', { max: 80 }) ?? req.user.city;
  const inviteCode = crypto.randomBytes(8).toString('hex').slice(0, 12).toUpperCase();

  const groupId = await withTransaction(async (client) => {
    const { rows: [group] } = await client.query(
      `INSERT INTO friend_groups (name, city, invite_code, avatar_color, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, city, inviteCode, randomPastel(), req.user.id],
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
  const { rows: [membership] } = await query(
    'SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [group.id, req.user.id],
  );
  if (membership) {
    await query('UPDATE users SET active_group_id = $2 WHERE id = $1', [req.user.id, group.id]);
    return res.json({ group: await groupCard(group.id, { includeInviteCode: true }) });
  }
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

router.get('/groups/:groupId/members/:userId/profile', async (req, res) => {
  const groupId = parseId(req.params.groupId, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  const { rows: [profile] } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.city, u.bio, u.age, u.gender,
            u.relationship_status, u.personality_traits, u.avatar_color,
            COALESCE((SELECT json_agg(json_build_object('id', p.id, 'label', p.label, 'imageUrl', p.image_url)
                      ORDER BY p.position) FROM user_photos p WHERE p.user_id = u.id), '[]') AS photos,
            COALESCE((SELECT array_agg(i.name ORDER BY i.name) FROM user_interests ui
                      JOIN interests i ON i.id = ui.interest_id WHERE ui.user_id = u.id), '{}') AS interests
     FROM users u JOIN group_memberships gm ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND u.id = $2`,
    [groupId, userId],
  );
  if (!profile) throw notFound('MEMBER_NOT_FOUND', 'That group member could not be found.');
  res.json({ profile: {
    id: profile.id, firstName: profile.first_name, lastName: profile.last_name,
    city: profile.city, bio: profile.bio, age: profile.age, gender: profile.gender,
    relationshipStatus: profile.relationship_status, personalityTraits: profile.personality_traits,
    avatarColor: profile.avatar_color, photos: profile.photos, interests: profile.interests,
  } });
});

router.patch('/groups/:id', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  await assertMember(pool, groupId, req.user.id);
  const name = readText(req.body.name, 'Group name', { max: 60, required: 'name' in req.body });
  await query(
    `UPDATE friend_groups
     SET name = coalesce($2, name)
     WHERE id = $1`,
    [groupId, name ?? null],
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

async function assertOwner(db, groupId, userId) {
  const { rows: [membership] } = await db.query(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  if (!membership) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  if (membership.role !== 'owner') throw forbidden('OWNER_REQUIRED', 'Only the group owner can remove members.');
}

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

router.delete('/groups/:id/members/:userId', async (req, res) => {
  const groupId = parseId(req.params.id, 'group id');
  const userId = parseId(req.params.userId, 'user id');
  await assertOwner(pool, groupId, req.user.id);
  if (userId === req.user.id) throw conflict('OWNER_CANNOT_REMOVE_SELF', 'Use Leave group to leave your own group.');
  await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      'DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    if (!rowCount) throw notFound('MEMBER_NOT_FOUND', 'That person is not a member of this group.');
    await client.query('DELETE FROM chat_participants WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    await client.query(
      `UPDATE users SET active_group_id = (
         SELECT group_id FROM group_memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1)
       WHERE id = $1 AND active_group_id IS NULL`,
      [userId],
    );
  });
  res.json({ group: await groupCard(groupId, { includeInviteCode: true }) });
});

export default router;
