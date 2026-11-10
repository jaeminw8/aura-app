-- aura sample data. Safe to re-run: empties every table first.
-- Demo user: #1 Avery Hansen, active group "Tuesday Crew".
--   * 2 incoming likes to Tuesday Crew (Court Crew, Film Fridays) -> Accept demo
--   * 1 existing match + chat: Tuesday Crew + Sunday Summit Club
--   * Wednesday Volleyball is full (10/10) -> GROUP_FULL demo

BEGIN;

TRUNCATE
  meetups, messages, chat_participants, chats,
  group_matches, group_likes, friendships, user_interests, interests,
  user_photos, group_memberships, friend_groups, users
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Users (active_group_id is set after memberships exist)
-- ---------------------------------------------------------------------------
INSERT INTO users (id, first_name, last_name, city, bio, age, gender, relationship_status, personality_traits, avatar_color) VALUES
  (1,  'Avery',  'Hansen', 'Provo, UT', 'Always down for a late-night taco run or a sunrise hike. Looking for a crew that actually follows through on plans.', 21, 'Woman', 'single', '{Outgoing,Planner}', '#FDDCCB'),
  (2,  'Ben',    'Kim',    'Provo, UT', 'Board game collector. I will teach you any game in under five minutes.', 22, 'Man', 'single', '{Chill,Funny}', '#DCEBFD'),
  (3,  'Chloe',  'Martin', 'Provo, UT', 'Setter on Wednesdays, baker on Sundays.', 20, 'Woman', 'in_a_relationship', '{Competitive,Warm}', '#DDF3E0'),
  (4,  'Diego',  'Ramos',  'Provo, UT', 'Guitar, tacos, repeat.', 23, 'Man', 'single', '{Easygoing,Creative}', '#F6DCF0'),
  (5,  'Emma',   'Wright', 'Provo, UT', 'Will review every movie we watch whether you ask or not.', 21, 'Woman', 'single', '{Curious,Introvert}', '#FFF1B8'),
  (6,  'Finn',   'Taylor', 'Provo, UT', 'Training for a half marathon. Bribe me with tacos.', 22, 'Man', 'married', '{Disciplined,Outgoing}', '#E6E1FF'),
  (7,  'Maya',   'Patel',  'Provo, UT', 'Climber and amateur photographer. Mornings are for mountains.', 22, 'Woman', 'single', '{Adventurous,Organizer}', '#FDDCCB'),
  (8,  'Theo',   'Nguyen', 'Provo, UT', 'Host of the most competitive board game nights in Utah County.', 24, 'Man', 'in_a_relationship', '{Funny,Host}', '#DCEBFD'),
  (9,  'Priya',  'Shah',   'Provo, UT', 'Pickleball by day, sourdough by night.', 21, 'Woman', 'single', '{Upbeat,Planner}', '#DDF3E0'),
  (10, 'Sam',    'Jensen', 'Provo, UT', 'Will bring a guitar to any hike.', 23, 'Nonbinary', 'prefer_not_to_say', '{Chill,Creative}', '#F6DCF0'),
  (11, 'Jordan', 'Reyes',  'Orem, UT',  'Bouldering most nights. Taco Tuesday loyalist.', 22, 'Man', 'single', '{Adventurous,Easygoing}', '#FFF1B8'),
  (12, 'Lena',   'Novak',  'Provo, UT', 'Runner, cinephile, board game rules lawyer.', 21, 'Woman', 'single', '{Curious,Competitive}', '#E6E1FF'),
  (13, 'Grace',  'Lee',    'Orem, UT',  'Organizer of Court Crew. Always taking photos.', 24, 'Woman', 'married', '{Organizer,Outgoing}', '#DDF3E0'),
  (14, 'Eli',    'Brooks', 'Orem, UT',  'New route idea every week.', 23, 'Man', 'single', '{Energetic,Funny}', '#DCEBFD'),
  (15, 'Noah',   'Carter', 'Orem, UT',  'Karaoke is a sport, change my mind.', 25, 'Man', 'its_complicated', '{Loud,Warm}', '#FDDCCB'),
  (16, 'Zoe',    'Adams',  'Provo, UT', 'Film minor, volleyball major.', 20, 'Woman', 'single', '{Creative,Chill}', '#F6DCF0');

-- Demo logins (Supabase Auth) survive a reset but lose their link: run npm run db:demo-accounts afterwards.

INSERT INTO user_photos (user_id, position, label) VALUES
  (1, 1, 'Photo 1'), (1, 2, 'Photo 2'),
  (2, 1, 'Photo 1'),
  (3, 1, 'Photo 1'), (3, 2, 'Photo 2'),
  (4, 1, 'Photo 1'),
  (5, 1, 'Photo 1'),
  (6, 1, 'Photo 1'), (6, 2, 'Photo 2'), (6, 3, 'Photo 3'),
  (7, 1, 'Photo 1'), (7, 2, 'Photo 2'),
  (8, 1, 'Photo 1'),
  (9, 1, 'Photo 1'),
  (10, 1, 'Photo 1'),
  (11, 1, 'Photo 1'),
  (12, 1, 'Photo 1'), (12, 2, 'Photo 2'),
  (13, 1, 'Photo 1'),
  (14, 1, 'Photo 1'),
  (15, 1, 'Photo 1'),
  (16, 1, 'Photo 1');

