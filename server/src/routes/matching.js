// Find (recommendations + swipes) and the "Groups that liked you" inbox.
import { Router } from 'express';
import { pool, query, withTransaction } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { actingGroupId, requireGroup } from '../middleware/auth.js';
import { loadChatRows } from '../lib/chats.js';
import { loadGroupCards, loadRelationshipStats } from '../lib/groups.js';
import { recordDecision } from '../lib/matching.js';
import { parseId } from '../lib/validate.js';

const router = Router();

router.get('/recommendations', requireGroup, async (req, res) => {
  const groupId = actingGroupId(req, req.query.groupId);
  // Exclude the user's own groups and any group the active group already liked, passed or matched.
  const { rows } = await query(
    `SELECT fg.id FROM friend_groups fg
     WHERE fg.id <> $1
       AND NOT EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.group_id = fg.id AND gm.user_id = $2)
       AND NOT EXISTS (SELECT 1 FROM group_likes l WHERE l.from_group_id = $1 AND l.to_group_id = fg.id)
       AND NOT EXISTS (SELECT 1 FROM group_matches mt
                       WHERE mt.group_low_id = LEAST($1::bigint, fg.id) AND mt.group_high_id = GREATEST($1::bigint, fg.id))`,
    [groupId, req.user.id],
  );
  const stats = await loadRelationshipStats(pool, groupId, rows.map((r) => r.id)); // ranked
  const cards = await loadGroupCards(pool, stats.map((s) => s.groupId), { viewerGroupId: groupId });
  const { rows: [acting] } = await query('SELECT id, name FROM friend_groups WHERE id = $1', [groupId]);
  res.json({
    actingGroup: acting,
    total: cards.length,
    recommendations: cards.map((card, i) => ({ ...card, stats: stats[i] })),
  });
});

// Find: "Connect" or "Not now" on behalf of the active group.
router.post('/groups/:id/likes', requireGroup, async (req, res) => {
  const fromGroupId = actingGroupId(req, req.params.id);
  const toGroupId = parseId(req.body.toGroupId, 'toGroupId');
  const result = await withTransaction((client) =>
    recordDecision(client, { fromGroupId, toGroupId, userId: req.user.id, decision: req.body.decision }),
  );
  const [chat] = result.chatId
    ? await loadChatRows(pool, req.user.id, fromGroupId, { chatIds: [result.chatId], view: 'any' })
    : [];
  res.status(201).json({
    like: { id: result.like.id, toGroupId, decision: result.like.decision },
    matched: Boolean(result.match),
    match: result.match,
    chat: chat ?? null,
  });
});

router.get('/groups/:id/incoming-likes', requireGroup, async (req, res) => {
  const groupId = actingGroupId(req, req.params.id);
  // Pending = they said connect, and we haven't answered (no like/pass back) or matched.
  // Requests from another group the viewer is also in are hidden from them: they can't accept or
  // decline those (OWN_GROUP), so leave them to members who aren't in both groups.
  const { rows } = await query(
    `SELECT l.id, l.from_group_id, l.created_at, u.first_name AS liked_by_first_name
     FROM group_likes l JOIN users u ON u.id = l.liked_by_user_id
     WHERE l.to_group_id = $1 AND l.decision = 'connect'
       AND NOT EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.group_id = l.from_group_id AND gm.user_id = $2)
       AND NOT EXISTS (SELECT 1 FROM group_likes r WHERE r.from_group_id = $1 AND r.to_group_id = l.from_group_id)
       AND NOT EXISTS (SELECT 1 FROM group_matches mt
                       WHERE mt.group_low_id = LEAST($1::bigint, l.from_group_id)
                         AND mt.group_high_id = GREATEST($1::bigint, l.from_group_id))
     ORDER BY l.created_at DESC`,
    [groupId, req.user.id],
  );
  const fromIds = rows.map((r) => r.from_group_id);
  const [cards, stats] = await Promise.all([
    loadGroupCards(pool, fromIds, { viewerGroupId: groupId }),
    loadRelationshipStats(pool, groupId, fromIds),
  ]);
  const cardBy = new Map(cards.map((c) => [c.id, c]));
  const statsBy = new Map(stats.map((s) => [s.groupId, s]));
  res.json({
    groupId,
    likes: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      likedBy: { firstName: r.liked_by_first_name },
      group: { ...cardBy.get(r.from_group_id), stats: statsBy.get(r.from_group_id) },
    })),
  });
});

async function loadIncomingLike(client, likeId, user) {
  const { rows: [like] } = await client.query(
    'SELECT id, from_group_id, to_group_id, decision FROM group_likes WHERE id = $1 FOR UPDATE',
    [likeId],
  );
  if (!like) throw notFound('LIKE_NOT_FOUND', 'That request no longer exists.');
  if (like.to_group_id !== user.active_group_id) {
    throw forbidden('NOT_ACTIVE_GROUP', 'Switch to the group this request was sent to first.');
  }
  if (like.decision !== 'connect') throw conflict('NOT_A_REQUEST', 'That group passed, so there is nothing to accept.');
  return like;
}

// The vertical slice: accept = our group says "connect" back, which creates the
// match, the chat and its participants in one transaction, and returns the new chat.
router.post('/likes/:id/accept', requireGroup, async (req, res) => {
  const likeId = parseId(req.params.id, 'like id');
  const result = await withTransaction(async (client) => {
    const like = await loadIncomingLike(client, likeId, req.user);
    return recordDecision(client, {
      fromGroupId: like.to_group_id,
      toGroupId: like.from_group_id,
      userId: req.user.id,
      decision: 'connect',
    });
  });
  const [chat] = await loadChatRows(pool, req.user.id, req.user.active_group_id, {
    chatIds: [result.chatId],
    view: 'any',
  });
  res.status(201).json({ likeId, match: result.match, chat });
});

// Decline = our group passes on them; the request disappears and they won't be recommended.
router.post('/likes/:id/decline', requireGroup, async (req, res) => {
  const likeId = parseId(req.params.id, 'like id');
  await withTransaction(async (client) => {
    const like = await loadIncomingLike(client, likeId, req.user);
    await recordDecision(client, {
      fromGroupId: like.to_group_id,
      toGroupId: like.from_group_id,
      userId: req.user.id,
      decision: 'pass',
    });
  });
  res.json({ likeId, declined: true });
});

export default router;
