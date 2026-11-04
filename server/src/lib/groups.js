import { forbidden, notFound } from '../errors.js';
import { groupInitials, userInitials } from './format.js';

export const MAX_MEMBERS = 10;

export async function assertMember(db, groupId, userId) {
  const { rows } = await db.query(
    `SELECT g.id, EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = g.id AND m.user_id = $2) AS is_member
     FROM friend_groups g WHERE g.id = $1`,
    [groupId, userId],
  );
  if (!rows[0]) throw notFound('GROUP_NOT_FOUND', 'That friend group does not exist.');
  if (!rows[0].is_member) throw forbidden('NOT_A_MEMBER', 'You are not a member of that group.');
}

// Everything a group card shows: header, members with top 2 interests,
// and interests (flagged "shared" when the viewer group has them too).
export async function loadGroupCards(db, groupIds, { viewerGroupId = null, includeInviteCode = false } = {}) {
  if (!groupIds.length) return [];
  const [groups, members, interests] = await Promise.all([
    db.query(
      `SELECT g.id, g.name, g.city, g.status_text, g.photo_label, g.avatar_color, g.invite_code,
              (SELECT count(*) FROM group_memberships m WHERE m.group_id = g.id) AS member_count
       FROM friend_groups g WHERE g.id = ANY($1)`,
      [groupIds],
    ),
    db.query(
      `SELECT gm.group_id, gm.role, u.id, u.first_name, u.last_name, u.avatar_color,
              ARRAY(SELECT i.name FROM user_interests ui JOIN interests i ON i.id = ui.interest_id
                    WHERE ui.user_id = u.id ORDER BY ui.added_at, i.name LIMIT 2) AS top_interests
       FROM group_memberships gm JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ANY($1)
       ORDER BY gm.joined_at, u.id`,
      [groupIds],
    ),
    db.query(
      `SELECT s.group_id, s.interest_id, s.interest_name, s.member_count, (v.interest_id IS NOT NULL) AS shared
       FROM group_shared_interests s
       LEFT JOIN group_shared_interests v ON v.group_id = $2::bigint AND v.interest_id = s.interest_id
       WHERE s.group_id = ANY($1)
       ORDER BY shared DESC, s.member_count DESC, s.interest_name`,
      [groupIds, viewerGroupId],
    ),
  ]);

  const byGroup = (rows) => {
    const map = new Map();
    for (const row of rows) map.set(row.group_id, [...(map.get(row.group_id) ?? []), row]);
    return map;
  };
  const membersBy = byGroup(members.rows);
  const interestsBy = byGroup(interests.rows);

  const cards = new Map(groups.rows.map((g) => [g.id, {
    id: g.id,
    name: g.name,
    initials: groupInitials(g.name),
    avatarColor: g.avatar_color,
    city: g.city,
    statusText: g.status_text,
    photoLabel: g.photo_label,
    ...(includeInviteCode && { inviteCode: g.invite_code }),
    memberCount: g.member_count,
    maxMembers: MAX_MEMBERS,
    isFull: g.member_count >= MAX_MEMBERS,
    members: (membersBy.get(g.id) ?? []).map((m) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      initials: userInitials(m.first_name, m.last_name),
      avatarColor: m.avatar_color,
      role: m.role,
      topInterests: m.top_interests,
    })),
    interests: (interestsBy.get(g.id) ?? []).map((i) => ({
      id: i.interest_id, name: i.interest_name, memberCount: i.member_count, shared: i.shared,
    })),
  }]));
  // Keep the caller's order (recommendations arrive ranked).
  return groupIds.map((id) => cards.get(id)).filter(Boolean);
}

// How each candidate group relates to the viewer group, ranked:
// (1) shared interests, (2) mutual friends: 1st-degree then 2nd-degree, (3) same city, then distance.
// A candidate member counts as a 1st-degree mutual friend if they're friends with anyone in the
// viewer group; 2nd-degree if they're a friend of one of those friends.
export async function loadRelationshipStats(db, viewerGroupId, candidateIds) {
  if (!candidateIds.length) return [];
  const { rows } = await db.query(
    `WITH viewer AS (SELECT id, city, latitude, longitude FROM friend_groups WHERE id = $1),
     viewer_members   AS (SELECT user_id FROM group_memberships WHERE group_id = $1),
     viewer_interests AS (SELECT interest_id FROM group_shared_interests WHERE group_id = $1),
     friend_edges AS (
       SELECT user_low_id AS a, user_high_id AS b FROM friendships
       UNION ALL
       SELECT user_high_id, user_low_id FROM friendships),
     first_degree  AS (SELECT DISTINCT e.b AS user_id FROM friend_edges e JOIN viewer_members vm ON vm.user_id = e.a),
     second_degree AS (SELECT DISTINCT e.b AS user_id FROM friend_edges e JOIN first_degree f ON f.user_id = e.a)
     SELECT c.id AS group_id,
       (SELECT count(*) FROM group_shared_interests s
         WHERE s.group_id = c.id AND s.interest_id IN (SELECT interest_id FROM viewer_interests)) AS shared_interest_count,
       (SELECT count(*) FROM group_memberships m
         WHERE m.group_id = c.id
           AND m.user_id IN (SELECT user_id FROM first_degree)
           AND m.user_id NOT IN (SELECT user_id FROM viewer_members)) AS mutual_friends,
       (SELECT count(*) FROM group_memberships m
         WHERE m.group_id = c.id
           AND m.user_id IN (SELECT user_id FROM second_degree)
           AND m.user_id NOT IN (SELECT user_id FROM first_degree)
           AND m.user_id NOT IN (SELECT user_id FROM viewer_members)) AS second_degree_friends,
       (c.city = v.city) AS same_city,
       round((3958.8 * 2 * asin(sqrt(
         power(sin(radians(c.latitude - v.latitude) / 2), 2) +
         cos(radians(v.latitude)) * cos(radians(c.latitude)) *
         power(sin(radians(c.longitude - v.longitude) / 2), 2))))::numeric, 1) AS distance_miles,
       EXISTS (SELECT 1 FROM group_likes l
               WHERE l.from_group_id = c.id AND l.to_group_id = $1 AND l.decision = 'connect') AS likes_you
     FROM friend_groups c CROSS JOIN viewer v
     WHERE c.id = ANY($2)
     ORDER BY shared_interest_count DESC, mutual_friends DESC, second_degree_friends DESC,
              same_city DESC, distance_miles ASC NULLS LAST, c.id`,
    [viewerGroupId, candidateIds],
  );
  return rows.map((r) => ({
    groupId: r.group_id,
    sharedInterestCount: r.shared_interest_count,
    mutualFriends: r.mutual_friends,
    secondDegreeFriends: r.second_degree_friends,
    sameCity: r.same_city,
    distanceMiles: r.distance_miles,
    likesYou: r.likes_you,
  }));
}