-- ---------------------------------------------------------------------------
-- Interests (the first two a user added are their "top 2")
-- ---------------------------------------------------------------------------
INSERT INTO interests (id, name) VALUES
  (1, 'Hiking'), (2, 'Board games'), (3, 'Tacos'), (4, 'Live music'),
  (5, 'Pickleball'), (6, 'Climbing'), (7, 'Film'), (8, 'Baking'),
  (9, 'Guitar'), (10, 'Running'), (11, 'Volleyball'), (12, 'Photography'),
  (13, 'Coffee'), (14, 'Cooking'), (15, 'Video games'), (16, 'Karaoke');

INSERT INTO user_interests (user_id, interest_id, added_at)
SELECT user_id, interest_id, now() - interval '30 days' + ord * interval '1 hour'
FROM (VALUES
  (1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4), (1, 5, 5),
  (2, 2, 1), (2, 15, 2), (2, 13, 3),
  (3, 11, 1), (3, 8, 2), (3, 1, 3),
  (4, 3, 1), (4, 9, 2), (4, 11, 3),
  (5, 7, 1), (5, 13, 2), (5, 2, 3),
  (6, 10, 1), (6, 11, 2), (6, 3, 3),
  (7, 1, 1), (7, 6, 2), (7, 12, 3),
  (8, 2, 1), (8, 7, 2), (8, 13, 3),
  (9, 5, 1), (9, 8, 2),
  (10, 1, 1), (10, 9, 2), (10, 11, 3),
  (11, 6, 1), (11, 3, 2),
  (12, 2, 1), (12, 10, 2), (12, 7, 3),
  (13, 5, 1), (13, 12, 2), (13, 11, 3),
  (14, 10, 1), (14, 5, 2), (14, 7, 3),
  (15, 11, 1), (15, 16, 2), (15, 5, 3),
  (16, 7, 1), (16, 16, 2), (16, 11, 3)
) AS v(user_id, interest_id, ord);

-- ---------------------------------------------------------------------------
-- Friendships (stored once per pair, low id first)
-- ---------------------------------------------------------------------------
INSERT INTO friendships (user_low_id, user_high_id) VALUES
  (1, 2), (1, 3), (1, 4), (2, 5), (3, 6), (4, 6),          -- inside Tuesday Crew
  (7, 8), (7, 9), (8, 12), (10, 11),                       -- inside Sunday Summit Club
  (1, 7), (1, 9), (3, 11), (4, 8), (6, 12),                -- Tuesday Crew <-> Summit Club
  (2, 13), (5, 14),                                        -- Tuesday Crew <-> Court Crew
  (9, 13), (13, 15), (14, 16);

-- ---------------------------------------------------------------------------
-- Friend groups and memberships
-- ---------------------------------------------------------------------------
INSERT INTO friend_groups (id, name, city, latitude, longitude, status_text, photo_label, avatar_color, invite_code, created_by) VALUES
  (1, 'Tuesday Crew',         'Provo, UT', 40.233800, -111.658500, 'Up for game night this Friday',       'Group photo', '#E6E1FF', 'TUESDAY1', 1),
  (2, 'Wednesday Volleyball', 'Provo, UT', 40.249000, -111.649300, 'Need a sub for league night',         'Group photo', '#DDF3E0', 'SPIKE010', 3),
  (3, 'Sunday Summit Club',   'Provo, UT', 40.250500, -111.645000, 'Looking for people this weekend',     'Group photo', '#DCEBFD', 'SUMMIT77', 7),
  (4, 'Court Crew',           'Orem, UT',  40.296900, -111.694600, 'Open play Thursday nights',           'Group photo', '#FDDCCB', 'COURTS55', 13),
  (5, 'Film Fridays',         'Provo, UT', 40.240000, -111.640000, 'Picking next week''s double feature', 'Group photo', '#F6DCF0', 'REEL2026', 8);

