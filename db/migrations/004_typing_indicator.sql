-- 004: typing indicator. Adds chat_participants.typing_at: when the person last typed in that chat
-- (NULL when they aren't typing). The API treats them as typing for 5 seconds after it.
-- Adds to an existing aura database WITHOUT wiping it, so it's safe on the shared Find Friends App
-- database. db/schema.sql already includes it for fresh builds.
-- Safe to re-run. Apply with: npm run db:migrate (before deploying the API that uses it).

BEGIN;

ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS typing_at timestamptz;

COMMIT;