INSERT INTO group_memberships (group_id, user_id, role, joined_at) VALUES
  (1, 1, 'owner', now() - interval '120 days'), (1, 2, 'member', now() - interval '118 days'),
  (1, 3, 'member', now() - interval '110 days'), (1, 4, 'member', now() - interval '100 days'),
  (1, 5, 'member', now() - interval '90 days'),  (1, 6, 'member', now() - interval '60 days'),

  (2, 3, 'owner', now() - interval '200 days'),  (2, 1, 'member', now() - interval '150 days'),
  (2, 4, 'member', now() - interval '150 days'), (2, 6, 'member', now() - interval '140 days'),
  (2, 10, 'member', now() - interval '130 days'),(2, 12, 'member', now() - interval '120 days'),
  (2, 13, 'member', now() - interval '110 days'),(2, 14, 'member', now() - interval '100 days'),
  (2, 15, 'member', now() - interval '90 days'), (2, 16, 'member', now() - interval '80 days'),

  (3, 7, 'owner', now() - interval '300 days'),  (3, 8, 'member', now() - interval '280 days'),
  (3, 9, 'member', now() - interval '250 days'), (3, 10, 'member', now() - interval '200 days'),
  (3, 11, 'member', now() - interval '180 days'),(3, 12, 'member', now() - interval '170 days'),

  (4, 13, 'owner', now() - interval '90 days'),  (4, 9, 'member', now() - interval '80 days'),
  (4, 11, 'member', now() - interval '70 days'), (4, 14, 'member', now() - interval '60 days'),
  (4, 15, 'member', now() - interval '50 days'),

  (5, 8, 'owner', now() - interval '60 days'),   (5, 12, 'member', now() - interval '55 days'),
  (5, 13, 'member', now() - interval '50 days'), (5, 14, 'member', now() - interval '45 days'),
  (5, 16, 'member', now() - interval '40 days');

UPDATE users u SET active_group_id = v.group_id
FROM (VALUES
  (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1),
  (7, 3), (8, 3), (9, 3), (10, 3), (11, 3), (12, 3),
  (13, 4), (14, 4), (15, 4), (16, 2)
) AS v(user_id, group_id)
WHERE u.id = v.user_id;

-- ---------------------------------------------------------------------------
-- Likes and the one existing match
-- ---------------------------------------------------------------------------
INSERT INTO group_likes (id, from_group_id, to_group_id, liked_by_user_id, decision, created_at) VALUES
  (1, 4, 1, 13, 'connect', now() - interval '5 hours'),   -- Court Crew  -> Tuesday Crew (pending)
  (2, 5, 1, 8,  'connect', now() - interval '1 day'),     -- Film Fridays -> Tuesday Crew (pending)
  (3, 1, 3, 1,  'connect', now() - interval '3 days'),    -- Tuesday Crew -> Summit Club
  (4, 3, 1, 7,  'connect', now() - interval '2 days'),    -- Summit Club  -> Tuesday Crew => match
  (5, 3, 2, 10, 'pass',    now() - interval '4 days');    -- Summit Club passed on Volleyball

INSERT INTO group_matches (id, group_low_id, group_high_id, matched_at) VALUES
  (1, 1, 3, now() - interval '2 days');

INSERT INTO chats (id, match_id, name, created_at) VALUES
  (1, 1, 'Tuesday Crew + Sunday Summit Club', now() - interval '2 days');

INSERT INTO chat_participants (chat_id, user_id, group_id, joined_at, last_read_at)
SELECT 1, gm.user_id, gm.group_id, now() - interval '2 days',
       CASE WHEN gm.user_id = 1 THEN now() - interval '3 hours' ELSE now() END
FROM group_memberships gm
WHERE gm.group_id IN (1, 3);

INSERT INTO messages (chat_id, sender_user_id, body, created_at) VALUES
  (1, 7,  'Hey Tuesday Crew! Stoked we matched.',                       now() - interval '2 days'),
  (1, 1,  'Same! Are you all still doing the Y Trail hike Saturday?',   now() - interval '2 days' + interval '12 minutes'),
  (1, 7,  'Yes! You should come.',                                      now() - interval '1 day'),
  (1, 2,  'Count me in. Board game night after?',                       now() - interval '1 day' + interval '5 minutes'),
  (1, 8,  'My place Friday at 8, bring snacks',                         now() - interval '2 hours'),
  (1, 12, 'I''ll bring the new expansion',                              now() - interval '90 minutes'),
  (1, 7,  'Trailhead at 6:15, bring headlamps',                         now() - interval '40 minutes');

-- Tuesday Crew and Sunday Summit Club already met up once (feeds KR4 in okr_metrics).
INSERT INTO meetups (match_id, confirmed_by_user_id, created_at) VALUES
  (1, 1, now() - interval '1 day');

-- Explicit ids above don't advance identity sequences; catch them up.
SELECT setval(pg_get_serial_sequence('users', 'id'),         (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('interests', 'id'),     (SELECT max(id) FROM interests));
SELECT setval(pg_get_serial_sequence('friend_groups', 'id'), (SELECT max(id) FROM friend_groups));
SELECT setval(pg_get_serial_sequence('group_likes', 'id'),   (SELECT max(id) FROM group_likes));
SELECT setval(pg_get_serial_sequence('group_matches', 'id'), (SELECT max(id) FROM group_matches));
SELECT setval(pg_get_serial_sequence('chats', 'id'),         (SELECT max(id) FROM chats));

COMMIT;
